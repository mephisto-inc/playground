import { el, mount } from './dom.js';
import { STATE, onStateChange } from '../core/StateMachine.js';
import { getOffers, getReshufflesLeft, reshuffle } from '../systems/PowerupDraft.js';
import { completeDraft } from '../systems/Run.js';
import { DRAFT } from '../config/tuning.js';

// Power-up draft modal: three distinct cards, a limited reshuffle button (DRAFT.reshuffleAllowed)
// and the pick that resumes play. The system side (offers, reshuffle budget) lives in
// PowerupDraft.js; picking routes through Run.completeDraft() which applies the card and then
// either starts the next wave (wave-clear draft) or resumes the same wave (bonus draft from a
// power-up drop).

// Input lock after the draft appears: the ability is a double click/tap (dash, push) and the
// clicks of that burst keep coming right as the draft pops (a dash can sweep a power-up drop, a
// push can clear the wave), so without the lock the next click lands on a card and picks it by
// accident. Cards and the reshuffle button ignore clicks for this window.
const INPUT_LOCK_MS = 400;

let overlay = null;
let cardsRow = null;
let reshuffleButton = null;
let reshuffleLabel = null;
let openedAt = 0; // performance.now() when the draft last became visible (input lock start)

export function initDraftModal() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel draft-panel');

    panel.appendChild(el('div', 'draft-title', 'CHOOSE A POWER-UP'));
    cardsRow = el('div', 'draft-cards');
    panel.appendChild(cardsRow);

    const reshuffleRow = el('div', 'reshuffle-row');
    reshuffleButton = el('button', 'btn', '🔄 RESHUFFLE');
    reshuffleLabel = el('span');
    reshuffleButton.addEventListener('click', () => {
        if (performance.now() - openedAt < INPUT_LOCK_MS) return; // ability-click lock
        if (reshuffle()) renderOffers(); // sound plays inside reshuffle()
    });
    reshuffleRow.appendChild(reshuffleButton);
    reshuffleRow.appendChild(reshuffleLabel);
    panel.appendChild(reshuffleRow);

    overlay.appendChild(panel);
    mount(overlay);

    onStateChange((state) => {
        const visible = state === STATE.POWERUP_DRAFT;
        overlay.classList.toggle('visible', visible);
        if (visible) {
            openedAt = performance.now(); // start the input lock for this draft
            renderOffers();
        }
    });
}

// Renders the current offers and the reshuffle button state.
function renderOffers() {
    cardsRow.innerHTML = '';
    for (const card of getOffers()) {
        const node = el('div', 'panel draft-card');
        node.appendChild(el('div', 'icon', card.icon));
        node.appendChild(el('div', 'name', card.name));
        node.appendChild(el('div', 'desc', card.description));
        node.addEventListener('click', () => {
            if (performance.now() - openedAt < INPUT_LOCK_MS) return; // ability-click lock
            completeDraft(card);
        });
        cardsRow.appendChild(node);
    }

    const left = getReshufflesLeft();
    reshuffleButton.disabled = left <= 0;
    // The label follows DRAFT.reshuffleAllowed, so changing the budget never leaves a stale text.
    const perGame = DRAFT.reshuffleAllowed === 1 ? 'once' : `${DRAFT.reshuffleAllowed}x`;
    reshuffleLabel.textContent = left > 0 ? `(${perGame} per game)` : 'already used';
}
