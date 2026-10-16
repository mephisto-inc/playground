// UI entry point: builds every screen once, in z-order (HUD at the bottom, the achievements
// panel on top so it can open over anything). main.js calls initUI() after the assets load and
// updateHUD() once per frame.

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
}

export { updateHUD };
