import { el, mount } from "./dom.js";
import { STATE, onStateChange } from "../core/StateMachine.js";
import {
  getOffers,
  getReshufflesLeft,
  reshuffle,
} from "../systems/PowerupDraft.js";
import { completeDraft } from "../systems/Run.js";
import { DRAFT } from "../config/tuning.js";

let overlay = null;
let cardsRow = null;
let reshuffleButton = null;
let reshuffleLabel = null;
let openedAt = 0;

export function initDraftModal() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel draft-panel");

  panel.appendChild(el("div", "draft-title", "CHOOSE A POWER-UP"));
  cardsRow = el("div", "draft-cards");
  panel.appendChild(cardsRow);

  const reshuffleRow = el("div", "reshuffle-row");
  reshuffleButton = el("button", "btn", "🔄 RESHUFFLE");
  reshuffleLabel = el("span");
  reshuffleButton.addEventListener("click", () => {
    if (performance.now() - openedAt < DRAFT.inputLock) return;
    if (reshuffle()) renderOffers();
  });
  reshuffleRow.appendChild(reshuffleButton);
  reshuffleRow.appendChild(reshuffleLabel);
  panel.appendChild(reshuffleRow);

  overlay.appendChild(panel);
  mount(overlay);

  onStateChange((state) => {
    const visible = state === STATE.POWERUP_DRAFT;
    overlay.classList.toggle("visible", visible);
    if (visible) {
      openedAt = performance.now();
      renderOffers();
    }
  });
}

function renderOffers() {
  cardsRow.innerHTML = "";
  for (const card of getOffers()) {
    const node = el("div", "panel draft-card");
    node.appendChild(el("div", "icon", card.icon));
    node.appendChild(el("div", "name", card.name));
    node.appendChild(el("div", "desc", card.description));
    node.addEventListener("click", () => {
      if (performance.now() - openedAt < INPUT_LOCK_MS) return;
      completeDraft(card);
    });
    cardsRow.appendChild(node);
  }

  const left = getReshufflesLeft();
  reshuffleButton.disabled = left <= 0;

  const perGame =
    DRAFT.reshuffleAllowed === 1 ? "once" : `${DRAFT.reshuffleAllowed}x`;
  reshuffleLabel.textContent =
    left > 0 ? `(${perGame} per game)` : "already used";
}
