import {el, mount} from "./dom.js";
import {onStateChange, setState, STATE} from "../core/StateMachine.js";
import {getBestScore, resetBestScore} from "../systems/Score.js";
import {getMasterVolume, setMasterVolume} from "../systems/Audio.js";
import {resetAchievements} from "../systems/Achievements.js";
import {resetCollection} from "../systems/Collection.js";
import {openAchievements} from "./AchievementsPanel.js";
import {openCompendium} from "./CompendiumPanel.js";
import {openGuide} from "./GuidePanel.js";
import {createCreditsButton} from "./credits.js";
import {MENU} from "../config/tuning.js";

let overlay = null;
let bestNode = null;
let volumeSlider = null;
let resetButton = null;
let resetTimer = 0;

export function initMainMenu() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel menu-panel");

  panel.appendChild(el("div", "game-title", "🐸 TODE"));
  panel.appendChild(
    el("div", "game-subtitle", "Survive the night bugs. Beat your record."),
  );
  bestNode = el("div", "best-score");
  panel.appendChild(bestNode);

  const playButton = el("button", "btn", "▶ PLAY");
  playButton.addEventListener("click", () =>
    setState(STATE.CHARACTER_SELECTION),
  );
  panel.appendChild(playButton);

  const metaRow = el("div", "btn-row");
  const achievementsButton = el("button", "btn", "🏆 ACHIEVEMENTS");
  achievementsButton.addEventListener("click", () => openAchievements());
  metaRow.appendChild(achievementsButton);
  const compendiumButton = el("button", "btn", "📖 COMPENDIUM");
  compendiumButton.addEventListener("click", () => openCompendium());
  metaRow.appendChild(compendiumButton);
  panel.appendChild(metaRow);

  const volumeRow = el("div", "volume-row");
  volumeRow.appendChild(el("span", "", "🔊"));
  volumeSlider = el("input");
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.05";
  volumeSlider.addEventListener("input", () =>
    setMasterVolume(Number(volumeSlider.value)),
  );
  volumeRow.appendChild(volumeSlider);
  panel.appendChild(volumeRow);

  const infoRow = el("div", "btn-row");
  const guideButton = el("button", "btn", "🎮 GUIDE");
  guideButton.addEventListener("click", () => openGuide());
  infoRow.appendChild(guideButton);
  infoRow.appendChild(createCreditsButton());
  panel.appendChild(infoRow);

  resetButton = el("button", "btn", "↺ RESET ALL PROGRESS");
  resetButton.addEventListener("click", onResetClicked);
  panel.appendChild(resetButton);

  overlay.appendChild(panel);
  mount(overlay);

  onStateChange((state) => {
    const visible = state === STATE.MAIN_MENU;
    overlay.classList.toggle("visible", visible);
    if (visible) {
      bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;

      volumeSlider.value = String(getMasterVolume());
    }
  });
  overlay.classList.add("visible");
  bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
  volumeSlider.value = String(getMasterVolume());
}

function onResetClicked() {
  if (!resetButton.classList.contains("confirming")) {
    resetButton.classList.add("confirming");
    resetButton.textContent = "SURE?";
    resetTimer = setTimeout(disarmReset, MENU.resetConfirm);
    return;
  }
  clearTimeout(resetTimer);
  disarmReset();
  resetBestScore();
  resetAchievements();
  resetCollection();

  bestNode.textContent = `Best score: ⭐ ${getBestScore().toLocaleString()}`;
}

function disarmReset() {
  resetButton.classList.remove("confirming");
  resetButton.textContent = "↺ RESET ALL PROGRESS";
}
