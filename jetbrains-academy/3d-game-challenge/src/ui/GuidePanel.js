import {el, list, mount} from "./dom.js";

const GUIDE_LINES = [
  "🖱️ Use the mouse to move — touch the screen on mobile. Tode hops toward your pointer.",
  "⚡ Double click / double tap to use your class ability (Pusher or Dasher).",
  "🃏 Pick a power-up after every wave — stack cards to build your run.",
  "🐸 Survive as long as you can — the waves only get harder, and Wave 5 never ends.",
  "🏆 Get all achievements and fill the compendium.",
  "🐛 Try to break the game or crash it.",
];

let overlay = null;

export function initGuidePanel() {
  overlay = el("div", "overlay");
  const panel = el("div", "panel guide-panel");

  panel.appendChild(el("div", "guide-title", "🎮 GUIDE"));
  const listNode = el("div", "guide-list");
  listNode.appendChild(list("guide-bullets", GUIDE_LINES));
  panel.appendChild(listNode);

  const footer = el("div", "guide-footer");
  const closeButton = el("button", "btn", "✖ CLOSE");
  closeButton.addEventListener("click", closeGuide);
  footer.appendChild(closeButton);
  panel.appendChild(footer);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeGuide();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && overlay.classList.contains("visible")) {
        event.stopPropagation();
        event.preventDefault();
        closeGuide();
      }
    },
    true,
  );

  overlay.appendChild(panel);
  mount(overlay);
}

export function openGuide() {
  overlay.classList.add("visible");
}

function closeGuide() {
  overlay.classList.remove("visible");
}
