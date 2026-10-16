import { STORAGE_KEYS, loadJSON, saveJSON } from '../core/Storage.js';

// Collection system: the lifetime record of which power-up cards the player has ever picked, in
// any run. Backs the compendium panel's POWER-UPS section (the CLASSES section reads the played
// classes from the achievements counters instead). Persisted in localStorage as an id array, so
// the compendium survives sessions; a card only ever enters the set, never leaves it until a
// full reset (the achievements panel's RESET wipes this too).

// The collected card ids, loaded once at startup.
let collected = new Set(loadJSON(STORAGE_KEYS.collection, []));

// Records one power-up card as collected. Called by Player.applyCard on every pick; re-picks of
// an already-collected card are a no-op (and skip the write).
export function markCollected(id) {
    if (collected.has(id)) return;
    collected.add(id);
    saveJSON(STORAGE_KEYS.collection, [...collected]);
}

// Whether the player has ever collected the card with this id.
export function isCollected(id) {
    return collected.has(id);
}

// Wipes the collection (the achievements panel's RESET, for a truly clean slate).
export function resetCollection() {
    collected = new Set();
    saveJSON(STORAGE_KEYS.collection, []);
}
