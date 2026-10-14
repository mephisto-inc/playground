import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Player component: owns the player group, loads/reorients the Tode model, collects
// keyboard input into a queue, and advances one "hop" at a time toward the requested
// direction. main.js calls updatePlayer(delta) once per animation frame.

// --- Movement tuning ---------------------------------------------------------
// TODO: constants are placeholders — verify they are customizable later per task.md
//       ("Customize it your way": jump speed/height/distance).
const MOVE_SPEED = 2;     // progress units per second (a full hop takes 1/MOVE_SPEED = 0.5s)
const JUMP_HEIGHT = 25;   // peak height (world Z) of the hop's sine arc
const JUMP_DISTANCE = 50; // ground distance (world XY) covered per hop

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
};

// Input model: pressing a movement key queues one hop; holding it keeps hopping (see
// updatePlayer); releasing it stops after the hop currently in flight.
const inputQueue = [];      // pending hops in press order: { key, direction }
const heldKeys = new Set(); // movement keys currently held down

let playerModel = null; // the loaded mesh, used for facing rotation once available

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
// TODO: model loads asynchronously, so the group is returned empty and filled in
//       the callback. If later code needs the model synchronously, wrap this in a Promise.
loader.load('/models/tode.glb', (gltf) => {
  const model = gltf.scene;

  model.rotation.x = Math.PI / 2; // lay the Y-up model onto our Z-up ground
  model.scale.setScalar(20);

  // TODO: Z-offset spec is ambiguous. We compute the box AFTER scale + rotation and
  //       lift the model so its lowest point rests on z=0. Confirm this matches "model height".
  const box = new THREE.Box3().setFromObject(model);
  model.position.z -= box.min.z;

  playerModel = model;
  player.add(model);
});

// Arrow keys and WASD both map to the same four map-relative directions.
const keyDirections = {
  arrowup: new THREE.Vector3(0, 1, 0),
  w: new THREE.Vector3(0, 1, 0),
  arrowdown: new THREE.Vector3(0, -1, 0),
  s: new THREE.Vector3(0, -1, 0),
  arrowleft: new THREE.Vector3(-1, 0, 0),
  a: new THREE.Vector3(-1, 0, 0),
  arrowright: new THREE.Vector3(1, 0, 0),
  d: new THREE.Vector3(1, 0, 0),
};

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const direction = keyDirections[key];
  if (!direction || event.repeat) return; // ignore non-movement keys and OS key auto-repeat
  heldKeys.add(key);
  inputQueue.push({ key, direction: direction.clone() });
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (!keyDirections[key]) return;
  heldKeys.delete(key);
  // Drop this key's not-yet-started hops so the player stops right after the in-flight hop.
  for (let i = inputQueue.length - 1; i >= 0; i--) {
    if (inputQueue[i].key === key) inputQueue.splice(i, 1);
  }
});

// Advances the player by one frame. `delta` is the elapsed time in seconds since the last
// call. Called from the renderer's animation loop in main.js.
//
// TODO: movement is map-relative (Up = +Y). Camera is a child of the player group
//       and doesn't move, so world axes should match the view. Revisit in the next
//       implementation (camera follow); if not handled, adjust mapping manually.
export function updatePlayer(delta) {
  if (move.progress >= 1) {
    // Idle: start a new hop from the queue, or — if a key is still held — keep moving so
    // held keys feel continuous. Releasing the key empties both, so we come to rest here.
    let next = null;
    if (inputQueue.length > 0) next = inputQueue.shift().direction;
    else if (heldKeys.size > 0) next = keyDirections[[...heldKeys][heldKeys.size - 1]];

    if (next) {
      move.direction.copy(next);
      move.start.copy(player.position);
      move.target
        .copy(move.start)
        .add(move.direction.clone().normalize().multiplyScalar(JUMP_DISTANCE));
      move.progress = 0;

      // Facing yaws about world Z via rotation.y (rotation.x is already PI/2). Using
      // rotation.z here would somersault about a horizontal axis instead.
      if (playerModel) {
        playerModel.rotation.y =
          Math.atan2(move.direction.y, move.direction.x) + MODEL_YAW_OFFSET;
      }
    }
  }

  // Advance the hop's 0..1 progress (clamped so it never overshoots 1).
  if (move.progress < 1) {
    move.progress = Math.min(move.progress + delta * MOVE_SPEED, 1);
  }

  // Horizontal motion is a straight lerp; vertical motion is a sine arc for the jump.
  player.position.x = THREE.MathUtils.lerp(move.start.x, move.target.x, move.progress);
  player.position.y = THREE.MathUtils.lerp(move.start.y, move.target.y, move.progress);
  player.position.z = Math.sin(move.progress * Math.PI) * JUMP_HEIGHT;
}

export default player;
