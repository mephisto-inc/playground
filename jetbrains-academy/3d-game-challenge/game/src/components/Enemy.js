import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import player from './Player.js'; // enemy AI reads the player's live position
import camera from './Camera.js'; // used to find where the screen edges land on the ground
import {
  registerCollider,
  unregisterCollider,
  isMoveFree,
  isSpotFree,
  getCollider,
  wouldOverlap,
  measureCollisionShape,
  MAX_MOVE_SUB_STEP,
} from './Collision.js';
import { getEnemySpeed, getEnemySpawnDelay } from './Difficulty.js';
import { MAP_SIZE } from './Map.js';

// Enemy component: loads the enemy model once, spawns clones just outside the camera view,
// and each frame steers every live enemy toward the player — stopping whenever that step
// would push it into the player or another enemy. main.js adds this system to the scene and
// calls updateEnemies(delta) once per animation frame.

// --- Tuning -----------------------------------------------------------------
// Enemy speed and spawn delay are no longer fixed here: they are score-scaled by the difficulty
// system, which owns their base values. Tune them in Difficulty.js (BASE_ENEMY_SPEED /
// BASE_ENEMY_SPAWN_DELAY, and the matching weights). The values below are read fresh every frame.
//
// The model scalar is unrelated to difficulty and stays a local constant.
const ENEMY_SCALE = 5; // model scalar (see the characteristics block below)

// How many screen-edge samples to try before giving up and spawning anyway (see spawnEnemy).
const SPAWN_RETRY_ATTEMPTS = 8;

// Facing offset. The model's forward is its local +Z: its rig's torso -> head axis maps to
// world -Y at yaw 0, so without an offset the bee would run 90° to its own left (the same
// class of bug the player's MODEL_YAW_OFFSET fixed). +PI/2 aligns the face with the move
// direction.
// NOTE (possible future bug): this is feel-based, not structural — if enemy.glb is replaced
//   or its rig/orientation changes, facing breaks again. Quick fix: change this one constant
//   (try -PI/2 or PI). TODO: fold model-orientation facts into the project docs, then this
//   note can be removed.
const ENEMY_YAW_OFFSET = Math.PI / 2;

// --- Spawn placement --------------------------------------------------------
// Enemies spawn just beyond the camera's view so they step into frame almost immediately,
// instead of starting at far-away map corners and taking ~45s to arrive. The visible ground
// area is where the view frustum meets the ground plane (z = 0); it depends on the window
// aspect ratio, so it is measured from the camera instead of hard-coded. `spawnCorners`
// holds that area's four corners relative to the player (the camera follows the player, so
// the shape is constant in the player's frame) and `SPAWN_MARGIN` pushes spawns just past it.
const SPAWN_MARGIN = 1.1; // 1.0 = exactly on the screen edge, 1.1 = 10% beyond it
// Extra clearance kept between a spawn and the wall's inner face, on top of the bee's own radius,
// so a clamped spawn never starts tangent to (or overlapping) a wall.
const SPAWN_EDGE_MARGIN = 5;
let spawnCorners = [];

const loader = new GLTFLoader();

const enemies = []; // live enemy groups currently in the scene
let template = null; // the loaded enemy.glb scene, cloned per spawn (see spawnEnemy)
let spawnScene = null; // scene handed in by initEnemies, where spawned enemies are added
let spawnTimer = 0;
let enemyShape = null; // measured collision shape, shared by every clone (they are identical)

// enemy.glb — model characteristics (source: public/models/enemy.glb)
//   format:      glTF 2.0 binary, exported from Blender
//   rig:         SKINNED mesh (1 skin) under a "CharacterArmature" node carrying scale 100,
//                so the native size is unusual — verify ENEMY_SCALE (5) visually. Because it
//                is skinned, spawns must use SkeletonUtils.clone (a plain .clone() would
//                share and corrupt the skeleton).
//   meshes:      1 mesh, 7 primitives, attributes POSITION/NORMAL/JOINTS_0/WEIGHTS_0
//   materials:   5 material slots (base colors only, no textures)
//   animations:  8 clips are bundled in the file but are NOT played yet (see below)
//
// Animations available in enemy.glb (all can drive an AnimationMixer per enemy):
//   Flying_Idle, Fast_Flying, Headbutt, Punch, Death, HitReact, Yes, No
// TODO (animation): the spec only asks for movement/spawning, so the bee stays static-pose
//   for now. To use a clip later: create `const mixer = new THREE.AnimationMixer(enemyModel)`
//   and `mixer.clipAction(gltf.animations.find(c => c.name === 'Flying_Idle')).play()`, then
//   call `mixer.update(delta)` in the loop. The template must keep its animation clips handy.
//
// Positioning mirrors the player: rotation.x = +PI/2 lays the model onto the Z-up ground,
// then the measured groundOffset lifts it so its lowest point rests on z = 0.

