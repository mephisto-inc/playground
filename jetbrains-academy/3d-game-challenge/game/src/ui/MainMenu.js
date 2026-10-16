import { el, mount } from './dom.js';
import { STATE, onStateChange, setState } from '../core/StateMachine.js';
import { getBestScore, resetBestScore } from '../systems/Score.js';
import { getMasterVolume, setMasterVolume } from '../systems/Audio.js';
import { resetAchievements } from '../systems/Achievements.js';
import { resetCollection } from '../systems/Collection.js';
import { openAchievements } from './AchievementsPanel.js';
import { openCompendium } from './CompendiumPanel.js';
import { createCreditsButton } from './credits.js';

// Main menu: the central glass panel with the action buttons over the slowly spinning arena.
// Play leads to the character-selection modal; Achievements opens the records panel; Compendium
// opens the collection overview (power-ups and classes); the persisted best score is shown (and
// refreshed every time the menu appears). It also hosts a master-volume slider (mirroring the
// pause menu's), a credits link and the full-save RESET — the one destructive control in the
// game, kept here so every other screen stays non-destructive.

const RESET_CONFIRM_MS = 3000; // how long the RESET button waits for its confirming click

let overlay = null;
let bestNode = null;
let volumeSlider = null;
let resetButton = null;
let resetTimer = 0;

export function initMainMenu() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel menu-panel');

    panel.appendChild(el('div', 'game-title', '🐸 TODE'));
    panel.appendChild(el('div', 'game-subtitle', 'Survive the bugs. Beat your record.'));
    bestNode = el('div', 'best-score');
    panel.appendChild(bestNode);

    const playButton = el('button', 'btn', '▶ PLAY');
    playButton.addEventListener('click', () => setState(STATE.CHARACTER_SELECTION));
    panel.appendChild(playButton);

    const achievementsButton = el('button', 'btn', '🏆 ACHIEVEMENTS');
    achievementsButton.addEventListener('click', () => openAchievements());
    panel.appendChild(achievementsButton);

    // Compendium: the collection of power-ups and classes; main-menu only.
    const compendiumButton = el('button', 'btn', '📖 COMPENDIUM');
    compendiumButton.addEventListener('click', () => openCompendium());
    panel.appendChild(compendiumButton);

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

    // Full-save RESET (main-menu only): two-step confirm like the old achievements-panel one —
    // the first click arms the button into "SURE?", a second click within the window wipes the
    // best score, every achievement unlock, the lifetime counters AND the compendium collection.
    // The volume above is a device preference and deliberately survives the wipe.
    resetButton = el('button', 'btn', '↺ RESET');
    resetButton.addEventListener('click', onResetClicked);
    panel.appendChild(resetButton);

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

// Reset is a two-step action (no native dialog): the first click arms the button into "SURE?",
// a second click within the window wipes the whole save; letting the window pass disarms it.
function onResetClicked() {
    if (!resetButton.classList.contains('confirming')) {
        resetButton.classList.add('confirming');
        resetButton.textContent = 'SURE?';
        resetTimer = setTimeout(disarmReset, RESET_CONFIRM_MS);
        return;
    }
    clearTimeout(resetTimer);
    disarmReset();
    resetBestScore();
    resetAchievements();
    resetCollection();
    // The menu is on screen right now, so the record line must drop to 0 immediately — it only
    // re-reads getBestScore() on the next reveal.
    bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
}

// Puts the RESET button back into its idle state.
function disarmReset() {
    resetButton.classList.remove('confirming');
    resetButton.textContent = '↺ RESET';
}
