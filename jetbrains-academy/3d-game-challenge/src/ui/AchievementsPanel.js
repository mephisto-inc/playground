import { el, mount } from "./dom.js";
import { getAchievementStatus } from "../systems/Achievements.js";

let overlay = null;
let listNode = null;

export function initAchievementsPanel() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel achievements-panel");

  panel.appendChild(el("div", "achievements-title", "🏆 ACHIEVEMENTS"));
  listNode = el("div", "achievements-list");
  panel.appendChild(listNode);

  const footer = el("div", "achievements-footer");
  const closeButton = el("button", "btn", "✖ CLOSE");
  closeButton.addEventListener("click", closeAchievements);
  footer.appendChild(closeButton);
  panel.appendChild(footer);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAchievements();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && overlay.classList.contains("visible")) {
        event.stopPropagation();
        event.preventDefault();
        closeAchievements();
      }
    },
    true,
  );

  overlay.appendChild(panel);
  mount(overlay);
}

export function openAchievements() {
  buildList();
  overlay.classList.add("visible");
}

function buildList() {
  listNode.innerHTML = "";
  for (const entry of getAchievementStatus()) {
    const row = el("div", `achievement${entry.unlocked ? "" : " locked"}`);
    row.appendChild(el("div", "a-icon", entry.unlocked ? entry.icon : "🔒"));
    const text = el("div", "");
    text.appendChild(el("div", "a-name", entry.name));
    text.appendChild(el("div", "a-desc", entry.description));
    row.appendChild(text);
    listNode.appendChild(row);
  }
}

function closeAchievements() {
  overlay.classList.remove("visible");
}