// The four ground points where the camera's view frustum edges meet z = 0, expressed
// relative to the player. Fire-and-forget inverse projection: one point per screen corner.
function computeSpawnCorners() {
  camera.updateWorldMatrix(true, false); // refresh matrixWorld + matrixWorldInverse
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const corners = [];
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const dir = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camPos).normalize();
    const t = -camPos.z / dir.z; // distance along the ray until it hits the ground plane
    corners.push(camPos.clone().addScaledVector(dir, t).sub(player.position));
  }
  return corners;
}

// A random point on the visible area's perimeter, pushed just outside it so the enemy walks
// straight into view, then clamped into the map's interior. The perimeter is sampled by picking
// an edge and a random spot on it.
function pickSpawnPosition() {
  const i = Math.floor(Math.random() * spawnCorners.length);
  const a = spawnCorners[i];
  const b = spawnCorners[(i + 1) % spawnCorners.length];
  const position = new THREE.Vector3()
    .lerpVectors(a, b, Math.random()) // random point on this screen edge
    .multiplyScalar(SPAWN_MARGIN) // push outward from the player (off-camera)
    .add(player.position); // place relative to where the player is right now

  // Keep the spawn inside the walls. Near a map edge the screen-edge point lands outside the
  // arena, where the boundary wall would trap the bee out of reach (it can never walk in from
  // outside). Pull the centre back so the whole bee stays inside the wall's inner face at
  // MAP_SIZE/2. When the player is away from the edges this clamp does nothing, because the
  // visible area already sits well inside the map.
  //
  // The cost of the clamp: right up against a wall the pulled-in point can be on-screen, so the
  // bee may appear in view instead of strolling in from just off-camera. Staying inside the arena
  // is the priority; the spawn *rate* is untouched either way.
  const limit = Math.max(0, MAP_SIZE / 2 - enemyShape.radius - SPAWN_EDGE_MARGIN);
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.y = THREE.MathUtils.clamp(position.y, -limit, limit);
  return position;
}

function spawnEnemy() {
  if (!template || !spawnScene || !enemyShape) return;

  // Clone the loaded template so each enemy has its own skeleton/transform.
  const model = skeletonClone(template);

  model.rotation.x = Math.PI / 2; // lay the Y-up model onto our Z-up ground
  model.scale.setScalar(ENEMY_SCALE);

  // Lift the bee onto the ground. The offset was measured once, from the same transform,
  // on the throwaway clone in initEnemies.
  model.position.z += enemyShape.groundOffset;

  // The group carries position only; the model carries rotation, so facing does not spin
  // the group wrapper.
  const enemy = new THREE.Group();

  // Sample the screen edge until we find a free spot. Without this, two bees spawned on the
  // same edge could land inside each other — and since movement never deepens an overlap,
  // they would be stuck together for the rest of the game.
  let spawnAt = pickSpawnPosition();
  for (let attempt = 0; attempt < SPAWN_RETRY_ATTEMPTS; attempt++) {
    if (isSpotFree(spawnAt.x, spawnAt.y, enemyShape.radius)) break;
    spawnAt = pickSpawnPosition();
  }
  // TODO: if the screen edge is genuinely jammed the bee still spawns overlapping. Fine at
  //       this scale (a dozen bees); later a proper fix is to push the pair apart or to hold
  //       the spawn until the next timer tick.
  enemy.position.copy(spawnAt);

  enemy.userData.model = model;
  enemy.userData.collider = registerCollider(enemy, enemy.position, enemyShape.radius);
  // Contact flag polled by GameState: true when this bee has closed to the player's stop
  // boundary and can no longer advance. Set false until the movement pass proves otherwise.
  enemy.userData.touchingPlayer = false;
  enemy.add(model);
  spawnScene.add(enemy);
  enemies.push(enemy);
}

