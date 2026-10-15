import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerCollider, isMoveFree, measureCollisionShape, MAX_MOVE_SUB_STEP } from './Collision.js';
import { getPlayerMoveSpeed } from './Difficulty.js';
import { getMoveTarget } from './Input.js';

// Player component: owns the player group, loads/reorients the Tode model, and advances one
// "hop" at a time toward the pointer's ground position (steered by Input.js; the keyboard was
// removed in favour of pointer controls). main.js calls updatePlayer(delta) once per animation
// frame.

// --- Movement tuning ---------------------------------------------------------
// Hop speed is score-scaled by the difficulty system (tune BASE_PLAYER_MOVE_SPEED and
// PLAYER_MOVE_SPEED_WEIGHT in Difficulty.js); it is read fresh each frame. Raising the speed makes
// each hop finish sooner, so Tode covers ground faster without changing the hop's size.
//
// Tode is a static mesh (tode.glb ships no animations), so the whole "alive" feel comes from code:
// a short, low hop plus a frog-like tilt through the leap (see the lean block below). The hop
// is deliberately small — on the compact arena the old 50-unit leap overshot whole tiles and made
// Tode hard to steer around houses. Distance is the size of the step, height the peak of its sine
// arc; a short, quick hop reads as a snappy character motion rather than a floating mesh.
//
// NOTE: hop *duration* is set by the move speed (progress advances 0..1 at that rate), not by the
// distance. The values below keep ground speed (distance / duration) near its old level:
// 18 / (1 / 3.3) ~= 60 units per second. The difficulty scaling above still applies on top of
// this, unchanged, so hops get quicker (and the dip below deeper) as the score climbs.
// TODO (tuning): constants are placeholders — verify they are customizable later per task.md
//       ("Customize it your way": jump speed/height/distance) and tune the dip feel.
const JUMP_HEIGHT = 14;   // peak height (world Z) of the hop's sine arc
const JUMP_DISTANCE = 18; // ground distance (world XY) covered per hop

// --- Leap lean ("frog" tilt) -------------------------------------------------
// With no animation clips, tilting the body through the hop is what sells the motion. It is shaped
// like a frog's leap: a near-instant snap to nose-up on launch, a forward roll to nose-down by the
// apex, and that nose-down held all the way down to the floor before it resets on touchdown (see
// currentLean). The magnitude is proportional to the live hop speed, so the tilt grows
// automatically as the difficulty raises the tempo; LEAN_MAX caps it so a very high score cannot
// tip Tode over.
const LEAN_PER_SPEED = 0.08; // radians of tilt per unit of hop speed
const LEAN_MAX = 0.5;        // radians; hard cap on the tilt
// Hop progress (0..1) marks for the tilt: snap up almost immediately, finish rolling nose-down by
// the apex, then hold that pose until the hop ends.
const LEAN_SNAP_UP_FRACTION = 0.1;
const LEAN_ROLL_END_FRACTION = 0.45;

// The model's forward points along its local +Z (see the model characteristics block).
// Combined with the model's built-in rotation.x = PI/2, yaw 0 points the face at world -Y,
// so +PI/2 is required for atan2(dir.y, dir.x) to actually face the move direction.
const MODEL_YAW_OFFSET = Math.PI / 2;

// The player is an empty group at the scene center. Movement/rotation is applied to this
// group; the loaded mesh is attached as its child once the async load completes.
const player = new THREE.Group();
player.position.set(0, 0, 0); // center of the scene, resting on the ground plane (z = 0)

// Move state. While `progress` < 1 a hop is in flight; at 1 the player is idle at `target`.
const move = {
  direction: new THREE.Vector3(), // world-space unit direction of the current hop
  start: new THREE.Vector3(),     // group position where the current hop began
  target: new THREE.Vector3(),    // group position where the current hop ends
  progress: 1,                    // normalized 0..1 progress through the current hop (1 = idle)
  yaw: 0,                         // model facing (radians) for the current hop
};

// Steering model: while a hop is in flight its direction is locked, so a pointer that swings
// around mid-air cannot fight the arc; once it lands, updatePlayer re-reads the pointer and starts
// the next hop toward it (see the idle branch below). There is no input queue — the pointer is a
// position, not a press — so a hero resting inside the deadzone simply stays put.

let playerModel = null; // the loaded mesh, used for facing rotation once available

// Orientation helpers. The model is authored Y-up; it is laid onto this Z-up ground with a
// rotation.x of +PI/2, then yawed to face the travel direction, then dipped forward. These are
// composed as quaternions rather than raw Euler angles because the dip must be applied about the
// model's *local* lateral axis (so it always leans the way it faces), which a single Euler triple
// cannot express once yaw is involved. Rotating the player *group* instead is not an option — it
// carries the hero's world position (which the camera tracks) and must stay axis-aligned, so the
// model child does all the turning.
const baseEuler = new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ');
const LEAN_AXIS = new THREE.Vector3(1, 0, 0); // model-local lateral axis (its left/right)
const baseQuaternion = new THREE.Quaternion();
const leanQuaternion = new THREE.Quaternion();

