import {loadNumber, saveNumber, STORAGE_KEYS} from "../core/Storage.js";
import {markScore} from "./Achievements.js";

let score = 0;
let bestScore = loadNumber(STORAGE_KEYS.bestScore, 0);

export function resetScore() {
  score = 0;
}

export function addScore(points) {
  score += Math.round(points);
  markScore(score);
}

export function getScore() {
  return score;
}

export function getBestScore() {
  return bestScore;
}

export function resetBestScore() {
  bestScore = 0;
  saveNumber(STORAGE_KEYS.bestScore, 0);
}

export function commitScore() {
  const previousBest = bestScore;
  const isRecord = score > bestScore;
  if (isRecord) {
    bestScore = score;
    saveNumber(STORAGE_KEYS.bestScore, bestScore);
  }
  return {isRecord, previousBest, finalScore: score};
}
