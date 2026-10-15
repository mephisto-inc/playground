import { el, mount } from './dom.js';
import { getAchievementStatus } from '../systems/Achievements.js';

// Achievements panel (GDD 7): lists all 8 unlock records with their current state, persisted in
// localStorage. Reachable at any time from the main menu and the pause menu; it is a passive
// overlay that never changes the game state, so opening it mid-pause keeps the world frozen.

let overlay = null;
let listNode = null;

export function initAchievementsPanel() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel achievements-panel');

    panel.appendChild(el('div', 'achievements-title', '🏆 ACHIEVEMENTS'));
    listNode = el('div', '');
    panel.appendChild(listNode);

    const closeButton = el('button', 'btn', '✖ CLOSE');
    closeButton.addEventListener('click', closeAchievements);
    panel.appendChild(closeButton);

    // Clicking the dim backdrop (not the panel) also closes.
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAchievements();
    });

    // Esc closes the panel first if it is open (capture phase so the pause menu's Esc toggle
    // does not also fire — the panel sits on top of whatever state is current).
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
    overlay.classList.add('visible');
}

export function closeAchievements() {
    overlay.classList.remove('visible');
}
