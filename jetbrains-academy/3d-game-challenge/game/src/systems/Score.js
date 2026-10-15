import { STORAGE_KEYS, loadNumber, saveNumber } from '../core/Storage.js';

// Score system (GDD 6C): owns the running score and the persisted best score.
//
// Points come from exactly two places — Enemy/Boss kills (their own point values) and the wave
// clear bonus (500 x wave number, waves 1-4). Wave 5 never pays a bonus.
//
// The best score is written to localStorage only at game over (commitScore), not on every kill:
// a crash mid-run then keeps the previous record instead of a partial one.

let score = 0;
let bestScore = loadNumber(STORAGE_KEYS.bestScore, 0);

// Starts a fresh run at 0, keeping the stored best untouched.
export function resetScore() {
    score = 0;
}

// Adds points (kills, wave bonus). Fractional values are rounded to keep the HUD integer-clean.
export function addScore(points) {
    score += Math.round(points);
}

export function getScore() {
    return score;
}

// The persisted best score (shown on the main menu and the game-over screen).
export function getBestScore() {
    return bestScore;
}

// Finishes the run: persists the score when it beats the stored best and reports the outcome.
// The Achievements module uses `previousBest` to tell "first ever run" (0) from "beat a record",
// because the New Record achievement only unlocks when there WAS a previous best.
// Returns { isRecord, previousBest, finalScore }.
export function commitScore() {
    const previousBest = bestScore;
    const isRecord = score > bestScore;
    if (isRecord) {
        bestScore = score;
        saveNumber(STORAGE_KEYS.bestScore, bestScore);
    }
    return { isRecord, previousBest, finalScore: score };
}
