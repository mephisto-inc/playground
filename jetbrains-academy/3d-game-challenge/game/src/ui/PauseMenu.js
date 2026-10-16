import { el, mount } from './dom.js';
import { STATE, getState, onStateChange, setState } from '../core/StateMachine.js';
import { getMasterVolume, setMasterVolume } from '../systems/Audio.js';
import { openAchievements } from './AchievementsPanel.js';
import { createCreditsButton } from './credits.js';

// Pause menu: freezes the world and muffles the music (the Audio system reacts to the state),
// with Continue, a master-volume slider, the achievements panel and a quit-to-menu option.
// Opened by the HUD pause button or Esc.

let overlay = null;
let volumeSlider = null;

export function initPauseMenu() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel pause-panel');

    panel.appendChild(el('div', 'pause-title', 'PAUSED'));

    const continueButton = el('button', 'btn', '▶ CONTINUE');
    continueButton.addEventListener('click', () => setState(STATE.WAVE_PLAYING));
    panel.appendChild(continueButton);

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

    const achievementsButton = el('button', 'btn', '🏆 ACHIEVEMENTS');
    achievementsButton.addEventListener('click', () => openAchievements());
    panel.appendChild(achievementsButton);

    // Credits: same link as the main menu.
    panel.appendChild(createCreditsButton());

    const quitButton = el('button', 'btn', '✖ QUIT TO MENU');
    quitButton.addEventListener('click', () => setState(STATE.MAIN_MENU));
    panel.appendChild(quitButton);

    overlay.appendChild(panel);
    mount(overlay);

    // Esc toggles pause — but only between a live run and the pause screen; in the draft or on
    // the game-over screen Esc does nothing (those are separate frozen states).
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const state = getState();
        if (state === STATE.WAVE_PLAYING) setState(STATE.PAUSE_MENU);
        else if (state === STATE.PAUSE_MENU) setState(STATE.WAVE_PLAYING);
    });

    onStateChange((state) => {
        const visible = state === STATE.PAUSE_MENU;
        overlay.classList.toggle('visible', visible);
        if (visible) volumeSlider.value = String(getMasterVolume());
    });
}
