import { el, list, mount } from './dom.js';
import { CLASSES } from '../config/classes.js';
import { POWERUPS } from '../config/powerups.js';
import { getPlayedClasses } from '../systems/Achievements.js';
import { isCollected } from '../systems/Collection.js';

// Compendium panel: the collection overview, reachable from the main menu ONLY. Two sections —
// CLASSES first, then POWER-UPS — each listing every entry. An entry the player has already
// obtained (a class ever played, a card ever picked) renders like an unlocked achievement; the
// rest render dark like a locked achievement (dimmed + grayscaled, 🔒 in place of the icon).
// It is a passive overlay that never changes the game state. Only the list scrolls, so the
// title and the close button stay in place. The main menu's RESET wipes this record too
// (resetCollection), so a wiped save starts from a truly clean slate.

let overlay = null;
let listNode = null;

export function initCompendiumPanel() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel compendium-panel');

    panel.appendChild(el('div', 'compendium-title', '📖 COMPENDIUM'));
    listNode = el('div', 'compendium-list');
    panel.appendChild(listNode);

    const footer = el('div', 'compendium-footer');
    const closeButton = el('button', 'btn', '✖ CLOSE');
    closeButton.addEventListener('click', closeCompendium);
    footer.appendChild(closeButton);
    panel.appendChild(footer);

    // Clicking the dim backdrop (not the panel) also closes.
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeCompendium();
    });

    // Esc closes the panel first if it is open (capture phase so the main menu's own Esc
    // handling never also fires — the panel sits on top of whatever is current).
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('visible')) {
            event.stopPropagation();
            event.preventDefault();
            closeCompendium();
        }
    }, true);

    overlay.appendChild(panel);
    mount(overlay);
}

// Shows the panel, rebuilding the list so the collection state is always fresh.
export function openCompendium() {
    buildList();
    overlay.classList.add('visible');
}

// (Re)builds the two sections from the live class/card configs and the persisted records.
function buildList() {
    listNode.innerHTML = '';

    listNode.appendChild(el('div', 'summary-label', 'CLASSES'));
    const playedClasses = getPlayedClasses();
    for (const definition of CLASSES) {
        listNode.appendChild(makeRow(
            definition,
            playedClasses.includes(definition.id),
            `${definition.name}  ${'💖'.repeat(definition.hearts)}`,
        ));
    }

    listNode.appendChild(el('div', 'summary-label', 'POWER-UPS'));
    for (const card of POWERUPS) {
        listNode.appendChild(makeRow(card, isCollected(card.id), card.name));
    }
}

// One compendium row: the shared achievement-row markup (icon, name, description), dark with a
// lock when the entry has not been obtained yet. Class descriptions are arrays of bullet lines
// (rendered as a list); power-up descriptions stay single-line prose strings.
function makeRow(definition, obtained, name) {
    const row = el('div', `achievement${obtained ? '' : ' locked'}`);
    row.appendChild(el('div', 'a-icon', obtained ? definition.icon : '🔒'));
    const text = el('div', '');
    text.appendChild(el('div', 'a-name', name));
    if (Array.isArray(definition.description)) {
        text.appendChild(list('a-desc a-desc-list', definition.description));
    } else {
        text.appendChild(el('div', 'a-desc', definition.description));
    }
    row.appendChild(text);
    return row;
}

// Closes the panel.
function closeCompendium() {
    overlay.classList.remove('visible');
}