// Called once from main.js. Measures the screen-edge spawn area, loads the model, then
// spawns the first enemy. Later enemies arrive on the timer in updateEnemies.
export function initEnemies(scene) {
  spawnScene = scene;
  spawnCorners = computeSpawnCorners(); // measure before the first spawn

  // TODO: async load — enemies only exist once this resolves. Later code that reads the
  //       `enemies` array immediately after initEnemies() sees it empty.
  loader.load('/models/enemy.glb', (gltf) => {
    template = gltf.scene;

    // Every clone is identical, so the shape is measured once on a throwaway clone prepared
    // exactly like a real spawn (never on the template itself — that transform would leak
    // into the clones and get applied twice).
    // TODO: the bee's geometry is not centred on its own origin (its footprint sits ~1.8
    //       units toward +Y), so the circumscribing circle comes out ~12.8 wide where the
    //       bee's half-width is only ~10.8 — a slightly generous hitbox. Centring the circle
    //       on the footprint would tighten it, but then the centre would have to rotate with
    //       the bee's yaw. Only worth doing if the extra gap is noticeable in play.
    const probe = skeletonClone(template);
    probe.rotation.x = Math.PI / 2;
    probe.scale.setScalar(ENEMY_SCALE);
    enemyShape = measureCollisionShape(probe);

    spawnTimer = 0;
    spawnEnemy(); // one enemy at the start...
  });
}

// Called every frame from the animation loop: spawns on the timer and steers each enemy
// toward the player, one collision-checked step at a time.
export function updateEnemies(delta) {
  if (!template) return; // model not loaded yet

  // The spawn delay shrinks as the score climbs (difficulty system), so read this frame's value
  // once and use it for both the accumulate and the drain — otherwise a mid-loop change could
  // make the two disagree. The timer accumulates real elapsed time (delta = clock.getDelta()).
  const spawnDelay = getEnemySpawnDelay();
  spawnTimer += delta;
  while (spawnTimer >= spawnDelay) {
    spawnTimer -= spawnDelay;
    spawnEnemy();
  }

  // Speed is likewise score-scaled; capture it once so every bee in this frame moves at the same
  // rate rather than a slightly different one if the factor updates mid-pass.
  const speed = getEnemySpeed();

  for (const enemy of enemies) {
    // Vector from the enemy to the player, flattened to the ground plane.
    const direction = new THREE.Vector3().subVectors(player.position, enemy.position);
    direction.z = 0;
    if (direction.lengthSq() < 1e-6) continue;
    direction.normalize();

    const collider = enemy.userData.collider;
    if (collider) {
      // Advance toward the player in sub-steps of at most MAX_MOVE_SUB_STEP so the bee comes to
      // rest right at the collision boundary instead of up to a whole frame's step short of it.
      // (Rejecting the whole step was the old behaviour; since that step scales with difficulty,
      // it left a gap that grew with speed and made Game Over fire from visibly too far away.)
      //
      // The first rejected sub-step decides contact: the bee only counts as touching the hero if
      // the *player* is the one that stopped it (a bee wedged against another bee is not a
      // touch). Since sub-steps are tiny, the bee is within MAX_MOVE_SUB_STEP of the boundary
      // when that happens, so the Game Over fires at the same distance at any difficulty. The
      // flag is recomputed each frame and stays true while the bee is pinned, which is what lets
      // a stationary player still be caught.
      //
      // ALTERNATIVE (not used): an analytic clamp could jump straight to the contact point by
      // solving where the ray enters each blocking circle. Sub-stepping was chosen because it
      // needs no per-shape math and keeps isMoveFree as the single "is this position allowed?"
      // rule. A distance threshold would also work now that the bee reaches the boundary, but it
      // would have to add a margin and would still need getCollider() for the radii.
      const stepLength = speed * delta;
      const subSteps = Math.max(1, Math.ceil(stepLength / MAX_MOVE_SUB_STEP));
      const subX = (direction.x * stepLength) / subSteps;
      const subY = (direction.y * stepLength) / subSteps;

      enemy.userData.touchingPlayer = false;
      const playerCollider = getCollider(player);
      for (let i = 0; i < subSteps; i++) {
        const nx = enemy.position.x + subX;
        const ny = enemy.position.y + subY;
        if (!isMoveFree(collider, nx, ny)) {
          enemy.userData.touchingPlayer =
            !!playerCollider && wouldOverlap(collider, nx, ny, playerCollider);
          break;
        }
        enemy.position.x = nx;
        enemy.position.y = ny;
      }
    }

    // Facing updates either way, so a blocked bee still turns toward its target and is ready
    // to move the moment the way clears.
    const model = enemy.userData.model;
    if (model) {
      // Facing uses the model's yaw; see ENEMY_YAW_OFFSET for why +90 deg is required.
      model.rotation.y = Math.atan2(direction.y, direction.x) + ENEMY_YAW_OFFSET;
    }
  }
  // TODO (crowding): enough bees can form a ring that pins the player with no free cell to
  //       step into. If that ever feels unfair, add a separation pass that shoves overlapping
  //       bees apart after the movement loop.
}

