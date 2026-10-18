import {el, list, mount} from "./dom.js";
import {CLASSES} from "../config/classes.js";
import {POWERUPS} from "../config/powerups.js";
import {getPlayedClasses} from "../systems/Achievements.js";
import {isCollected} from "../systems/Collection.js";

let overlay = null;
let listNode = null;

export function initCompendiumPanel() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel compendium-panel");

  panel.appendChild(el("div", "compendium-title", "📖 COMPENDIUM"));
  listNode = el("div", "compendium-list");
  panel.appendChild(listNode);

  const footer = el("div", "compendium-footer");
  const closeButton = el("button", "btn", "✖ CLOSE");
  closeButton.addEventListener("click", closeCompendium);
  footer.appendChild(closeButton);
  panel.appendChild(footer);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCompendium();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && overlay.classList.contains("visible")) {
        event.stopPropagation();
        event.preventDefault();
        closeCompendium();
      }
    },
    true,
  );

  overlay.appendChild(panel);
  mount(overlay);
}

export function openCompendium() {
  buildList();
  overlay.classList.add("visible");
}

function buildList() {
  listNode.innerHTML = "";

  listNode.appendChild(el("div", "summary-label", "CLASSES"));
  const playedClasses = getPlayedClasses();
  for (const definition of CLASSES) {
    listNode.appendChild(
      makeRow(
        definition,
        playedClasses.includes(definition.id),
        `${definition.name}  ${"💖".repeat(definition.hearts)}`,
      ),
    );
  }

  listNode.appendChild(el("div", "summary-label", "POWER-UPS"));
  for (const card of POWERUPS) {
    listNode.appendChild(makeRow(card, isCollected(card.id), card.name));
  }
}

function makeRow(definition, obtained, name) {
  const row = el("div", `achievement${obtained ? "" : " locked"}`);
  row.appendChild(el("div", "a-icon", obtained ? definition.icon : "🔒"));
  const text = el("div", "");
  text.appendChild(el("div", "a-name", name));
  if (Array.isArray(definition.description)) {
    text.appendChild(list("a-desc a-desc-list", definition.description));
  } else {
    text.appendChild(el("div", "a-desc", definition.description));
  }
  row.appendChild(text);
  return row;
}

function closeCompendium() {
  overlay.classList.remove("visible");
}
