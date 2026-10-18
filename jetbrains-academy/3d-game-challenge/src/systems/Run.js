import {getState, setState, STATE} from "../core/StateMachine.js";
import {snapCameraTo} from "../world/Camera.js";
import {DRAFT} from "../config/tuning.js";
import player, {applyCard, configureClass, getCollectedCards, isDead,} from "../entities/Player.js";
import {clearProjectiles} from "../entities/Projectile.js";
import {clearPickups} from "../entities/Pickup.js";
import {clearTrails} from "../entities/Trail.js";
import {clearMinions} from "../entities/Minion.js";
import {resetEnemies} from "../entities/Enemy.js";
import {resetBoss} from "../entities/Boss.js";
import {onPlayerDeath, onPowerupCollected, resetCombat} from "./Combat.js";
import {
  advanceAfterDraft,
  getSurvivalTimes,
  registerClearHandler,
  resetWaves,
  startRun as startWaves,
} from "./Waves.js";
import {openDraft, resetDraft} from "./PowerupDraft.js";
import {commitScore, getBestScore, resetScore} from "./Score.js";
import {checkNewRecord, getRunUnlocks, resetRunTracking,} from "./Achievements.js";

let initialized = false;
let lastCommit = null;
let bonusDraft = false;

export function initRun() {
  if (initialized) return;
  initialized = true;

  onPlayerDeath(() => endRun());

  registerClearHandler(() => {
    bonusDraft = false;
    openDraft();
    setState(STATE.POWERUP_DRAFT);
  });

  onPowerupCollected(() => openBonusDraft());
}

function openBonusDraft() {
  if (getState() !== STATE.WAVE_PLAYING) return;
  if (getCollectedCards().length >= DRAFT.maxCards) return;
  bonusDraft = true;
  openDraft();
  setState(STATE.POWERUP_DRAFT);
}

export function beginRun(classId, startWave = 1) {
  resetWorld();
  configureClass(classId);
  resetScore();
  resetRunTracking();
  resetDraft();
  bonusDraft = false;
  snapCameraTo(player.position);
  startWaves(startWave);
  setState(STATE.WAVE_PLAYING);
}

export function completeDraft(card) {
  applyCard(card);
  if (isDead()) {
    endRun();
    return;
  }
  if (bonusDraft) {
    bonusDraft = false;
  } else {
    advanceAfterDraft();
  }
  setState(STATE.WAVE_PLAYING);
}

function endRun() {
  clearMinions();
  lastCommit = commitScore();
  checkNewRecord(lastCommit);
  setState(STATE.GAME_OVER);
}

export function resetWorld() {
  clearProjectiles();
  clearPickups();
  clearTrails();
  clearMinions();
  resetBoss();
  resetEnemies();
  resetCombat();
  resetWaves();
}

export function getGameOverSummary() {
  return {
    score: lastCommit ? lastCommit.finalScore : 0,
    best: getBestScore(),
    isRecord: lastCommit ? lastCommit.isRecord : false,
    cards: getCollectedCards(),
    unlocked: getRunUnlocks(),
    times: getSurvivalTimes(),
  };
}
