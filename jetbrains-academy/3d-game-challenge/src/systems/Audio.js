import { AUDIO } from "../config/tuning.js";
import { assetUrl } from "../core/Assets.js";
import { clamp } from "../core/MathUtils.js";
import { loadNumber, saveNumber, STORAGE_KEYS } from "../core/Storage.js";
import { getState, onStateChange, STATE } from "../core/StateMachine.js";

const TRACK_FILES = {
  main_step1: "bgm_main_step1.wav",
  main_step2: "bgm_main_step2.wav",
  main_step3: "bgm_main_step3.wav",
  boss_step1: "bgm_boss_step1.wav",
  boss_step2: "bgm_boss_step2.wav",
  boss_step3: "bgm_boss_step3.wav",
};

const SFX_NAMES = [
  "jump",
  "shoot",
  "parry",
  "parry_failed",
  "dash",
  "minion_shot",
  "hit",
  "hurt",
  "boss_spawn",
  "heart",
  "card",
  "defeat",
];

function trackLength(id) {
  return id === "boss_step3" ? AUDIO.bossStep3Length : AUDIO.trackLength;
}

let ctx = null;
let masterGain = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;

let volume = loadNumber(STORAGE_KEYS.volume, AUDIO.masterVolumeDefault);
const buffers = new Map();
let current = null;
let swapToken = 0;
let waveStage = { wave: 0, bossAlive: false };
const UNLOCK_EVENTS = ["pointerdown", "keydown", "pointerup", "touchend"];

export function initAudio() {
  onStateChange(handleStateChange);

  createContext();
  if (!ctx) return;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    for (const event of UNLOCK_EVENTS)
      window.removeEventListener(event, unlock, true);
    handleStateChange(getState(), null);
    preloadMusic();
  };

  const unlock = () => {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") start();
      })
      .catch(() => {});
  };

  if (ctx.state === "running") {
    start();
  } else {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") start();
      })
      .catch(() => {});
  }

  if (!started) {
    for (const event of UNLOCK_EVENTS)
      window.addEventListener(event, unlock, true);
  }
}

function createContext() {
  if (ctx) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  ctx = new AudioCtor();

  masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.connect(masterGain);

  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = "lowpass";

  musicFilter.frequency.value = 22050;
  musicFilter.connect(masterGain);

  musicBus = ctx.createGain();
  musicBus.connect(musicFilter);

  for (const name of SFX_NAMES) getBuffer(`sfx_${name}.wav`).catch(() => {});
  getBuffer(TRACK_FILES.main_step1).catch(() => {});
}

function preloadMusic() {
  for (const file of Object.values(TRACK_FILES))
    getBuffer(file).catch(() => {});
}

function getBuffer(fileName) {
  if (!ctx) return Promise.reject(new Error("audio not started"));
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

export function playSfx(name, options = {}) {
  if (!ctx || ctx.state !== "running" || !sfxBus) return;
  getBuffer(`sfx_${name}.wav`)
    .then((buffer) => {
      if (!buffer || ctx.state !== "running") return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const pan = clampPan(options.pan || 0);
      if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        source.connect(panner);
        panner.connect(sfxBus);
      } else {
        source.connect(sfxBus);
      }
      source.start();
    })
    .catch(() => {});
}

export function playSfxAt(name, x, y, listenerX, listenerY) {
  const dx = x - listenerX;
  const dy = y - listenerY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-4) {
    playSfx(name);
    return;
  }
  const pan = (((dx + dy) * Math.SQRT1_2) / distance) * AUDIO.sfxPanMax;
  playSfx(name, { pan });
}

function clampPan(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -AUDIO.sfxPanMax, AUDIO.sfxPanMax);
}

function currentPosition() {
  if (!current) return 0;
  const elapsed = ctx.currentTime - current.startedAt;
  return (current.offset + elapsed) % trackLength(current.id);
}

function setMusic(id) {
  const token = ++swapToken;

  if (!ctx || ctx.state !== "running" || !musicBus) return;
  if (current && current.id === id) return;

  const long = id === "boss_step3" || (current && current.id === "boss_step3");
  const fade = long ? AUDIO.crossfadeLong : AUDIO.crossfadeSnappy;

  const position = currentPosition() % trackLength(id);

  getBuffer(TRACK_FILES[id])
    .then((buffer) => {
      if (!buffer || ctx.state !== "running" || token !== swapToken) return;
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

      const old = current;
      if (old) {
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(old.gain.gain.value, now);
        old.gain.gain.linearRampToValueAtTime(0, now + fade);
        try {
          old.source.stop(now + fade + 0.05);
        } catch {}
      }

      current = { id, source, gain, startedAt: now, offset: position };
    })
    .catch(() => {});
}

function setLowPass(engaged) {
  if (!musicFilter) return;
  const target = engaged ? AUDIO.lowPassHz : 22050;
  musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.03);
}

export function setMasterVolume(value) {
  volume = clamp(value, 0, 1);
  saveNumber(STORAGE_KEYS.volume, volume);
  if (masterGain && ctx)
    masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

export function getMasterVolume() {
  return volume;
}

export function setWaveStage(wave, bossAlive) {
  waveStage = { wave, bossAlive };
  if (getState() === STATE.WAVE_PLAYING) applyWaveMusic();
}

function applyWaveMusic() {
  let id;
  if (waveStage.wave === 3) id = "boss_step2";
  else if (waveStage.wave === 5)
    id = waveStage.bossAlive ? "boss_step3" : "main_step3";
  else id = "main_step2";
  setMusic(id);
}

function handleStateChange(state) {
  if (!ctx) return;
  if (state === STATE.POWERUP_DRAFT || state === STATE.PAUSE_MENU) {
    setLowPass(true);
    return;
  }
  if (state === STATE.GAME_OVER) {
    setLowPass(true);
    playSfx("defeat");
    if (waveStage.wave === 3 || waveStage.wave === 4) setMusic("boss_step1");
    return;
  }

  setLowPass(false);
  if (state === STATE.WAVE_PLAYING) applyWaveMusic();
  else if (state === STATE.MAIN_MENU || state === STATE.CHARACTER_SELECTION)
    setMusic("main_step1");
}
