import { DRAFT } from "../config/tuning.js";
import { POWERUPS } from "../config/powerups.js";
import { getActiveClassId } from "../entities/Player.js";
import { playSfx } from "./Audio.js";

let offers = [];
let reshufflesLeft = 0;

export function openDraft() {
  offers = drawOffers();
  playSfx("card");
}

export function getOffers() {
  return offers.slice();
}

export function reshuffle() {
  if (reshufflesLeft <= 0) return false;
  reshufflesLeft--;
  offers = drawOffers();
  playSfx("card");
  return true;
}

export function getReshufflesLeft() {
  return reshufflesLeft;
}

export function resetDraft() {
  offers = [];
  reshufflesLeft = DRAFT.reshuffleAllowed;
}

function drawOffers() {
  const classId = getActiveClassId();
  const deck = POWERUPS.filter(
    (card) => !card.classId || card.classId === classId,
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, DRAFT.cardsShown);
}
