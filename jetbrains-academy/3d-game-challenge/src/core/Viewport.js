import {clamp} from "./MathUtils.js";

const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 16 / 9;

const UI_REF_WIDTH = 700;
const UI_REF_HEIGHT = 560;

let aspect = 1;
let rect = {left: 0, top: 0, width: 0, height: 0};

export function applyViewport() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  aspect = clamp(windowWidth / windowHeight, MIN_ASPECT, MAX_ASPECT);

  let width = windowWidth;
  let height = width / aspect;
  if (height > windowHeight) {
    height = windowHeight;
    width = height * aspect;
  }
  rect = {
    left: (windowWidth - width) / 2,
    top: (windowHeight - height) / 2,
    width,
    height,
  };

  const style = document.documentElement.style;
  style.setProperty("--game-left", `${rect.left}px`);
  style.setProperty("--game-top", `${rect.top}px`);
  style.setProperty("--game-width", `${rect.width}px`);
  style.setProperty("--game-height", `${rect.height}px`);

  const uiScale = Math.max(
    0.05,
    Math.min(1, rect.width / UI_REF_WIDTH, rect.height / UI_REF_HEIGHT),
  );
  style.setProperty("--ui-scale", `${uiScale}`);
  return rect;
}

export function getAspect() {
  return aspect;
}

applyViewport();
