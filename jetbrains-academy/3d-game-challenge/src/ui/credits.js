import {el} from "./dom.js";

const CREDITS_URL =
  "https://github.com/mephisto-inc/jogos/tree/main/3d-game-challenge#creditos";

export function createCreditsButton() {
  const button = el("button", "btn", "💚 CREDITS");
  button.addEventListener("click", () => {
    window.open(CREDITS_URL, "_blank", "noopener,noreferrer");
  });
  return button;
}
