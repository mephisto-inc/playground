import { el, mount } from './dom.js';
import { STATE, onStateChange, setState } from '../core/StateMachine.js';
import { getBestScore } from '../systems/Score.js';
import { getMasterVolume, setMasterVolume } from '../systems/Audio.js';
import { openAchievements } from './AchievementsPanel.js';
import { createCreditsButton } from './credits.js';

// Main menu: the central glass panel with the action buttons over the slowly spinning arena.
// Play leads to the character-selection modal; Achievements opens the records panel; the persisted
// best score is shown (and refreshed every time the menu appears). It also hosts a master-volume
// slider (mirroring the pause menu's) and a credits link.

let overlay = null;
let bestNode = null;
let volumeSlider = null;

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

    // Master volume: same row as the pause menu, applied immediately and persisted by the Audio
    // system.
    const volumeRow = el('div', 'volume-row');
    volumeRow.appendChild(el('span', '', '🔊'));
    volumeSlider = el('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.05';
    volumeSlider.addEventListener('input', () => setMasterVolume(Number(volumeSlider.value)));
    volumeRow.appendChild(volumeSlider);
    panel.appendChild(volumeRow);

    // Credits: opens the repository README's credits section in a new tab.
    panel.appendChild(createCreditsButton());

    overlay.appendChild(panel);
    mount(overlay);

    onStateChange((state) => {
        const visible = state === STATE.MAIN_MENU;
        overlay.classList.toggle('visible', visible);
        if (visible) {
            // Refresh on reveal: a run may have just updated the record.
            bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
            // The volume may have been changed in the pause menu since this menu was last seen.
            volumeSlider.value = String(getMasterVolume());
        }
    });
    overlay.classList.add('visible'); // the game opens in the main menu
    bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
    volumeSlider.value = String(getMasterVolume()); // sync with the persisted volume on load
}
