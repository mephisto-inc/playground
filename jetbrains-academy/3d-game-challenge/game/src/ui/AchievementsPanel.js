import { el, mount } from './dom.js';
import { getAchievementStatus, resetAchievements } from '../systems/Achievements.js';

// Achievements panel: lists every registered achievement with its current state, persisted in
// localStorage. Reachable at any time from the main menu, the pause menu and the game-over
// screen; it is a passive overlay that never changes the game state, so opening it mid-pause
// keeps the world frozen. Only the list scrolls — the title and the buttons stay in place — so
// a long achievement list stays fully browsable.

const RESET_CONFIRM_MS = 3000; // how long the RESET button waits for its confirming click

let overlay = null;
let listNode = null;
let resetButton = null;
let resetTimer = 0;

export function initAchievementsPanel() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel achievements-panel');

    panel.appendChild(el('div', 'achievements-title', '🏆 ACHIEVEMENTS'));
    listNode = el('div', 'achievements-list');
    panel.appendChild(listNode);

    const footer = el('div', 'achievements-footer');
    resetButton = el('button', 'btn', '↺ RESET');
    resetButton.addEventListener('click', onResetClicked);
    footer.appendChild(resetButton);
    const closeButton = el('button', 'btn', '✖ CLOSE');
    closeButton.addEventListener('click', closeAchievements);
    footer.appendChild(closeButton);
    panel.appendChild(footer);

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

// Reset is a two-step action (no native dialog): the first click arms the button into "SURE?",
// a second click within the window wipes every unlock; letting the window pass disarms it.
function onResetClicked() {
    if (!resetButton.classList.contains('confirming')) {
        resetButton.classList.add('confirming');
        resetButton.textContent = 'SURE?';
        resetTimer = setTimeout(disarmReset, RESET_CONFIRM_MS);
        return;
    }
    clearTimeout(resetTimer);
    disarmReset();
    resetAchievements();
    buildList();
}

// Puts the RESET button back into its idle state.
function disarmReset() {
    resetButton.classList.remove('confirming');
    resetButton.textContent = '↺ RESET';
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

// Closes the panel; also disarms a pending reset confirmation.
function closeAchievements() {
    clearTimeout(resetTimer);
    disarmReset();
    overlay.classList.remove('visible');
}
