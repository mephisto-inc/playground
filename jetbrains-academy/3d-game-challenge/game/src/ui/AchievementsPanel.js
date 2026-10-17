import { el, mount } from './dom.js';
import { getAchievementStatus } from '../systems/Achievements.js';

// Achievements panel: lists every registered achievement with its current state, persisted in
// localStorage. Reachable from the main menu, the pause menu and the game-over screen; it is a
// passive overlay that never changes the game state, so opening it keeps everything wherever it
// was frozen. Only the list scrolls — the title and the CLOSE button stay in place — so a long
// achievement list stays fully browsable. The full-save RESET that used to sit in this panel's
// footer moved to the main menu.

let overlay = null;
let listNode = null;

export function initAchievementsPanel() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel achievements-panel');

    panel.appendChild(el('div', 'achievements-title', '🏆 ACHIEVEMENTS'));
    listNode = el('div', 'achievements-list');
    panel.appendChild(listNode);

    const footer = el('div', 'achievements-footer');
    const closeButton = el('button', 'btn', '✖ CLOSE');
    closeButton.addEventListener('click', closeAchievements);
    footer.appendChild(closeButton);
    panel.appendChild(footer);

    // Clicking the dim backdrop (not the panel) also closes.
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAchievements();
    });

    // Esc closes the panel first if it is open (capture phase, so the Esc key never also
    // reaches whatever screen the panel is covering).
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('visible')) {
            event.stopPropagation();
            event.preventDefault();
            closeAchievements();
        }
    }, true);

    overlay.appendChild(panel);
    mount(overlay);
}

// Shows the panel, rebuilding the list so unlock states are always fresh.
export function openAchievements() {
    buildList();
    overlay.classList.add('visible');
}

// (Re)builds the achievement rows from the current registry and unlock state.
function buildList() {
    listNode.innerHTML = '';
    for (const entry of getAchievementStatus()) {
        const row = el('div', `achievement${entry.unlocked ? '' : ' locked'}`);
        row.appendChild(el('div', 'a-icon', entry.unlocked ? entry.icon : '🔒'));
        const text = el('div', '');
        text.appendChild(el('div', 'a-name', entry.name));
        text.appendChild(el('div', 'a-desc', entry.description));
        row.appendChild(text);
        listNode.appendChild(row);
    }
}

// Closes the panel.
function closeAchievements() {
    overlay.classList.remove('visible');
}
