export const STORAGE_KEYS = {
  bestScore: "tode3d.bestScore",
  achievements: "tode3d.achievements",
  volume: "tode3d.volume",
  counters: "tode3d.counters",
  collection: "tode3d.collection",
};

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

export function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
