import { AUDIO } from '../config/tuning.js';
import { STORAGE_KEYS, loadNumber, saveNumber } from '../core/Storage.js';
import { STATE, getState, onStateChange } from '../core/StateMachine.js';

// Audio system (GDD 2 + 8B/8C): the Web Audio engine for all music and sound effects.
//
// Graph:
//   music tracks -> musicBus gain -> low-pass filter -> masterGain -> destination
//   sfx          -> sfxBus gain ---------------------> masterGain -> destination
//
// The 400 Hz low-pass sits on the music branch only: PAUSE_MENU, POWERUP_DRAFT and GAME_OVER
// muffle the music while sound effects stay crisp (user-confirmed; GDD 1/2 say "music with the
// filter"). The master gain (persisted, driven by the pause panel) controls everything.
//
// Music is a set of looping tracks swapped by "step" (GDD 2A). The playing position survives
// every swap: the new track starts at `position modulo its own musical length`, which is
// simultaneously the GDD's two rules — "same position in seconds" going to the 19 s boss track
// and "position modulo 9" coming back to a 9 s track. Swaps into or out of `bgm_boss_step3`
// crossfade over AUDIO.crossfadeLong, every other swap over the snappier AUDIO.crossfadeSnappy.
//
// The AudioContext is created on the first user gesture (browsers refuse to start audio before
// one). Until then every call is a silent no-op, and the unlock handler syncs whatever state
// the game is already in.

// Short track ids -> asset file names (GDD 8B table).
const TRACK_FILES = {
    main_step1: 'bgm_main_step1.wav',
    main_step2: 'bgm_main_step2.wav',
    main_step3: 'bgm_main_step3.wav',
    boss_step1: 'bgm_boss_step1.wav',
    boss_step2: 'bgm_boss_step2.wav',
    boss_step3: 'bgm_boss_step3.wav',
};

// Every sound effect the game plays (GDD 8C): playSfx('jump') loads sfx_jump.wav.
const SFX_NAMES = [
    'jump', 'shoot', 'parry', 'parry_failed', 'dash', 'minion_shot',
    'hit', 'hurt', 'boss_spawn', 'heart', 'card', 'defeat',
];

// Musical loop length of each track — 9 s for all of them, 19 s for the wave-5 boss track
// (GDD 2B). Position math uses these values, not the files' exact decimal durations.
function trackLength(id) {
    return id === 'boss_step3' ? AUDIO.bossStep3Length : AUDIO.trackLength;
}

let ctx = null;           // AudioContext, created on first gesture
let masterGain = null;
let sfxBus = null;        // unfiltered branch
let musicBus = null;      // filtered branch input
let musicFilter = null;   // the 400 Hz low-pass

// Master volume (0..1), persisted; restored on startup.
let volume = loadNumber(STORAGE_KEYS.volume, AUDIO.masterVolumeDefault);

// Decoded-buffer cache, keyed by file name. Values are promises so concurrent requests for the
// same file share one fetch.
const buffers = new Map();

// The currently playing music track: { id, source, gain, startedAt, offset }. `offset` is the
// track position (seconds) the source began at; `startedAt` is the context time it began.
let current = null;

// Desired track while the context is still locked (before the first gesture).
let desiredTrack = 'main_step1';

// Wave/boss stage reported by Waves, used when (re)picking the music step.
let waveStage = { wave: 0, bossAlive: false };

// --- Lifecycle ---------------------------------------------------------------

