// UI entry point: builds every screen once, in z-order (HUD at the bottom, the achievements
// panel on top so it can open over anything). main.js calls initUI() after the assets load and
// updateHUD() once per frame.

import { version } from '../../package.json';
import { initHUD, updateHUD } from './HUD.js';
import { initMainMenu } from './MainMenu.js';
import { initCharacterSelect } from './CharacterSelect.js';
import { initDraftModal } from './DraftModal.js';
import { initPauseMenu } from './PauseMenu.js';
import { initGameOverScreen } from './GameOverScreen.js';
import { initAchievementsPanel } from './AchievementsPanel.js';
import { initToast } from './Toast.js';

export function initUI() {
    initHUD();
    initMainMenu();
    initCharacterSelect();
    initDraftModal();
    initPauseMenu();
    initGameOverScreen();
    initAchievementsPanel();
    initToast();
    initVersionTag();
}

// Build version badge: bottom-left corner, always visible. The version comes from package.json
// (imported by Vite at build time), so the deployed distribution can always be identified.
function initVersionTag() {
    const tag = document.createElement('div');
    tag.className = 'version-tag';
    tag.textContent = `v${version}`;
    document.getElementById('ui-root').appendChild(tag);
}

export { updateHUD };
