import { el, mount } from './dom.js';
import { STATE, onStateChange } from '../core/StateMachine.js';
import { getOffers, getReshufflesLeft, reshuffle } from '../systems/PowerupDraft.js';
import { completeDraft } from '../systems/Run.js';

// Power-up draft modal (GDD 6A): three distinct cards, a once-per-run reshuffle button and the
// pick that resumes play. The system side (offers, reshuffle budget) lives in PowerupDraft.js;
// picking routes through Run.completeDraft() which applies the card and starts the next wave.

let overlay = null;
let cardsRow = null;
let reshuffleButton = null;
let reshuffleLabel = null;

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
        if (visible) renderOffers();
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
        node.addEventListener('click', () => completeDraft(card));
        cardsRow.appendChild(node);
    }

    const left = getReshufflesLeft();
    reshuffleButton.disabled = left <= 0;
    reshuffleLabel.textContent = left > 0 ? '(once per game)' : 'already used';
}