// Points the model at `yaw` and tilts it by `lean` radians. Cheap enough to call per frame.
function orientModel(yaw, lean) {
  if (!playerModel) return;
  baseQuaternion.setFromEuler(baseEuler.set(Math.PI / 2, yaw, 0, 'XYZ'));
  leanQuaternion.setFromAxisAngle(LEAN_AXIS, lean);
  playerModel.quaternion.copy(baseQuaternion).multiply(leanQuaternion);
}

// The tilt for a hop at `progress`, shaped like a frog's leap. Three phases: (1) snap to nose-up
// almost immediately after leaving the ground; (2) roll forward from nose-up to nose-down by the
// apex; (3) hold that nose-down all the way down, so it hangs until the hop reaches the floor. The
// hop's end (progress 1) returns 0 (see updatePlayer), which is the instant reset on touchdown.
// Positive tilt is nose-down/forward (see orientModel). Magnitude grows with the live hop speed,
// which the difficulty system raises with the score.
function currentLean(progress) {
  const amplitude = Math.min(getPlayerMoveSpeed() * LEAN_PER_SPEED, LEAN_MAX);

  if (progress < LEAN_SNAP_UP_FRACTION) {
    const t = progress / LEAN_SNAP_UP_FRACTION;
    return -amplitude * (t * t * (3 - 2 * t)); // quick ease, so the snap has no hard kink
  }

  if (progress < LEAN_ROLL_END_FRACTION) {
    const span = LEAN_ROLL_END_FRACTION - LEAN_SNAP_UP_FRACTION;
    const t = (progress - LEAN_SNAP_UP_FRACTION) / span;
    const s = t * t * (3 - 2 * t);
    return amplitude * (2 * s - 1); // -amplitude (nose-up) -> +amplitude (nose-down)
  }

  return amplitude; // nose-down, held to the floor
}

// Collision volume. Registered right away with a rough guess so enemies already respect the
// hero while the model is still loading, then overwritten with a value measured from the real
// geometry.
const ESTIMATED_RADIUS = 12;
let playerCollider = registerCollider(player, player.position, ESTIMATED_RADIUS);

const loader = new GLTFLoader();

// Model characteristics for public/models/tode.glb:
//   format:      glTF 2.0 binary, exported by THREE.GLTFExporter r174
//   scene:       "AuxScene" -> node "world" -> node "geometry_0" (all identity transforms)
//   mesh:        1 primitive, TRIANGLES, 8262 vertices, 10740 triangles
//   attributes:  POSITION, TEXCOORD_0 (no NORMAL, no skinning, 0 animations)
//   material:    PBR metallic-roughness (metallic 0, roughness 0.2) + 1 PNG base-color texture
//   local size:  X 1.001 (width) x Y 0.635 (height) x Z 0.759 (length)
//   local origin: centered on X/Z; feet at Y = -0.314, head at Y = +0.320
//   forward:     local +Z
//   after scale 20: ~20.0 x 12.7 x 15.2 units; rotation.x = +PI/2 maps local +Y -> world +Z
//                   (this is a Z-up scene) and local +Z -> world -Y.
//
// Loads the model asynchronously. The group is returned empty and filled in once the load
// resolves; `playerReady` resolves with the loaded model so callers can wait for it if needed.
export const playerReady = new Promise((resolve, reject) => {
  loader.load(
    '/models/tode.glb',
    (gltf) => {
      const model = gltf.scene;

      model.rotation.x = Math.PI / 2; // lay the Y-up model onto our Z-up ground
      model.scale.setScalar(20);

      // Measure the collision shape while the model is still unparented, so the numbers come out
      // in the player's own frame (the frame `player.position` lives in).
      // TODO: Z-offset spec is ambiguous. The measured groundOffset lifts the model so its lowest
      //       point rests on z = 0. Confirm this matches "model height".
      const shape = measureCollisionShape(model);
      model.position.z += shape.groundOffset;

      playerCollider = registerCollider(player, player.position, shape.radius);

      playerModel = model;
      player.add(model);
      resolve(model);
    },
    undefined,
    reject,
  );
});

