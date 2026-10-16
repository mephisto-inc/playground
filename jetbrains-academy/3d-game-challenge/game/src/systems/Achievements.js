import { STORAGE_KEYS, loadJSON, saveJSON } from '../core/Storage.js';
import { ACHIEVEMENTS } from '../config/achievements.js';

// Achievements system: the unlock registry (seeded from config/achievements.js), the persisted
// set of earned ids in localStorage, and the run-scoped tracking needed to detect them.
//
// The registry is the single source of truth for what exists: registerAchievement() adds an
// entry at runtime, unregisterAchievement() removes one. Unlocks are permanent once earned; the
// game-over screen additionally shows only the ones unlocked during the run that just ended
// (getRunUnlocks), which is why runUnlocks is kept separate from the persisted set.

// The live registry, in display order. registerAchievement() appends, unregisterAchievement()
// removes.
let registry = ACHIEVEMENTS.map((entry) => ({ ...entry }));

// The persisted set of unlocked ids (an array in localStorage).
let unlocked = new Set(loadJSON(STORAGE_KEYS.achievements, []));

// Achievements unlocked during the current run, in unlock order (game-over recap).
let runUnlocks = [];

// Callbacks fired with the achievement definition on every fresh unlock (the toast UI
// subscribes here). A copy is iterated, so a listener may unsubscribe itself.
const unlockListeners = new Set();

// True while the current wave has taken no damage yet (Untouchable tracker). Reset on every
// wave start and set by markPlayerDamaged(); Combat calls that on any landed hit.
let damagedThisWave = false;

// Wave 5 survival seconds so far (Marathon Frog tracker).
let endlessSeconds = 0;

// --- Registry API -------------------------------------------------------------

// Adds a new achievement definition. `icon` and `description` get defaults when omitted.
// Returns false for an invalid or already-registered id.
export function registerAchievement(definition) {
    if (!definition || !definition.id) return false;
    if (registry.some((entry) => entry.id === definition.id)) return false;
    registry.push({ icon: '🏆', description: '', ...definition });
    return true;
}

// Removes an achievement definition. Its stored unlock is dropped too, so re-registering the
// same id later starts back from locked. Returns false when the id was not registered.
export function unregisterAchievement(id) {
    const before = registry.length;
    registry = registry.filter((entry) => entry.id !== id);
    if (registry.length === before) return false;
    unlocked.delete(id);
    runUnlocks = runUnlocks.filter((entryId) => entryId !== id);
    saveJSON(STORAGE_KEYS.achievements, [...unlocked]);
    return true;
}

// The registry entry for `id`, or undefined when it is not registered.
export function getAchievement(id) {
    return registry.find((entry) => entry.id === id);
}

// Full registry merged with unlock state, for the achievements panel UI.
export function getAchievementStatus() {
    return registry.map((entry) => ({ ...entry, unlocked: unlocked.has(entry.id) }));
}

// Subscribes `callback` to fresh unlocks; it receives the achievement definition.
export function onUnlock(callback) {
    unlockListeners.add(callback);
}

// --- Unlocking ----------------------------------------------------------------

// Unlocks `id` if it is not already unlocked. Returns true only for a fresh unlock, so callers
// can play a flash effect without re-triggering on repeats.
export function unlockAchievement(id) {
    if (unlocked.has(id)) return false;
    const definition = getAchievement(id);
    if (!definition) return false; // unknown id: never persist junk from a caller's typo
    unlocked.add(id);
    runUnlocks.push(id);
    saveJSON(STORAGE_KEYS.achievements, [...unlocked]);
    for (const listener of [...unlockListeners]) {
        try {
            listener(definition);
        } catch (error) {
            // A broken listener must never break the gameplay code that unlocked this.
            console.error('Achievement unlock listener failed:', error);
        }
    }
    return true;
}

export function isUnlocked(id) {
    return unlocked.has(id);
}

// Wipes every unlock (persisted and in-memory). Safe mid-run: the per-run trackers and the
// registry itself are untouched, so achievements can be earned again immediately.
export function resetAchievements() {
    unlocked = new Set();
    runUnlocks = [];
    saveJSON(STORAGE_KEYS.achievements, []);
}

// --- Run lifecycle hooks (called by Run / Waves / Combat) ---------------------

// Ids unlocked during the run that is ending (game-over screen recap).
export function getRunUnlocks() {
    return runUnlocks.slice();
}

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
