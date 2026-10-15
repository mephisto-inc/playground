import * as THREE from 'three';
import camera from './Camera.js';

// Input component: the single owner of pointer input (mouse, touch, pen) for the whole game — no
// other module adds pointer listeners. main.js calls initInput() once before the loop, passing a
// provider for the hero's ground position; GameState registers the attack-tap handler in
// initGameState; Player pulls the steering target each frame through getMoveTarget().
//
//   * Movement — the pointer position is unprojected onto the ground every frame, so steering
//     needs no buttons: the hero hops toward that point while it sits outside a deadzone (see
//     Player.updatePlayer). A touch drag steers exactly like hovering a mouse, and the target is
//     dropped the moment the finger lifts so the hero settles where the gesture ended.
//   * Attack — a stationary release (<= TAP_MAX_MOVE px of travel since its own pointerdown)
//     landing inside ATTACK_ZONE_RADIUS of the hero's ground position fires onAttackTap().
//     GameState forwards it to requestAttack() while a run is live and drops it while the Game
//     Over overlay is up (the overlay's own click restarts instead). The zone nests inside
//     MOVE_DEADZONE, so tapping the hero can never also move him, and the ring between the two
//     radii is a neutral buffer where neither attack nor movement happens.
//
// TODO (discoverability): nothing on screen tells a new player that tapping the hero attacks —
//       add a fading start-of-run hint (e.g. "Tap Tode to blast") once there is a home for it.
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

// --- Attack zone tuning ------------------------------------------------------
// World units around the hero's ground position inside which a stationary tap/click counts as an
// attack ("tap on Tode"). Slightly larger than the hero's body (ESTIMATED_RADIUS = 12 in
// Player.js) so a finger has a forgiving margin, and MUST stay below MOVE_DEADZONE: the zone
// nests inside the movement deadzone, so an attack tap can never also nudge the hero, and the
// ring between the two radii is a neutral buffer. About 97 px on a 1080p-tall viewport
// (VIEW_HEIGHT = 200 maps world units to screen).
const ATTACK_ZONE_RADIUS = 18;

// Pointer travel (px) since the matching pointerdown that still counts as a tap. A release
// farther out than this was a drag — steering — and never attacks.
const TAP_MAX_MOVE = 10;

// --- Pointer state -----------------------------------------------------------
const pointerNDC = new THREE.Vector2(); // latest pointer position in NDC (screen space)
let pointerActive = false; // false until the pointer is first seen, and whenever a touch has lifted
const moveTarget = new THREE.Vector3(); // shared result of getMoveTarget (read-only for callers)
const tapGroundPoint = new THREE.Vector3(); // scratch: ground point of the tap being judged
const rayStart = new THREE.Vector3(); // scratch: ground-clip point of the pointer ray
const rayEnd = new THREE.Vector3(); // scratch: far-clip point of the pointer ray
let tapStartX = 0; // pointerdown position of the tap being finished, in client px
let tapStartY = 0;
const attackTapCallbacks = [];
let getHeroPosition = null; // provider set by initInput; read live at tap time, never cached
let inputInitialized = false;

// Registers the pointer listeners. `getHeroGroundPosition` returns the hero's position vector
// (main.js passes `() => player.position`). The indirection keeps this module free of any Player
// import — Player already imports Input, so a direct import would create a cycle — and reading it
// on demand means the zone is always judged against where the hero is right now.
export function initInput(getHeroGroundPosition) {
  if (inputInitialized) return; // guard: a stray second call must not double-register listeners
  inputInitialized = true;
  getHeroPosition = getHeroGroundPosition;

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
  //
  // Order matters here: refresh the release point first (some browsers fire no pointermove for a
  // tap that never moved, so this may be the only update carrying the release coordinates), judge
  // the tap while pointerActive is still true, and only then drop touch steering.
  window.addEventListener('pointerup', (event) => {
    track(event);
    const moved = Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY);
    if (moved <= TAP_MAX_MOVE) checkAttackTap();
    if (event.pointerType === 'touch') pointerActive = false;
  });
  // A cancelled gesture (the browser took the pointer over) never reached a clean release, so it
  // can neither attack nor leave touch steering dangling.
  window.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'touch') pointerActive = false;
  });
}

// Registers a handler for attack taps (stationary taps/clicks inside the hero zone). GameState is
// the only caller: it forwards to requestAttack() while the run is live and drops the tap while
// the Game Over overlay is up. The overlay's restart is a separate `click` handler, dispatched by
// the browser after this pointerup, so the dropped tap and the restart keep their order.
export function onAttackTap(callback) {
  attackTapCallbacks.push(callback);
}

// World-space ground point the hero should hop toward, or null when the pointer is inactive or
// inside the deadzone around `fromPosition`. Distance is measured on the ground plane only, so the
// hop height never shrinks the deadzone. The returned vector is shared and reused — treat it as
// read-only (callers copy what they need out of it).
export function getMoveTarget(fromPosition) {
  if (!pointerActive) return null;
  if (!unprojectToGround(moveTarget)) return null;

  const dx = moveTarget.x - fromPosition.x;
  const dy = moveTarget.y - fromPosition.y;
  if (Math.hypot(dx, dy) <= MOVE_DEADZONE) return null;
  return moveTarget;
}

// Fires the attack-tap callbacks when the release landed inside the hero's attack zone. Only
// reached for stationary releases (<= TAP_MAX_MOVE travel), so a drag that steers never attacks.
// The zone is measured on the ground plane in x/y only: player.position.z is the hop height, and
// a 3D distance would bloat the zone whenever the hero is mid-hop.
function checkAttackTap() {
  if (!getHeroPosition) return; // initInput() has not wired the provider yet
  if (!unprojectToGround(tapGroundPoint)) return; // no ground point under the tap

  const hero = getHeroPosition();
  const dx = tapGroundPoint.x - hero.x;
  const dy = tapGroundPoint.y - hero.y;
  if (Math.hypot(dx, dy) > ATTACK_ZONE_RADIUS) return; // outside the zone: steering territory

  for (const callback of attackTapCallbacks) callback();
}

// Ground point under the pointer, written into `out`, or null when the ray misses the ground
// plane. The ray is built from two unprojected clip depths, which stays correct for this
// orthographic camera (whose view rays are parallel), and it is recomputed every call, so it
// always uses the view the camera had when the hero was last repositioned — the one-frame
// staleness is at most a single frame of hero movement (well under the deadzone).
function unprojectToGround(out) {
  camera.updateWorldMatrix(true, false); // the camera is translated every frame; refresh first
  rayStart.set(pointerNDC.x, pointerNDC.y, -1).unproject(camera);
  rayEnd.set(pointerNDC.x, pointerNDC.y, 1).unproject(camera);
  rayEnd.sub(rayStart);
  if (Math.abs(rayEnd.z) < 1e-9) return null; // ray parallel to the ground — no ground point
  const t = -rayStart.z / rayEnd.z; // distance along the ray until it hits the ground plane
  out.set(rayStart.x + rayEnd.x * t, rayStart.y + rayEnd.y * t, 0);
  return out;
}
