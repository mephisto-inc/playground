import { el, list, mount } from './dom.js';
import { STATE, onStateChange, setState } from '../core/StateMachine.js';
import { CLASSES } from '../config/classes.js';
import { beginRun } from '../systems/Run.js';

// Character-selection modal: three class cards over the frozen arena. Each card shows the class
// icon, starting hearts and the ability description as a compact bullet list (both come from
// config/classes.js, where descriptions are arrays of lines); clicking one starts the run. A
// Back button returns to the main menu.

let overlay = null;

export function initCharacterSelect() {
    overlay = el('div', 'overlay');
    // `wide` widens the panel so the three class cards fit side by side (see index.css).
    const panel = el('div', 'panel menu-panel wide');
    panel.appendChild(el('div', 'game-title', 'CHOOSE YOUR FROG'));

    const cardsRow = el('div', 'class-cards');
    for (const definition of CLASSES) {
        const card = el('div', 'panel class-card');
        card.appendChild(el('div', 'icon', definition.icon));
        card.appendChild(el('div', 'name', definition.name));
        card.appendChild(el('div', 'hearts-line', '💖'.repeat(definition.hearts)));
        card.appendChild(list('desc desc-list', definition.description));
        card.addEventListener('click', () => beginRun(definition.id));
        cardsRow.appendChild(card);
    }
    panel.appendChild(cardsRow);

    const backButton = el('button', 'btn', '← BACK');
    backButton.addEventListener('click', () => setState(STATE.MAIN_MENU));
    panel.appendChild(backButton);

    overlay.appendChild(panel);
    mount(overlay);

    onStateChange((state) => {
        overlay.classList.toggle('visible', state === STATE.CHARACTER_SELECTION);
    });
}
