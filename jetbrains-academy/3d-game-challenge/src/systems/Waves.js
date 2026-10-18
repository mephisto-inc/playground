import {ENEMY, SPAWN_POINTS} from "../config/tuning.js";
import {getWaveDef, TOTAL_WAVES} from "../config/waves.js";
import {getAliveCount, getEnemyRadius, setDoomScaling, setEndlessScaling, spawnEnemy,} from "../entities/Enemy.js";
import {getBossInfo, isBossAlive, setBossEndlessScaling, spawnBoss,} from "../entities/Boss.js";
import {getStats} from "../entities/Player.js";
import {isSpotFree} from "../core/Collision.js";
import {addScore, getScore} from "./Score.js";
import {onBossDefeated, onEndlessTime, onWaveCleared, onWaveStarted,} from "./Achievements.js";
import {setWaveStage} from "./Audio.js";

let clearHandler = null;

let wave = 0;
let waveElapsed = 0;
let runElapsed = 0;
let spawnTimer = 0;
let running = false;
let cleared = false;

let bossPending = false;
let bossWasAlive = false;
let scoreCheckpoint = null;

let doomTier = 0;

export function registerClearHandler(callback) {
  clearHandler = callback;
}

export function startRun(waveNumber = 1) {
  running = true;
  startWave(waveNumber);
}

export function resetWaves() {
  running = false;
  wave = 0;
  waveElapsed = 0;
  runElapsed = 0;
  spawnTimer = 0;
  cleared = false;
  bossPending = false;
  bossWasAlive = false;
  scoreCheckpoint = null;
  doomTier = 0;
}

export function advanceAfterDraft() {
  if (!cleared) return;
  startWave(wave + 1);
}

export function getWaveInfo() {
  return {
    wave,
    total: TOTAL_WAVES,
    waveElapsed,
    bossAlive: isBossAlive(),
    boss: getBossInfo(),
  };
}

export function getSurvivalTimes() {
  return {
    total: runElapsed,
    wave5: wave === 5 ? waveElapsed : 0,
  };
}

function startWave(number) {
  wave = number;
  waveElapsed = 0;
  spawnTimer = 0;
  cleared = false;

  const definition = getWaveDef(number);
  bossPending = !!definition.boss;
  bossWasAlive = false;

  scoreCheckpoint = null;

  if (number === 5) {
    setEndlessScaling(1, 1, 1);
    setBossEndlessScaling(1, 1);
  }

  onWaveStarted(number, getStats().hearts);
  setWaveStage(number, false);
}

export function updateWaves(delta) {
  if (!running || cleared) return;
  const definition = getWaveDef(wave);
  if (!definition) return;

  waveElapsed += delta;
  runElapsed += delta;

  const tier = doomTierForScore(getScore());
  if (tier !== doomTier) {
    doomTier = tier;
    setDoomScaling(Math.pow(2, tier), Math.pow(3, tier));
  }

  let growthHpMul = 1;
  let growthAttackMul = 1;
  if (wave === 5) {
    const minutes = waveElapsed / 60;
    growthHpMul = 1 + ENEMY.growthPerMinute * minutes;
    const growthSpeedMul = Math.min(
      1 + ENEMY.growthPerMinute * minutes,
      ENEMY.growthSpeedCap,
    );
    growthAttackMul = 1 + ENEMY.growthAttackPerMinute * minutes;
    setEndlessScaling(growthHpMul, growthSpeedMul, growthAttackMul);
    setBossEndlessScaling(growthSpeedMul, growthAttackMul);
    onEndlessTime(waveElapsed);
  }

  if (definition.boss && bossPending) {
    const gateOpen =
      scoreCheckpoint === null ||
      getScore() - scoreCheckpoint >= definition.bossRespawnScore;
    if (gateOpen) {
      const boss = spawnBoss(
        definition.bossHp * growthHpMul,
        definition.bossSpeedMul,
        definition.bossOrbSpeedMul,
        !!definition.bossKnockbackImmune,
        !!definition.bossHpRage,
      );
      if (boss) {
        bossPending = false;
        bossWasAlive = true;
        setWaveStage(wave, true);
      }
    }
  }

  if (bossWasAlive && !isBossAlive()) {
    bossWasAlive = false;
    onBossDefeated(wave);
    setWaveStage(wave, false);
    if (wave === 5) {
      scoreCheckpoint = getScore();
      bossPending = true;
    } else if (wave === 3) {
      clearWave();
      return;
    }
  }

  if (
    Number.isFinite(definition.duration) &&
    waveElapsed >= definition.duration
  ) {
    clearWave();
    return;
  }

  let interval = definition.spawnInterval;
  if (wave === 5 && definition.rampSeconds) {
    const t = Math.min(waveElapsed / definition.rampSeconds, 1);
    interval += (definition.spawnIntervalMin - definition.spawnInterval) * t;
    interval = Math.max(0.15, interval / growthAttackMul);
  }
  if (definition.bossSpawnRate && isBossAlive())
    interval /= definition.bossSpawnRate;

  spawnTimer += delta;
  while (spawnTimer >= interval) {
    spawnTimer -= interval;
    spawnOneEnemy(definition.pool);
  }
}

function doomTierForScore(score) {
  let tier = 0;
  let threshold = ENEMY.doomScore;
  let step = ENEMY.doomScore / 2;
  while (score >= threshold) {
    tier++;
    threshold += Math.ceil(step / 1000) * 1000;
    step /= 2;
  }
  return tier;
}

function spawnOneEnemy(pool) {
  if (getAliveCount() >= ENEMY.maxAlive) return;

  const typeId = pool[Math.floor(Math.random() * pool.length)];
  const radius = getEnemyRadius(typeId);

  const candidates = SPAWN_POINTS.map((point) => point);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const point of candidates) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * ENEMY.spawnJitter;
    const x = point.x + Math.cos(angle) * distance;
    const y = point.y + Math.sin(angle) * distance;
    if (isSpotFree(x, y, radius)) {
      spawnEnemy(typeId, {x, y});
      return;
    }
  }
}

function clearWave() {
  cleared = true;
  const definition = getWaveDef(wave);
  if (definition.clearBonusMul) addScore(definition.clearBonusMul * wave);
  onWaveCleared(wave);
  if (clearHandler) clearHandler(wave);
}
