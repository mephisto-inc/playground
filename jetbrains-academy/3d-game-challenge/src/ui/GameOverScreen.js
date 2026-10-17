import { attachTooltip, el, formatClock, hideTooltip, mount } from "./dom.js";
import { STATE, onStateChange, setState } from "../core/StateMachine.js";
import { PLAYER } from "../config/tuning.js";
import { TOTAL_WAVES } from "../config/waves.js";
import { getGameOverSummary } from "../systems/Run.js";
import { getPowerup } from "../config/powerups.js";
import { getAchievement } from "../systems/Achievements.js";
import { openAchievements } from "./AchievementsPanel.js";
import { openCompendium } from "./CompendiumPanel.js";

let overlay = null;
let scoreNode = null;
let bestNode = null;
let recordNode = null;
let timeNode = null;
let cardsNode = null;
let achievementsNode = null;
let revealTimer = null;

export function initGameOverScreen() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel gameover-panel");

  panel.appendChild(el("div", "gameover-title", "GAME OVER"));
  scoreNode = el("div", "final-score");
  bestNode = el("div", "best-score");
  recordNode = el("div", "record-badge");
  timeNode = el("div", "final-time");
  panel.appendChild(scoreNode);
  panel.appendChild(bestNode);
  panel.appendChild(recordNode);
  panel.appendChild(timeNode);

  panel.appendChild(el("div", "summary-label", "Power-ups collected"));
  cardsNode = el("div", "recap-cards");
  panel.appendChild(cardsNode);

  panel.appendChild(el("div", "summary-label", "Unlocked this run"));
  achievementsNode = el("div", "recap-achievements");
  panel.appendChild(achievementsNode);

  const playAgainButton = el("button", "btn", "▶ PLAY AGAIN");
  playAgainButton.addEventListener("click", () =>
    setState(STATE.CHARACTER_SELECTION),
  );
  panel.appendChild(playAgainButton);

  const menuButton = el("button", "btn", "🏠 MAIN MENU");
  menuButton.addEventListener("click", () => setState(STATE.MAIN_MENU));
  panel.appendChild(menuButton);

  const achievementsButton = el("button", "btn", "🏆 ACHIEVEMENTS");
  achievementsButton.addEventListener("click", () => openAchievements());
  panel.appendChild(achievementsButton);
  const compendiumButton = el("button", "btn", "📖 COMPENDIUM");
  compendiumButton.addEventListener("click", () => openCompendium());
  panel.appendChild(compendiumButton);

  overlay.appendChild(panel);
  mount(overlay);

  onStateChange((state) => {
    if (state === STATE.GAME_OVER) {
      render();

      overlay.classList.remove("revealed");
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        overlay.classList.add("visible", "revealed");
      }, PLAYER.deathAnimDuration * 1000);
    } else {
      clearTimeout(revealTimer);
      overlay.classList.remove("visible", "revealed");
      hideTooltip();
    }
  });
}

function render() {
  const summary = getGameOverSummary();

  scoreNode.textContent = `⭐ ${summary.score.toLocaleString()}`;
  bestNode.textContent = `Best: ${summary.best.toLocaleString()}`;
  recordNode.textContent = summary.isRecord ? "🏆 NEW RECORD!" : "";

  const times = summary.times || { total: 0, wave5: 0 };
  timeNode.textContent =
    times.wave5 > 0
      ? `⏱ Total ${formatClock(times.total)} · Wave ${TOTAL_WAVES} ${formatClock(times.wave5)}`
      : `⏱ Total ${formatClock(times.total)}`;

  hideTooltip();
  cardsNode.innerHTML = "";
  if (summary.cards.length === 0) {
    cardsNode.appendChild(el("span", "summary-label", "— none —"));
  } else {
    for (const id of summary.cards) {
      const powerup = getPowerup(id);
      const badge = el("span", "build-badge", powerup ? powerup.icon : "❔");
      if (powerup) {
        attachTooltip(
          badge,
          `${powerup.icon} ${powerup.name}`,
          powerup.description,
        );
      } else {
        attachTooltip(
          badge,
          "❔ Unknown",
          "This power-up is no longer in the card pool.",
        );
      }
      cardsNode.appendChild(badge);
    }
  }

  achievementsNode.innerHTML = "";
  const unlockedDefinitions = summary.unlocked
    .map(getAchievement)
    .filter(Boolean);
  if (unlockedDefinitions.length === 0) {
    achievementsNode.appendChild(el("div", "summary-label", "— none —"));
  } else {
    for (const definition of unlockedDefinitions) {
      const badge = el("span", "build-badge", definition.icon);
      attachTooltip(
        badge,
        `${definition.icon} ${definition.name}`,
        definition.description,
      );
      achievementsNode.appendChild(badge);
    }
  }
}
