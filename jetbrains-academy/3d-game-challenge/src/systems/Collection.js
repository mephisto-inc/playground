import {loadJSON, saveJSON, STORAGE_KEYS} from "../core/Storage.js";

let collected = new Set(loadJSON(STORAGE_KEYS.collection, []));

export function markCollected(id) {
  if (collected.has(id)) return;
  collected.add(id);
  saveJSON(STORAGE_KEYS.collection, [...collected]);
}

export function isCollected(id) {
  return collected.has(id);
}

export function resetCollection() {
  collected = new Set();
  saveJSON(STORAGE_KEYS.collection, []);
}
