// Storage component: the only module that talks to localStorage. Wraps every access in
// try/catch because privacy modes can throw on read or write, and a storage failure must never
// take the game down — it just means records do not survive the session.

// Keys are namespaced so the game's data cannot collide with other pages on the same origin.
export const STORAGE_KEYS = {
    bestScore: 'tode3d.bestScore',       // highest score ever reached
    achievements: 'tode3d.achievements', // array of unlocked achievement ids
    volume: 'tode3d.volume',             // master volume 0..1
    counters: 'tode3d.counters',         // lifetime achievement counters (kills, dashes, ...)
    collection: 'tode3d.collection',     // array of power-up card ids ever collected (compendium)
};

// Reads a number, falling back when missing or unreadable. Returns `fallback` for NaN too, so a
// corrupted value can never poison arithmetic elsewhere.
export function loadNumber(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        const value = Number(raw);
        return Number.isFinite(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

// Writes a number; silent no-op when storage is unavailable.
export function saveNumber(key, value) {
    try {
        window.localStorage.setItem(key, String(value));
    } catch {
        // Ignore: the game keeps working, the value just does not persist.
    }
}

// Reads a JSON value (arrays/objects), falling back when missing or corrupt.
export function loadJSON(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

// Writes a JSON value; silent no-op when storage is unavailable.
export function saveJSON(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore: the game keeps working, the value just does not persist.
    }
}
