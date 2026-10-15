import { AUDIO } from '../config/tuning.js';
import { assetUrl } from '../core/Assets.js';
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
// The AudioContext is created at startup and immediately tries to run on its own; browsers that
// block audio before a gesture keep it suspended (buffers still fetch and decode while
// suspended). In that case the first real interaction resumes playback and syncs the music to
// whatever state the game is already in — the menu music starts as early as the browser allows,
// never waiting for a later menu change.

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

let ctx = null;           // AudioContext, created at startup (suspended until the first gesture)
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

// Bumped by every setMusic() call. A buffer fetch that resolves after a newer swap (even one
// back to the same track) is stale and must not start its source — otherwise a quick A→B→A
// sequence could start two copies of A on top of each other.
let swapToken = 0;

// Wave/boss stage reported by Waves, used when (re)picking the music step.
let waveStage = { wave: 0, bossAlive: false };

// --- Lifecycle ---------------------------------------------------------------

// Every event that counts as a user gesture for audio unlocking. Browsers only accept a real
// activation, so several kinds are armed as the fallback.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'pointerup', 'touchend'];

// Called once from main.js at startup, before the model loads — the context and graph exist (and
// the buffers preload) while everything else is still loading, so no early gesture is missed.
// The same call subscribes to the state machine and tries to start audio right away.
export function initAudio() {
    onStateChange(handleStateChange);

    createContext(); // suspended in strict browsers; resume() needs a gesture there
    if (!ctx) return; // no Web Audio support: every call stays a silent no-op

    // Runs once, from whichever path wins the race (autoplay or the first gesture): syncs the
    // graph to the live state and loads the remaining tracks. The `started` guard makes the two
    // paths idempotent even when both fire around the same time.
    let started = false;
    const start = () => {
        if (started) return;
        started = true;
        for (const event of UNLOCK_EVENTS) window.removeEventListener(event, unlock, true);
        handleStateChange(getState(), null);
        preloadMusic();
    };

    // Fallback path for browsers that block audio before a gesture: resume on the first real
    // interaction and let start() take over.
    const unlock = () => {
        ctx.resume().then(() => {
            if (ctx.state === 'running') start(); // not running yet: stay armed for the next event
        }).catch(() => { /* audio is optional; the game plays silently */ });
    };

    // Best-effort autoplay: environments that allow sound without an interaction (embedded
    // previews, high-engagement sites) start the music on their own here. Everywhere else the
    // resume stays pending / rejects and the unlock listeners below handle the first gesture.
    if (ctx.state === 'running') {
        start();
    } else {
        ctx.resume().then(() => {
            if (ctx.state === 'running') start();
        }).catch(() => { /* blocked until a gesture */ });
    }

    // Skip arming the fallback when autoplay already won (started would be true here).
    if (!started) {
        for (const event of UNLOCK_EVENTS) window.addEventListener(event, unlock, true);
    }
}

// Creates the AudioContext and the fixed graph: music branch through the 400 Hz low-pass, SFX
// branch unfiltered, master gain at the end. The context starts suspended (browsers block audio
// before a gesture) but decoding works while suspended. Safe to call once; later calls no-op.
function createContext() {
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

    // Preload the tiny SFX and the menu track — the first one any unlock will ask for. The
    // remaining tracks load after the unlock, so startup never eats the whole soundtrack.
    for (const name of SFX_NAMES) getBuffer(`sfx_${name}.wav`).catch(() => {});
    getBuffer(TRACK_FILES.main_step1).catch(() => {});
}

// Warms the buffers of all music tracks (each is 9-19 s; decoding early avoids a silent gap on
// the first swap of a run).
function preloadMusic() {
    for (const file of Object.values(TRACK_FILES)) getBuffer(file).catch(() => {});
}

// --- Buffer loading ----------------------------------------------------------

// Fetches and decodes an asset once; subsequent calls return the same promise.
// assetUrl(): the audio files live under the base-relative assets folder so the game also works
// when deployed to a subpath (see vite.config.js).
function getBuffer(fileName) {
    if (!ctx) return Promise.reject(new Error('audio not started'));
    if (buffers.has(fileName)) return buffers.get(fileName);
    const promise = fetch(assetUrl(`/assets/${fileName}`))
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
    // Token for this swap, bumped before any early return: even a "no change" call invalidates
    // an older in-flight fetch, so a newer intent always wins.
    const token = ++swapToken;

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
            if (!buffer || ctx.state !== 'running' || token !== swapToken) return; // a newer swap won
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
    if (!ctx) return; // no Web Audio support; the unlock sync re-runs this
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
