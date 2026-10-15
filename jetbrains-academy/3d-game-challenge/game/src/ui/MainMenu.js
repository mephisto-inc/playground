import { el, mount } from './dom.js';
import { STATE, onStateChange, setState } from '../core/StateMachine.js';
import { getBestScore } from '../systems/Score.js';
import { openAchievements } from './AchievementsPanel.js';

// Main menu (GDD 1 state 1): the central glass panel with the action buttons over the slowly
// spinning arena. Play leads to the character-selection modal; Achievements opens the records
// panel; the persisted best score is shown (and refreshed every time the menu appears).

let overlay = null;
let bestNode = null;

export function initMainMenu() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel menu-panel');

    panel.appendChild(el('div', 'game-title', '🐸 TODE'));
    panel.appendChild(el('div', 'game-subtitle', 'Survive the pond. Beat your record.'));
    bestNode = el('div', 'best-score');
    panel.appendChild(bestNode);

    const playButton = el('button', 'btn', '▶ PLAY');
    playButton.addEventListener('click', () => setState(STATE.CHARACTER_SELECTION));
    panel.appendChild(playButton);

    const achievementsButton = el('button', 'btn', '🏆 ACHIEVEMENTS');
    achievementsButton.addEventListener('click', () => openAchievements());
    panel.appendChild(achievementsButton);

    overlay.appendChild(panel);
    mount(overlay);

    onStateChange((state) => {
        const visible = state === STATE.MAIN_MENU;
        overlay.classList.toggle('visible', visible);
        if (visible) {
            // Refresh on reveal: a run may have just updated the record.
            bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
        }
    });
    overlay.classList.add('visible'); // the game opens in the main menu
    bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
}
