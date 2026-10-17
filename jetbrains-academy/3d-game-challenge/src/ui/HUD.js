import { attachTooltip, el, formatClock, hideTooltip, mount } from "./dom.js";
import {
  STATE,
  getState,
  onStateChange,
  setState,
} from "../core/StateMachine.js";
import {
  getAbilityInfo,
  getCollectedCards,
  getHearts,
  getStats,
} from "../entities/Player.js";
import { getScore } from "../systems/Score.js";
import { getWaveInfo } from "../systems/Waves.js";
import { getPowerup } from "../config/powerups.js";

let heartsNode = null;
let waveNode = null;
let scoreNode = null;
let bossBarNode = null;
let bossFillNode = null;
let abilityRingNode = null;
let abilityIconNode = null;
let buildPanelNode = null;
let hudNode = null;
let pauseButtonNode = null;

const cache = {
  hearts: "",
  wave: "",
  score: "",
  bossWidth: -1,
  abilityFill: -1,
  abilityIcon: "",
  abilityPassive: null,
  badges: "",
};

export function initHUD() {
  hudNode = el("div");
  hudNode.id = "hud";

  const top = el("div", "hud-top");
  heartsNode = el("div", "hearts");
  waveNode = el("div", "wave-banner");
  const scoreRow = el("div", "score-row");
  scoreNode = el("span", "score");
  pauseButtonNode = el("button", "pause-btn", "⏸");
  pauseButtonNode.title = "Pause";
  pauseButtonNode.addEventListener("click", () => {
    if (getState() === STATE.WAVE_PLAYING) setState(STATE.PAUSE_MENU);
  });
  scoreRow.appendChild(scoreNode);
  scoreRow.appendChild(pauseButtonNode);
  bossBarNode = el("div", "boss-bar hidden");
  bossFillNode = el("div", "boss-fill");
  bossBarNode.appendChild(bossFillNode);
  top.appendChild(heartsNode);
  top.appendChild(waveNode);
  top.appendChild(scoreRow);
  top.appendChild(bossBarNode);

  const bottom = el("div", "hud-bottom");
  abilityRingNode = el("div", "ability-ring");
  abilityIconNode = el("div", "inner");
  abilityRingNode.appendChild(abilityIconNode);
  buildPanelNode = el("div", "build-panel");
  bottom.appendChild(abilityRingNode);
  bottom.appendChild(buildPanelNode);

  hudNode.appendChild(top);
  hudNode.appendChild(bottom);
  mount(hudNode);

  onStateChange((state) => {
    const inRun =
      state === STATE.WAVE_PLAYING ||
      state === STATE.POWERUP_DRAFT ||
      state === STATE.PAUSE_MENU ||
      state === STATE.GAME_OVER;
    hudNode.classList.toggle("hidden", !inRun);
    pauseButtonNode.classList.toggle("hidden", state !== STATE.WAVE_PLAYING);
    hideTooltip();
  });
  hudNode.classList.add("hidden");
}

export function updateHUD() {
  if (!hudNode || hudNode.classList.contains("hidden")) return;

  const hearts = getHearts();
  const maxHearts = getStats().maxHearts;
  const heartsText =
    "💖".repeat(hearts) + "🖤".repeat(Math.max(0, maxHearts - hearts));
  if (heartsText !== cache.hearts) {
    cache.hearts = heartsText;
    heartsNode.textContent = heartsText;
  }

  const waveInfo = getWaveInfo();
  let waveText =
    waveInfo.wave > 0 ? `WAVE ${waveInfo.wave}/${waveInfo.total}` : "";
  if (waveInfo.wave === waveInfo.total) {
    waveText = `⏱ ${formatClock(waveInfo.waveElapsed)}`;
  }
  const bossTag = waveInfo.bossAlive
    ? ' <span class="boss-tag">- BOSS ⚠️</span>'
    : "";
  if (waveText + bossTag !== cache.wave) {
    cache.wave = waveText + bossTag;
    waveNode.innerHTML = cache.wave;
  }

  const scoreText = `⭐ ${getScore().toLocaleString()}`;
  if (scoreText !== cache.score) {
    cache.score = scoreText;
    scoreNode.textContent = scoreText;
  }

  if (waveInfo.boss) {
    bossBarNode.classList.remove("hidden");
    const width = Math.max(
      0,
      Math.round((waveInfo.boss.hp / waveInfo.boss.maxHp) * 100),
    );
    if (width !== cache.bossWidth) {
      cache.bossWidth = width;
      bossFillNode.style.width = `${width}%`;
    }
  } else {
    bossBarNode.classList.add("hidden");
    cache.bossWidth = -1;
  }

  const ability = getAbilityInfo();
  if (ability.icon !== cache.abilityIcon) {
    cache.abilityIcon = ability.icon;
    abilityIconNode.textContent = ability.icon;
  }
  if (ability.passive !== cache.abilityPassive) {
    cache.abilityPassive = ability.passive;
    abilityRingNode.classList.toggle("passive", ability.passive);
  }
  const fill =
    ability.passive || ability.cooldown <= 0
      ? 1
      : Math.min(1, Math.max(0, 1 - ability.remaining / ability.cooldown));
  const fillRounded = Math.round(fill * 100) / 100;
  if (fillRounded !== cache.abilityFill) {
    cache.abilityFill = fillRounded;
    abilityRingNode.style.setProperty("--fill", String(fillRounded));
  }

  const counts = new Map();
  for (const id of getCollectedCards())
    counts.set(id, (counts.get(id) || 0) + 1);
  let badgesKey = "";
  for (const [id, count] of counts) badgesKey += `${id}x${count}|`;
  if (badgesKey !== cache.badges) {
    cache.badges = badgesKey;
    hideTooltip();
    buildPanelNode.replaceChildren();
    for (const [id, count] of counts) {
      const powerup = getPowerup(id);
      const badge = el("span", "build-badge", powerup ? powerup.icon : "❔");
      if (count > 1) badge.appendChild(el("span", "count", `x${count}`));
      if (powerup) {
        const stackNote = count > 1 ? ` (stacked x${count})` : "";
        attachTooltip(
          badge,
          `${powerup.icon} ${powerup.name}`,
          powerup.description + stackNote,
        );
      } else {
        attachTooltip(
          badge,
          "❔ Unknown",
          "This power-up is no longer in the card pool.",
        );
      }
      buildPanelNode.appendChild(badge);
    }
  }
}
