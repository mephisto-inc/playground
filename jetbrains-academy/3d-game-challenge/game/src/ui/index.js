// UI entry point: builds every screen once, in z-order (HUD at the bottom, then the menus and
// modals, then the guide/compendium/achievements panels so they stack over the screens that
// link to them; the toast container and the version tag are mounted last). Every screen lands
// in the scaling layer (ui/dom.js), so the whole UI shrinks uniformly on small game rects.
// main.js calls initUI() after the assets load and updateHUD() once per frame.

import { version } from '../../package.json';
import { initHUD, updateHUD } from './HUD.js';
import { initMainMenu } from './MainMenu.js';
import { initCharacterSelect } from './CharacterSelect.js';
import { initDraftModal } from './DraftModal.js';
import { initPauseMenu } from './PauseMenu.js';
import { initGameOverScreen } from './GameOverScreen.js';
import { initGuidePanel } from './GuidePanel.js';
import { initCompendiumPanel } from './CompendiumPanel.js';
import { initAchievementsPanel } from './AchievementsPanel.js';
import { initToast } from './Toast.js';

export function initUI() {
    initHUD();
    initMainMenu();
    initCharacterSelect();
    initDraftModal();
    initPauseMenu();
    initGameOverScreen();
    initGuidePanel();
    initCompendiumPanel();
    initAchievementsPanel();
    initToast();
    initVersionTag();
}

// Build version badge: bottom-left corner, always visible. The version comes from package.json
// (imported by Vite at build time), so the deployed distribution can always be identified. It
// is appended to #ui-root directly — outside the scaling layer — so it keeps its fixed size.
function initVersionTag() {
    const tag = document.createElement('div');
    tag.className = 'version-tag';
    tag.textContent = `v${version}`;
    document.getElementById('ui-root').appendChild(tag);
}

export { updateHUD };
