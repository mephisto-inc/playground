import { DRAFT } from '../config/tuning.js';
import { POWERUPS } from '../config/powerups.js';
import { playSfx } from './Audio.js';

// Power-up draft system: every draft shows 3 DISTINCT cards; the same card may appear again in
// later drafts. One reshuffle per run re-rolls the trio.
//
// This module only owns the two things the draft needs: the current offers and the reshuffle
// budget. The UI (DraftModal) renders getOffers() and calls reshuffle(); picking a card goes
// through Run.completeDraft(), which applies the card and closes the draft.

let offers = [];
let reshufflesLeft = 0;

// Begins a draft: draws the first trio and plays the draft sound.
export function openDraft() {
    offers = drawOffers();
    playSfx('card');
}

// The three current offers (a copy, so UI code cannot mutate the live pair).
export function getOffers() {
    return offers.slice();
}

// Re-rolls the trio with the once-per-run reshuffle. Returns false when the budget is spent
// (the UI disables the button then). Plays the card sound like a fresh draft.
export function reshuffle() {
    if (reshufflesLeft <= 0) return false;
    reshufflesLeft--;
    offers = drawOffers();
    playSfx('card');
    return true;
}

// How many reshuffles remain this run (HUD/UI disables the button at 0).
export function getReshufflesLeft() {
    return reshufflesLeft;
}

// Fresh run: clears the offers and restores the reshuffle budget (Run.beginRun).
export function resetDraft() {
    offers = [];
    reshufflesLeft = DRAFT.reshuffleAllowed;
}

// Draws DRAFT.cardsShown distinct cards: shuffle a copy of the deck, take the first few. Distinct
// within one draft; across drafts the same card can return.
function drawOffers() {
    const deck = POWERUPS.slice();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, DRAFT.cardsShown);
}
