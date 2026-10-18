import {QUALITY} from "../config/tuning.js";

function detectTier() {
  const override = new URLSearchParams(window.location.search).get(
    QUALITY.overrideParam,
  );
  if (QUALITY.overrides.includes(override)) return override;
  const mobile =
    navigator.maxTouchPoints > 0 &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return mobile ? QUALITY.mobileTier : QUALITY.desktopTier;
}

const tier = detectTier();
const config = QUALITY.tiers[tier];

const state = {
  dprCap: config.dprCap,
  shadowMapSize: config.shadowMapSize,
  shadowsEnabled: config.shadows,
  steps: 0,
};

const samples = [];
let windowStartedAt = 0;
let lastStepAt = 0;

export function getQualityState() {
  return {
    tier,
    steps: state.steps,
    dprCap: state.dprCap,
    shadowMapSize: state.shadowMapSize,
    shadowsEnabled: state.shadowsEnabled,
  };
}

export function getDprCap() {
  return state.dprCap;
}

export function getShadowMapSize() {
  return state.shadowMapSize;
}

export function getShadowType() {
  return config.shadowType;
}

export function isShadowsEnabled() {
  return state.shadowsEnabled;
}

export function isAntialiasEnabled() {
  return config.antialias;
}

export function isBlobShadowsEnabled() {
  return config.blobShadows || !state.shadowsEnabled;
}

export function isLambertTier() {
  return config.lambert;
}

function stepDown(now) {
  const limits = QUALITY.autoDowngrade;
  let description;
  if (state.dprCap > limits.minDprCap) {
    state.dprCap = Math.max(
      limits.minDprCap,
      Math.round((state.dprCap - limits.dprStep) * 100) / 100,
    );
    description = `DPR cap ${state.dprCap}`;
  } else if (config.shadows && state.shadowMapSize > limits.minShadowMapSize) {
    state.shadowMapSize = Math.max(
      limits.minShadowMapSize,
      Math.round(state.shadowMapSize / 2),
    );
    description = `shadow map ${state.shadowMapSize}`;
  } else if (state.shadowsEnabled) {
    state.shadowsEnabled = false;
    description = "shadows off";
  } else {
    return false;
  }

  state.steps += 1;
  lastStepAt = now;
  samples.length = 0;
  windowStartedAt = 0;
  console.info(`[quality] ${tier} step ${state.steps}: ${description}`);
  return true;
}

export function recordQualityFrame(frameDelta, inCombat) {
  if (
    !inCombat ||
    document.visibilityState !== "visible" ||
    !(frameDelta > 0)
  ) {
    samples.length = 0;
    windowStartedAt = 0;
    return false;
  }

  const now = performance.now();
  if (samples.length === 0) windowStartedAt = now;
  samples.push({time: now, deltaMs: frameDelta * 1000});

  const cutoff = now - QUALITY.autoDowngrade.windowMs;
  while (samples.length > 0 && samples[0].time < cutoff) samples.shift();

  const limits = QUALITY.autoDowngrade;
  if (now - windowStartedAt < limits.windowMs) return false;
  if (now - lastStepAt < limits.stepCooldownMs) return false;
  if (samples.length < 2) return false;

  const totalMs = samples.reduce((sum, sample) => sum + sample.deltaMs, 0);
  const averageFps = (samples.length * 1000) / totalMs;
  if (averageFps >= limits.targetFps) return false;

  return stepDown(now);
}
