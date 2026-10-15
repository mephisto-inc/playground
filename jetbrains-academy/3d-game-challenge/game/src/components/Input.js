import * as THREE from 'three';
import camera from './Camera.js';

// Input component: the single owner of pointer input (mouse, touch, pen) for the whole game — no
// other module adds pointer listeners. main.js calls initInput() once before the loop, GameState
// registers the activation handler in initGameState, and Player pulls the steering target each
// frame through getMoveTarget().
//
//   * Movement — the pointer position is unprojected onto the ground every frame, so steering
//     needs no buttons: the hero hops toward that point while it sits outside a deadzone (see
//     Player.updatePlayer). A touch drag steers exactly like hovering a mouse, and the target is
//     dropped the moment the finger lifts so the hero settles where the gesture ended.
//   * Attack/restart — two quick taps/clicks are reported through onDoubleActivation(). GameState
//     routes one activation to the attack while playing and to the restart on the Game Over
//     screen; the old single Space key listener lives on in that routing (the *press* moved here
//     because it is pointer input now).
//
// TODO (accessibility): keyboard controls (WASD/Arrows + Space) were removed in favour of this
//       pointer scheme. Consider re-adding them as a silent fallback for players who cannot point
//       precisely.
// TODO (multi-touch): only one pointer is tracked — the most recent move wins, and a second finger
//       is ignored until it becomes the active one. Fine for a single-hero game.

// --- Movement tuning ---------------------------------------------------------
// World units around the hero inside which the pointer is ignored. The camera keeps the hero
// screen-centred, so this doubles as a centre-screen deadzone: without it the hero twitches
// whenever the pointer rests on him. Tune alongside JUMP_DISTANCE in Player.js — as long as it
// stays above that hop length the hero can never overshoot the target and oscillate (and
// Player's final-hop clamp covers the opposite case).
const MOVE_DEADZONE = 40;

// --- Double activation tuning ------------------------------------------------
// Max gap between two taps/clicks for them to count as one double activation.
const DOUBLE_ACTIVATION_MS = 300;
// Pointer travel (px) since the matching pointerdown that still counts as a tap. A drag larger
// than this is steering, not clicking, and breaks the two-tap sequence instead of firing it.
const TAP_MAX_MOVE = 10;

// --- Pointer state -----------------------------------------------------------
const pointerNDC = new THREE.Vector2(); // latest pointer position in NDC (screen space)
let pointerActive = false; // false until the pointer is first seen, and whenever a touch has lifted
const moveTarget = new THREE.Vector3(); // shared result of getMoveTarget (read-only for callers)
const rayStart = new THREE.Vector3(); // scratch: ground-clip point of the pointer ray
const rayEnd = new THREE.Vector3(); // scratch: far-clip point of the pointer ray
let tapStartX = 0; // pointerdown position of the tap being finished, in client px
let tapStartY = 0;
let lastTapTime = -Infinity; // when the previous tap landed (-Infinity = no sequence in progress)
const activationCallbacks = [];
let inputInitialized = false;

// Registers the pointer listeners. Called once from main.js before the animation loop.
export function initInput() {
  if (inputInitialized) return; // guard: a stray second call must not double-register listeners
  inputInitialized = true;

  // Live pointer position. A mouse gets this on hover (no button needed); a touch gets it while
  // the finger is down, so dragging steers. Also refreshes the target for a tap that has not
  // moved yet.
  const track = (event) => {
    pointerNDC.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    pointerActive = true;
  };
  window.addEventListener('pointermove', track);
  window.addEventListener('pointerdown', (event) => {
    track(event);
    tapStartX = event.clientX;
    tapStartY = event.clientY;
  });

  // A mouse stays active: its position does not depend on a button. A touch is only meaningful
  // while the finger is down, so lifting it deactivates the target and the hero settles where the
  // gesture ended instead of walking to a point no finger is holding.
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') pointerActive = false;
    checkDoubleActivation(event);
  });
  window.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'touch') pointerActive = false;
    lastTapTime = -Infinity; // the gesture was cancelled — any tap sequence in progress is over
  });
}

// Registers a handler for a double click / double tap. GameState is the only caller today.
export function onDoubleActivation(callback) {
  activationCallbacks.push(callback);
}

// World-space ground point the hero should hop toward, or null when the pointer is inactive or
// inside the deadzone around `fromPosition`. Distance is measured on the ground plane only, so the
// hop height never shrinks the deadzone. The returned vector is shared and reused — treat it as
// read-only (callers copy what they need out of it).
//
// The ray is built from two unprojected clip depths, which stays correct for this orthographic
// camera (whose view rays are parallel), and it is recomputed every frame, so it always uses the
// view the camera had when the hero was last repositioned — the one-frame staleness is at most a
// single frame of hero movement (well under the deadzone).
export function getMoveTarget(fromPosition) {
  if (!pointerActive) return null;

  camera.updateWorldMatrix(true, false); // the camera is translated every frame; refresh first
  rayStart.set(pointerNDC.x, pointerNDC.y, -1).unproject(camera);
  rayEnd.set(pointerNDC.x, pointerNDC.y, 1).unproject(camera);
  rayEnd.sub(rayStart);
  if (Math.abs(rayEnd.z) < 1e-9) return null; // ray parallel to the ground — no ground point
  const t = -rayStart.z / rayEnd.z; // distance along the ray until it hits the ground plane
  moveTarget.set(rayStart.x + rayEnd.x * t, rayStart.y + rayEnd.y * t, 0);

  const dx = moveTarget.x - fromPosition.x;
  const dy = moveTarget.y - fromPosition.y;
  if (Math.hypot(dx, dy) <= MOVE_DEADZONE) return null;
  return moveTarget;
}

// Decides whether the pointerup that just finished was the second of two quick taps. A drag (more
// than TAP_MAX_MOVE from its own pointerdown) instead breaks the sequence — dragging to steer must
// never fire an attack.
function checkDoubleActivation(event) {
  const moved = Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY);
  if (moved > TAP_MAX_MOVE) {
    lastTapTime = -Infinity;
    return;
  }

  const now = performance.now();
  if (now - lastTapTime <= DOUBLE_ACTIVATION_MS) {
    lastTapTime = -Infinity; // consumed, so a third tap starts a fresh sequence (no double-fire)
    for (const callback of activationCallbacks) callback();
  } else {
    lastTapTime = now;
  }
}
