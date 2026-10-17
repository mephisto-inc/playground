import * as THREE from "three";
import camera from "../world/Camera.js";
import renderer from "./Renderer.js";
import { MOVE } from "../config/tuning.js";

const pointerNDC = new THREE.Vector2();
let pointerActive = false;
const moveTarget = new THREE.Vector3();
const pointerGroundPoint = new THREE.Vector3();
const rayStart = new THREE.Vector3();
const rayEnd = new THREE.Vector3();

let pointerDownOnCanvas = false;
let downX = 0;
let downY = 0;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let tapConsumed = false;

const abilityCallbacks = [];
let initialized = false;

export function initInput() {
  if (initialized) return;
  initialized = true;

  const isCanvas = (event) => event.target === renderer.domElement;

  const track = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerActive = true;
  };

  window.addEventListener("pointermove", (event) => {
    if (isCanvas(event)) track(event);
  });

  window.addEventListener("pointerdown", (event) => {
    if (!isCanvas(event)) {
      pointerDownOnCanvas = false;
      return;
    }
    track(event);
    pointerDownOnCanvas = true;
    downX = event.clientX;
    downY = event.clientY;
    tapConsumed = false;

    const now = performance.now();
    const distance = Math.hypot(
      event.clientX - lastTapX,
      event.clientY - lastTapY,
    );
    if (
      lastTapTime &&
      now - lastTapTime <= MOVE.doubleTap &&
      distance <= MOVE.doubleTapMaxDist
    ) {
      lastTapTime = 0;
      tapConsumed = true;
      for (const callback of abilityCallbacks) callback();
    }
  });

  window.addEventListener("pointerup", (event) => {
    if (!pointerDownOnCanvas) return;
    pointerDownOnCanvas = false;

    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (moved <= MOVE.tapMaxMovePx && !tapConsumed) registerTap(event);
    tapConsumed = false;

    if (event.pointerType === "touch") pointerActive = false;
  });

  window.addEventListener("pointercancel", (event) => {
    pointerDownOnCanvas = false;
    if (event.pointerType === "touch") pointerActive = false;
  });
}

export function onAbility(callback) {
  abilityCallbacks.push(callback);
}

function registerTap(event) {
  lastTapTime = performance.now();
  lastTapX = event.clientX;
  lastTapY = event.clientY;
}

export function getMoveTarget(fromPosition) {
  if (!pointerActive) return null;
  if (!unprojectToGround(moveTarget)) return null;

  const dx = moveTarget.x - fromPosition.x;
  const dy = moveTarget.y - fromPosition.y;
  if (Math.hypot(dx, dy) <= MOVE.deadzone) return null;
  return moveTarget;
}

export function getPointerGroundPoint() {
  if (!pointerActive) return null;
  return unprojectToGround(pointerGroundPoint) ? pointerGroundPoint : null;
}

function unprojectToGround(out) {
  camera.updateWorldMatrix(true, false);
  rayStart.set(pointerNDC.x, pointerNDC.y, -1).unproject(camera);
  rayEnd.set(pointerNDC.x, pointerNDC.y, 1).unproject(camera);
  rayEnd.sub(rayStart);
  if (Math.abs(rayEnd.z) < 1e-9) return null;
  const t = -rayStart.z / rayEnd.z;
  out.set(rayStart.x + rayEnd.x * t, rayStart.y + rayEnd.y * t, 0);
  return out;
}
