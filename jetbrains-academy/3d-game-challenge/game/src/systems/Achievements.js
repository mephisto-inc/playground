import { STORAGE_KEYS, loadJSON, saveJSON } from '../core/Storage.js';

// Achievements system (GDD 7): the 8 unlock records, persisted in localStorage, plus the
// run-scoped tracking needed to detect them.
//
// Unlocks are permanent once earned; the game-over screen additionally shows only the ones
// unlocked during the run that just ended (getRunUnlocks), which is why runUnlocks is kept
// separate from the persisted set.

// The 8 achievements from the GDD table, in display order. Icons follow the GDD's emoji style
// (the same convention the class cards already use).
export const ACHIEVEMENTS = [
    { id: 'helloPond', name: 'Hello, Pond', icon: '🐸', description: 'Clear Wave 1.' },
    { id: 'pigeonProblem', name: 'Pigeon Problem', icon: '🐦', description: 'Defeat the Arena Lord in Wave 3.' },
    { id: 'crowdedPond', name: 'Crowded Pond', icon: '🐟', description: 'Clear Wave 4.' },
    { id: 'endlessFrog', name: 'Endless Frog', icon: '🌊', description: 'Reach Wave 5.' },
    { id: 'marathonFrog', name: 'Marathon Frog', icon: '⏱️', description: 'Survive 5 minutes in Wave 5.' },
    { id: 'untouchable', name: 'Untouchable', icon: '✨', description: 'Clear any wave without taking damage.' },
    { id: 'fullHearts', name: 'Full Hearts', icon: '💖', description: 'Reach the maximum of 7 hearts.' },
    { id: 'newRecord', name: 'New Record', icon: '🏆', description: 'Beat your own best score.' },
];

// The persisted set of unlocked ids (an array in localStorage).
let unlocked = new Set(loadJSON(STORAGE_KEYS.achievements, []));

// Achievements unlocked during the current run, in unlock order (game-over recap).
let runUnlocks = [];

// True while the current wave has taken no damage yet (Untouchable tracker). Reset on every
// wave start and set by markPlayerDamaged(); Combat calls that on any landed hit.
let damagedThisWave = false;

// Wave 5 survival seconds so far (Marathon Frog tracker).
let endlessSeconds = 0;

// Unlocks `id` if it is not already unlocked. Returns true only for a fresh unlock, so callers
// can play a flash effect without re-triggering on repeats.
export function unlockAchievement(id) {
    if (unlocked.has(id)) return false;
    const definition = ACHIEVEMENTS.find((entry) => entry.id === id);
    if (!definition) return false; // unknown id: never persist junk from a caller's typo
    unlocked.add(id);
    runUnlocks.push(id);
    saveJSON(STORAGE_KEYS.achievements, [...unlocked]);
    return true;
}

export function isUnlocked(id) {
    return unlocked.has(id);
}

// Full list merged with unlock state, for the achievements panel UI.
export function getAchievementStatus() {
    return ACHIEVEMENTS.map((entry) => ({ ...entry, unlocked: unlocked.has(entry.id) }));
}

// Ids unlocked during the run that is ending (game-over screen recap).
export function getRunUnlocks() {
    return runUnlocks.slice();
}

// --- Run lifecycle hooks (called by Run / Waves / Combat) --------------------

// Fresh run: clears the per-run trackers.
export function resetRunTracking() {
    runUnlocks = [];
    damagedThisWave = false;
    endlessSeconds = 0;
}

// A wave began: Endless Frog unlocks on reaching wave 5; the damage tracker restarts for the
// Untouchable check.
export function onWaveStarted(wave) {
    damagedThisWave = false;
    if (wave >= 5) unlockAchievement('endlessFrog');
}

// A wave was cleared (waves 1-4; wave 5 never ends). Checks the wave-specific unlocks and the
// no-damage wave clear.
export function onWaveCleared(wave) {
    if (wave === 1) unlockAchievement('helloPond');
    if (wave === 4) unlockAchievement('crowdedPond');
    if (!damagedThisWave) unlockAchievement('untouchable');
}

// A boss died. Pigeon Problem needs the wave-3 boss specifically.
export function onBossDefeated(wave) {
    if (wave === 3) unlockAchievement('pigeonProblem');
}

// Any landed hit on the player (Combat calls this after damagePlayer reports 'hit'/'dead').
export function markPlayerDamaged() {
    damagedThisWave = true;
}

// Wave 5 survival clock, advanced by Waves every frame while wave 5 runs.
export function onEndlessTime(seconds) {
    endlessSeconds = seconds;
    if (endlessSeconds >= 300) unlockAchievement('marathonFrog');
}

// Game over: evaluates New Record from Score.commitScore()'s result. The previous best must be
// above zero — beating a best of 0 is just a first run, not a record (user-confirmed).
export function checkNewRecord(commitResult) {
    if (commitResult.isRecord && commitResult.previousBest > 0) {
        unlockAchievement('newRecord');
    }
}
