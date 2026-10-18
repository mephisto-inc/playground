import {version} from "../../package.json";
import {initHUD, updateHUD} from "./HUD.js";
import {initMainMenu} from "./MainMenu.js";
import {initCharacterSelect} from "./CharacterSelect.js";
import {initDraftModal} from "./DraftModal.js";
import {initPauseMenu} from "./PauseMenu.js";
import {initGameOverScreen} from "./GameOverScreen.js";
import {initGuidePanel} from "./GuidePanel.js";
import {initCompendiumPanel} from "./CompendiumPanel.js";
import {initAchievementsPanel} from "./AchievementsPanel.js";
import {initToast} from "./Toast.js";

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

function initVersionTag() {
  const tag = document.createElement("div");
  tag.className = "version-tag";
  tag.textContent = `v${version}`;
  document.getElementById("ui-root").appendChild(tag);
}

export {updateHUD};
