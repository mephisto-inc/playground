import { loadJSON, saveJSON, STORAGE_KEYS } from "../core/Storage.js";
import { ACHIEVEMENT_TARGETS, ACHIEVEMENTS } from "../config/achievements.js";

const registry = ACHIEVEMENTS.map((entry) => ({ ...entry }));
let unlocked = new Set(loadJSON(STORAGE_KEYS.achievements, []));
let runUnlocks = [];
const unlockListeners = new Set();
let damagedThisWave = false;
let endlessSeconds = 0;
let runTrailKills = 0;
let runPushes = 0;
let currentClassId = null;
let counters = loadJSON(STORAGE_KEYS.counters, {});

function saveCounters() {
  saveJSON(STORAGE_KEYS.counters, counters);
}

function bumpCounter(field, amount = 1) {
  counters[field] = (counters[field] || 0) + amount;
  saveCounters();
}

export function getAchievement(id) {
  return registry.find((entry) => entry.id === id);
}

export function getAchievementStatus() {
  return registry.map((entry) => ({
    ...entry,
    unlocked: unlocked.has(entry.id),
  }));
}

export function onUnlock(callback) {
  unlockListeners.add(callback);
}

export function unlockAchievement(id) {
  if (unlocked.has(id)) return false;
  const definition = getAchievement(id);
  if (!definition) return false;
  unlocked.add(id);
  runUnlocks.push(id);
  saveJSON(STORAGE_KEYS.achievements, [...unlocked]);
  for (const listener of [...unlockListeners]) {
    try {
      listener(definition);
    } catch (error) {
      console.error("Achievement unlock listener failed:", error);
    }
  }
  return true;
}

export function resetAchievements() {
  unlocked = new Set();
  runUnlocks = [];
  counters = {};
  saveJSON(STORAGE_KEYS.achievements, []);
  saveCounters();
}

export function recordKill(source, isBoss = false) {
  bumpCounter("kills");
  if (counters.kills >= ACHIEVEMENT_TARGETS.sharpshooterKills)
    unlockAchievement("sharpshooter");
  if (isBoss) {
    bumpCounter("bossKills");
    if (counters.bossKills >= ACHIEVEMENT_TARGETS.arenaChampionBosses)
      unlockAchievement("arenaChampion");
  }
  if (source === "trail") {
    runTrailKills++;
    if (runTrailKills >= ACHIEVEMENT_TARGETS.ghostTrailKills)
      unlockAchievement("ghostTrail");
  }
  if (source === "minion") {
    bumpCounter("minionKills");
    if (counters.minionKills >= ACHIEVEMENT_TARGETS.swarmMinionKills)
      unlockAchievement("swarm");
  }
}

export function recordPush() {
  bumpCounter("pushes");
  runPushes++;
  if (runPushes >= ACHIEVEMENT_TARGETS.powerShovePushes)
    unlockAchievement("powerShove");
}

export function recordDash() {
  bumpCounter("dashes");
  if (counters.dashes >= ACHIEVEMENT_TARGETS.blinkDashes)
    unlockAchievement("blink");
}

export function recordShieldBlock() {
  bumpCounter("shieldBlocks");
  if (counters.shieldBlocks >= ACHIEVEMENT_TARGETS.bulwarkBlocks)
    unlockAchievement("bulwark");
}

export function recordClassPlayed(classId) {
  currentClassId = classId;
  if (!counters.classesPlayed) counters.classesPlayed = [];
  if (!counters.classesPlayed.includes(classId)) {
    counters.classesPlayed.push(classId);
    saveCounters();
  }
  if (counters.classesPlayed.length >= ACHIEVEMENT_TARGETS.worldTourClasses)
    unlockAchievement("worldTour");
}

export function getPlayedClasses() {
  return counters.classesPlayed ? counters.classesPlayed.slice() : [];
}

export function recordCardCollected(runCardCount) {
  if (runCardCount >= ACHIEVEMENT_TARGETS.deckedOutCards)
    unlockAchievement("deckedOut");
}

const THE_50K_BY_CLASS = {
  pusher: "the50kPusher",
  dasher: "the50kDasher",
  anchor: "the50kAnchor",
};

export function markScore(total) {
  if (total < ACHIEVEMENT_TARGETS.the50kScore) return;
  const classAchievement = THE_50K_BY_CLASS[currentClassId];
  if (classAchievement) unlockAchievement(classAchievement);
}

export function getRunUnlocks() {
  return runUnlocks.slice();
}

export function resetRunTracking() {
  runUnlocks = [];
  damagedThisWave = false;
  endlessSeconds = 0;
  runTrailKills = 0;
  runPushes = 0;
}

export function onWaveStarted(wave, hearts) {
  damagedThisWave = false;
  if (wave >= 5) {
    unlockAchievement("endlessFrog");
    if (hearts === 1) unlockAchievement("closeCall");
  }
}

export function onWaveCleared(wave) {
  if (wave === 1) unlockAchievement("helloPond");
  if (wave === 4) unlockAchievement("crowdedPond");
  if (!damagedThisWave) unlockAchievement("untouchable");
}

export function onBossDefeated(wave) {
  if (wave === 3) unlockAchievement("pigeonProblem");
}

export function markPlayerDamaged() {
  damagedThisWave = true;
}

export function onEndlessTime(seconds) {
  endlessSeconds = seconds;
  if (endlessSeconds >= ACHIEVEMENT_TARGETS.marathonSeconds)
    unlockAchievement("marathonFrog");
}

export function checkNewRecord(commitResult) {
  if (commitResult.isRecord && commitResult.previousBest > 0) {
    unlockAchievement("newRecord");
  }
}
