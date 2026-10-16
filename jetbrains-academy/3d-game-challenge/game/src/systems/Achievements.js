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

// Trail kills during the current run (Ghost Trail tracker); reset each run.
let runTrailKills = 0;

// Enemies shoved by the Pusher shockwave during the current run (Power Shove tracker); reset
// each run. A single-run target keeps the achievement reachable in one good Pusher run instead
// of a slow lifetime grind.
let runPushes = 0;

// Lifetime counters (persisted in localStorage under STORAGE_KEYS.counters). They feed the
// cumulative achievements: Sharpshooter (300 kills), Arena Champion (5 bosses), Bulwark
// (25 shield blocks), Blink (100 dashes), Swarm (100 minion kills) and World Tour (a run with
// each of the three classes). 'pushes' is still tracked here as a running stat, but Power Shove
// now counts within a single run (see recordPush).
let counters = loadJSON(STORAGE_KEYS.counters, {});

function saveCounters() {
    saveJSON(STORAGE_KEYS.counters, counters);
}

// Adds `amount` to one lifetime counter and persists the result.
function bumpCounter(field, amount = 1) {
    counters[field] = (counters[field] || 0) + amount;
    saveCounters();
}

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

// Wipes every unlock (persisted and in-memory) and the lifetime counters, so a wiped save starts
// from a truly clean slate (otherwise the very next kill would re-unlock a cumulative
// achievement from the old totals). Safe mid-run: the registry itself is untouched.
export function resetAchievements() {
    unlocked = new Set();
    runUnlocks = [];
    counters = {};
    saveJSON(STORAGE_KEYS.achievements, []);
    saveCounters();
}

// --- Lifetime / per-run trackers (called by the entities and Combat) -----------

// One enemy or boss died to `source` ('shot', 'minion', 'trail', 'reflect', 'shockwave',
// 'thorns'). Bosses additionally count toward Arena Champion.
export function recordKill(source, isBoss = false) {
    bumpCounter('kills');
    if (counters.kills >= 300) unlockAchievement('sharpshooter');
    if (isBoss) {
        bumpCounter('bossKills');
        if (counters.bossKills >= 5) unlockAchievement('arenaChampion');
    }
    if (source === 'trail') {
        runTrailKills++;
        if (runTrailKills >= 15) unlockAchievement('ghostTrail');
    }
    if (source === 'minion') {
        bumpCounter('minionKills');
        if (counters.minionKills >= 100) unlockAchievement('swarm');
    }
}

// One enemy shoved by the Pusher shockwave (Power Shove at 50 within a single run).
export function recordPush() {
    bumpCounter('pushes');
    runPushes++;
    if (runPushes >= 50) unlockAchievement('powerShove');
}

// One Dasher dash (Blink at 100 total).
export function recordDash() {
    bumpCounter('dashes');
    if (counters.dashes >= 100) unlockAchievement('blink');
}

// One physical hit cancelled by the Pusher shield (Bulwark at 25 total).
export function recordShieldBlock() {
    bumpCounter('shieldBlocks');
    if (counters.shieldBlocks >= 25) unlockAchievement('bulwark');
}

// The player was hurt and survived at exactly one heart (Close Call).
export function recordCloseCall() {
    unlockAchievement('closeCall');
}

// A run started with `classId` (World Tour once all three classes have been played).
export function recordClassPlayed(classId) {
    if (!counters.classesPlayed) counters.classesPlayed = [];
    if (!counters.classesPlayed.includes(classId)) {
        counters.classesPlayed.push(classId);
        saveCounters();
    }
    if (counters.classesPlayed.length >= 3) unlockAchievement('worldTour');
}

// How many cards the player holds this run (Decked Out at 12 in a single run).
export function recordCardCollected(runCardCount) {
    if (runCardCount >= 12) unlockAchievement('deckedOut');
}

// The run's live score reached the breaking point (The 50K). Called by Score.addScore on every
// gain, so the achievement pops the moment the counter crosses 50,000 mid-run.
const THE_50K_SCORE = 50_000;
export function markScore(total) {
    if (total >= THE_50K_SCORE) unlockAchievement('the50k');
}

// --- Run lifecycle hooks (called by Run / Waves / Combat) ---------------------

// Ids unlocked during the run that is ending (game-over screen recap).
export function getRunUnlocks() {
    return runUnlocks.slice();
}

// Fresh run: clears the per-run trackers (lifetime counters are untouched).
export function resetRunTracking() {
    runUnlocks = [];
    damagedThisWave = false;
    endlessSeconds = 0;
    runTrailKills = 0;
    runPushes = 0;
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