// Advances the player by one frame. `delta` is the elapsed time in seconds since the last
// call. Called from the renderer's animation loop in main.js.
//
// Steering follows the pointer: hops point from the hero toward the ground point Input.js derives
// from it, while that point sits outside the deadzone. The camera is a fixed-orientation
// orthographic view that follows the hero's ground position, and the group itself never rotates
// (only the model child yaws), so the world axes stay fixed relative to the camera — though at
// this isometric angle they run diagonally on the screen rather than up/down/left/right.
export function updatePlayer(delta) {
  if (move.progress >= 1) {
    // Idle: hop toward the pointer if it is outside the deadzone. Input.js returns null while the
    // pointer is inactive (no pointer seen yet, or a touch has just lifted) or parked inside the
    // deadzone, so we come to rest here.
    const target = getMoveTarget(player.position);

    if (target) {
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const distance = Math.hypot(dx, dy);
      move.direction.set(dx / distance, dy / distance, 0);
      move.start.copy(player.position);
      // Clamp the hop to what is left of the way, so a deadzone tuned below JUMP_DISTANCE can
      // still only ever approach the target — never overshoot it and oscillate around it.
      move.target
        .copy(move.start)
        .addScaledVector(move.direction, Math.min(JUMP_DISTANCE, distance));
      move.progress = 0;

      // Record the facing for this hop; orientModel() below applies it (with the dip) every frame.
      // The yaw is about world Z (rotation.x is already PI/2); a rotation.z here would somersault
      // about a horizontal axis instead.
      move.yaw = Math.atan2(move.direction.y, move.direction.x) + MODEL_YAW_OFFSET;
    }
  }

  // Advance the hop and look at where it would put the player this frame. Only the ground
  // position is tested — height is ignored, so a house or wall blocks Tode whether he is on the
  // ground or mid-hop (bees are passable; contact with them is detected separately). The advance
  // is resolved in sub-steps of at most MAX_MOVE_SUB_STEP world units so the hero comes to rest
  // right at an obstacle's boundary rather than up to a whole frame's step short of it: the raw
  // step scales with the (difficulty-scaled) hop speed, so the old whole-step rule left a gap that
  // grew as the game sped up.
  if (move.progress < 1) {
    const targetProgress = Math.min(move.progress + delta * getPlayerMoveSpeed(), 1);

    // World length of this hop, used to convert the fixed world sub-step into a progress step.
    // It is 0 for a frozen hop (start == target), in which case the ground is not moving anyway.
    const hopLength = move.start.distanceTo(move.target);
    const subProgress =
      hopLength > 0 ? Math.min(MAX_MOVE_SUB_STEP / hopLength, 1) : 1;

    let blocked = false;
    while (move.progress < targetProgress) {
      const nextProgress = Math.min(move.progress + subProgress, targetProgress);
      const nextX = THREE.MathUtils.lerp(move.start.x, move.target.x, nextProgress);
      const nextY = THREE.MathUtils.lerp(move.start.y, move.target.y, nextProgress);

      if (!isMoveFree(playerCollider, nextX, nextY)) {
        blocked = true;
        break;
      }
      move.progress = nextProgress;
      player.position.x = nextX;
      player.position.y = nextY;
    }

    if (blocked) {
      // Blocked by an obstacle (a house or a wall). Rather than snapping the hop to the floor
      // (which teleports the hero down mid-air — the bug this replaced), freeze the ground path by
      // collapsing start and target onto the current spot, then let `progress` run on to complete
      // the frame's arc. The ground no longer moves, but the sine arc below finishes, so Tode
      // lands under his own weight at the last clear position.
      move.start.copy(player.position);
      move.target.copy(player.position);
      move.progress = targetProgress;
    }
  }

  // Vertical motion follows the hop's progress; a hop frozen mid-air lands here as the arc
  // completes (progress reaches 1 and the sine returns to 0).
  player.position.z = Math.sin(move.progress * Math.PI) * JUMP_HEIGHT;

  // Face the travel direction and tilt through the leap (snap nose-up, roll to nose-down, hold it
  // to the floor). At touchdown the tilt resets to 0, so Tode stands level between hops.
  orientModel(move.yaw, move.progress < 1 ? currentLean(move.progress) : 0);
}

// True while no hop is in flight, i.e. Tode is standing on the ground. The attack system uses
// this to refuse mid-air swings (spec: no attack while airborne).
// NOTE: do NOT test player.position.z === 0 instead — the sine is also 0 at the very first
// frame of a hop, so z alone cannot tell "landed" from "just left the ground". `progress` is
// the single source of truth for that.
export function isPlayerGrounded() {
  return move.progress >= 1;
}

// Puts the hero back to a clean starting state for a new run. Called by GameState.resetGame().
// Everything that could have been left mid-flight or buffered while the game was frozen has to
// be cleared here, or the next run would begin by replaying stale input or a half-finished hop.
export function resetPlayer() {
  player.position.set(0, 0, 0); // back to the scene center, resting on the ground

  // Cancel any hop in flight and forget where it was headed.
  move.progress = 1;
  move.direction.set(0, 0, 0);
  move.start.copy(player.position);
  move.target.copy(player.position);

  // Steering state lives in Input.js and is deliberately untouched here: the pointer is wherever
  // the player left it, and the deadzone alone decides whether the fresh run starts moving. A
  // restart double-click usually lands on the overlay near the screen centre — i.e. inside the
  // deadzone — so the hero does not hop away the instant play resumes.

  player.visible = true; // the hero reappears
}

export default player;