// --- Removal API (used by the attack system) --------------------------------
// The attack needs to reach into this module's private `enemies` array without owning it, so
// these two functions are the whole contract: read the list, then delete one. Keeping removal
// here (rather than mutating the array from Attack.js) means the bookkeeping that only this
// module knows about — the collider registry and the scene graph parent — always happens in
// one place.

// The live array of enemies (do not mutate it directly; use removeEnemy so the collider
// registry stays in sync). Returned by reference so callers can run over it each frame without
// allocating; callers that remove while looping should snapshot it first (see Attack.js).
export function getEnemies() {
  return enemies;
}

// Removes one enemy from play: drop it from the tracking array, unregister its collider, and
// detach it from the scene. Returns true when it actually removed one, false when the enemy was
// already gone — callers (the attack's kill credit) use that to avoid scoring a ghost defeat.
export function removeEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index === -1) return false; // already gone — guards against double-removal in one sweep

  enemies.splice(index, 1);

  // Critical: forget the collider. A collider left in the registry would keep its dead owner's
  // position and go on invisibly blocking the player (and other bees) forever.
  unregisterCollider(enemy);

  // Detach the whole group (mesh child included). dispose() is deliberately NOT called: every
  // clone shares its geometry and materials with the loaded template (SkeletonUtils.clone does
  // not deep-copy them), so disposing here would break the template and every surviving bee.
  // If enemies ever get unique materials, dispose them here.
  // TODO: the model ships Death/HitReact clips (see the animation TODO above) — a nicer defeat
  //       would play Death here before detaching instead of the instant "poof".
  if (enemy.parent) enemy.parent.remove(enemy);

  return true;
}

// Wipes the board for a fresh run: removes every live enemy (through the same bookkeeping as a
// kill, so colliders unregister and scene nodes detach correctly), resets the spawn timer, and
// spawns the opening enemy again. Called by GameState.resetGame().
//
// Spec wording is "re-spawn them at the map corners"; this game deliberately spawns at the
// adaptive screen edge instead (see the Spawn placement block above), and that is the canonical
// method going forward — corners would drop the bees far off-camera and stall the action.
// TODO (spawn count, per spec): the spec implies a crowd; we respawn a single enemy to match the
//   game's initial state. If difficulty should ramp faster on restart, loop spawnEnemy() here.
export function resetEnemies() {
  // Snapshot first: removeEnemy() splices the live array, so iterating it directly would skip
  // entries as they shift down (same reason the attack sweep copies the list).
  for (const enemy of enemies.slice()) removeEnemy(enemy);

  spawnTimer = 0; // a reset run starts the ramp over, just like the very first run

  // Guard for the async-load window: before the model resolves there is no template/shape, so
  // spawnEnemy() would no-op. initEnemies() will spawn the opener once the load lands anyway.
  spawnEnemy();
}