// Called once from main.js at startup. Installs the gesture unlock and subscribes to the state
// machine; the AudioContext itself waits for the gesture.
export function initAudio() {
    onStateChange(handleStateChange);
    const unlock = () => {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        startAudio().catch(() => { /* audio is optional; the game plays silently */ });
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
}

// Builds the context and graph after the first gesture, then syncs the graph to whatever is
// happening in the game right now (the menu may have been open for a while).
async function startAudio() {
    if (ctx) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();

    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.connect(masterGain); // SFX bypass the low-pass on purpose

    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    // Default: wide open. The filter only closes when a filtered state is entered.
    musicFilter.frequency.value = 22050;
    musicFilter.connect(masterGain);

    musicBus = ctx.createGain();
    musicBus.connect(musicFilter);

    if (ctx.state === 'suspended') await ctx.resume();

    // Preload every SFX and the track the current state wants, in the background.
    for (const name of SFX_NAMES) getBuffer(`sfx_${name}.wav`).catch(() => {});
    handleStateChange(getState(), null); // sync filter + music with the live state
    preloadMusic();
}

// Warms the buffers of all music tracks (each is 9-19 s; decoding early avoids a silent gap on
// the first swap of a run).
function preloadMusic() {
    for (const file of Object.values(TRACK_FILES)) getBuffer(file).catch(() => {});
}

// --- Buffer loading ----------------------------------------------------------

// Fetches and decodes an asset once; subsequent calls return the same promise.
function getBuffer(fileName) {
    if (!ctx) return Promise.reject(new Error('audio not started'));
    if (buffers.has(fileName)) return buffers.get(fileName);
    const promise = fetch(`/assets/${fileName}`)
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
    buffers.set(fileName, promise);
    return promise;
}

// --- Sound effects -----------------------------------------------------------

// Plays a one-shot sound effect by short name ('jump', 'parry', ...). Silent no-op before the
// first gesture or if the asset failed to load — a missing sound must never break gameplay.
export function playSfx(name) {
    if (!ctx || ctx.state !== 'running' || !sfxBus) return;
    getBuffer(`sfx_${name}.wav`)
        .then((buffer) => {
            if (!buffer || ctx.state !== 'running') return;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(sfxBus);
            source.start();
        })
        .catch(() => { /* asset missing: stay silent */ });
}

// --- Music -------------------------------------------------------------------

// The current playback position in the active track, in seconds (0 when nothing plays).
function currentPosition() {
    if (!current) return 0;
    const elapsed = ctx.currentTime - current.startedAt;
    return (current.offset + elapsed) % trackLength(current.id);
}

// Switches to track `id`, keeping the playing position per the GDD rules (see the header).
// Called by the state handler and by Waves (setWaveStage).
export function setMusic(id) {
    desiredTrack = id;
    if (!ctx || ctx.state !== 'running' || !musicBus) return; // starts on the unlock sync
    if (current && current.id === id) return;

    // Crossfade length: long when the swap involves the 19-second boss track, snappy otherwise.
    const long = id === 'boss_step3' || (current && current.id === 'boss_step3');
    const fade = long ? AUDIO.crossfadeLong : AUDIO.crossfadeSnappy;

    // Position rule: seconds-modulo the TARGET track's musical length. For a 9 -> 19 s swap the
    // position is under 9 so it is preserved unchanged; coming back from the 19 s track it
    // becomes the GDD's "modulo 9"; 9 -> 9 swaps keep the seconds too.
    const position = currentPosition() % trackLength(id);

    getBuffer(TRACK_FILES[id])
        .then((buffer) => {
            if (!buffer || ctx.state !== 'running' || desiredTrack !== id) return; // a newer swap won
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const gain = ctx.createGain();
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1, now + fade);
            source.connect(gain);
            gain.connect(musicBus);
            source.start(0, position);

            // Fade the outgoing track out on top of its own current level, then stop it.
            const old = current;
            if (old) {
                old.gain.gain.cancelScheduledValues(now);
                old.gain.gain.setValueAtTime(old.gain.gain.value, now);
                old.gain.gain.linearRampToValueAtTime(0, now + fade);
                try { old.source.stop(now + fade + 0.05); } catch { /* already stopped */ }
            }

            current = { id, source, gain, startedAt: now, offset: position };
        })
        .catch(() => { /* music asset missing: stay silent */ });
}

// --- Low-pass, volume --------------------------------------------------------

// Engages/releases the 400 Hz low-pass on the music branch. A short time constant on the ramp
// keeps the transition click-free.
function setLowPass(engaged) {
    if (!musicFilter) return;
    const target = engaged ? AUDIO.lowPassHz : 22050;
    musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.03);
}

// Master volume (0..1), used by the pause panel. Persisted so it survives reloads.
export function setMasterVolume(value) {
    volume = Math.min(1, Math.max(0, value));
    saveNumber(STORAGE_KEYS.volume, volume);
    if (masterGain && ctx) masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

export function getMasterVolume() {
    return volume;
}

// --- State + wave reactions --------------------------------------------------

// Reports the current wave and whether a boss is alive (Waves calls this on wave start, boss
// spawn and boss death). While WAVE_PLAYING, the music step follows immediately.
export function setWaveStage(wave, bossAlive) {
    waveStage = { wave, bossAlive };
    if (getState() === STATE.WAVE_PLAYING) applyWaveMusic();
}

// The wave -> track table from GDD 2A:
//   wave 3            -> bgm_boss_step2 (the boss is alive from the start)
//   wave 5 + boss     -> bgm_boss_step3
//   wave 5, no boss   -> bgm_main_step3
//   waves 1, 2 and 4  -> bgm_main_step2
function applyWaveMusic() {
    let id;
    if (waveStage.wave === 3) id = 'boss_step2';
    else if (waveStage.wave === 5) id = waveStage.bossAlive ? 'boss_step3' : 'main_step3';
    else id = 'main_step2';
    setMusic(id);
}

// Reacts to the single state variable (GDD 1). The music step and position always survive
// POWERUP_DRAFT / PAUSE_MENU; only the filter changes. GAME_OVER keeps the current music except
// in waves 3 and 4, where it switches to bgm_boss_step1 (GDD 2A).
function handleStateChange(state) {
    if (!ctx) return; // context not unlocked yet; startAudio() re-runs this
    if (state === STATE.POWERUP_DRAFT || state === STATE.PAUSE_MENU) {
        setLowPass(true);
        return;
    }
    if (state === STATE.GAME_OVER) {
        setLowPass(true);
        playSfx('defeat'); // GDD 1 state table: GAME_OVER plays sfx_defeat
        if (waveStage.wave === 3 || waveStage.wave === 4) setMusic('boss_step1');
        return;
    }
    // MAIN_MENU, CHARACTER_SELECTION, WAVE_PLAYING: full sound.
    setLowPass(false);
    if (state === STATE.WAVE_PLAYING) applyWaveMusic();
    else if (state === STATE.MAIN_MENU || state === STATE.CHARACTER_SELECTION) setMusic('main_step1');
}
