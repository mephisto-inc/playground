import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import player from './Player.js'; // enemy AI reads the player's live position
import camera from './Camera.js'; // used to find where the screen edges land on the ground

// Enemy component: loads the enemy model once, spawns clones just outside the camera view,
// and each frame steers every live enemy toward the player. main.js adds this system to the
// scene and calls updateEnemies(delta) once per animation frame.

// --- Tuning -----------------------------------------------------------------
// TODO (difficulty, per task.md): tweak ENEMY_SPEED / ENEMY_SPAWN_DELAY for "horde" (fast
//       spawn, slow) vs "hunter" (slow spawn, fast) feels.
export const ENEMY_SPEED = 30; // world units per second
export const ENEMY_SPAWN_DELAY = 3; // seconds between spawns

const ENEMY_SCALE = 5; // model scalar (see the characteristics block below)

// Facing offset. The model's forward is its local +Z: its rig's torso -> head axis maps to
// world -Y at yaw 0, so without an offset the bee would run 90° to its own left (the same
// class of bug the player's MODEL_YAW_OFFSET fixed). +PI/2 aligns the face with the move
// direction.
// NOTE (possible future bug): this is feel-based, not structural — if enemy.glb is replaced
//   or its rig/orientation changes, facing breaks again. Quick fix: change this one constant
//       (try -PI/2 or PI). TODO: fold model-orientation facts into the project docs, then this
//       note can be removed.
const ENEMY_YAW_OFFSET = Math.PI / 2;

// --- Spawn placement --------------------------------------------------------
// Enemies spawn just beyond the camera's view so they step into frame almost immediately,
// instead of starting at far-away map corners and taking ~45s to arrive. The visible ground
// area is where the view frustum meets the ground plane (z = 0); it depends on the window
// aspect ratio, so it is measured from the camera instead of hard-coded. `spawnCorners`
// holds that area's four corners relative to the player (the camera follows the player, so
// the shape is constant in the player's frame) and `SPAWN_MARGIN` pushes spawns just past it.
const SPAWN_MARGIN = 1.1; // 1.0 = exactly on the screen edge, 1.1 = 10% beyond it
let spawnCorners = [];

const loader = new GLTFLoader();

const enemies = []; // live enemy groups currently in the scene
let template = null; // the loaded enemy.glb scene, cloned per spawn (see spawnEnemy)
let spawnScene = null; // scene handed in by initEnemies, where spawned enemies are added
let spawnTimer = 0;

// enemy.glb — model characteristics (source: public/models/enemy.glb)
//   format:      glTF 2.0 binary, exported from Blender
//   rig:         SKINNED mesh (1 skin) with an armature node that carries scale 100, so the
//                native size is unusual — verify ENEMY_SCALE (5) visually. Because it is
//                skinned, spawns must use SkeletonUtils.clone (a plain .clone() would share
//                and corrupt the skeleton).
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
// then a box lifts it so its lowest point rests on z = 0.

// World-space bounds for a (possibly skinned) model.
// Why not Box3.setFromObject()? It transforms each mesh's geometry box by mesh.matrixWorld
// directly, which is wrong for SKINNED meshes: enemy.glb's armature bakes in scale 100, so
// setFromObject inflates the box ~100x and the ground offset throws the enemy off-screen.
// SkinnedMesh.computeBoundingBox() accounts for the skeleton + inverse-bind matrices and
// returns the real rendered bounds. Non-skinned meshes fall back to the geometry box.
// TODO: share this helper if other skinned models (e.g. a future animated player) need it.
function computeWorldBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const local = new THREE.Box3();
    if (mesh.isSkinnedMesh && typeof mesh.computeBoundingBox === 'function') {
      mesh.computeBoundingBox();
      local.copy(mesh.boundingBox);
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      local.copy(mesh.geometry.boundingBox);
    }
    local.applyMatrix4(mesh.matrixWorld);
    box.union(local);
  });
  return box;
}

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
// straight into view. The perimeter is sampled by picking an edge and a random spot on it.
function pickSpawnPosition() {
  const i = Math.floor(Math.random() * spawnCorners.length);
  const a = spawnCorners[i];
  const b = spawnCorners[(i + 1) % spawnCorners.length];
  return new THREE.Vector3()
    .lerpVectors(a, b, Math.random()) // random point on this screen edge
    .multiplyScalar(SPAWN_MARGIN) // push outward from the player (off-camera)
    .add(player.position); // place relative to where the player is right now
}

function spawnEnemy() {
  if (!template || !spawnScene) return;

  // Clone the loaded template so each enemy has its own skeleton/transform.
  const model = skeletonClone(template);

  model.rotation.x = Math.PI / 2; // lay the Y-up model onto our Z-up ground
  model.scale.setScalar(ENEMY_SCALE);

  // TODO: Z-offset spec is ambiguous (same as the player). We lift the model so its lowest
  //       (skin-aware) point rests on z = 0. Confirm this matches "model height".
  const box = computeWorldBounds(model);
  model.position.z -= box.min.z;

  // The group carries position only; the model carries rotation, so facing does not spin
  // the group wrapper.
  const enemy = new THREE.Group();
  enemy.position.copy(pickSpawnPosition());

  enemy.userData.model = model;
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
    spawnTimer = 0;
    spawnEnemy(); // one enemy at the start...
  });
}

// Called every frame from the animation loop: spawns on the timer and steers each enemy
// toward the player. Enemies may overlap the player and each other at this stage (by spec).
export function updateEnemies(delta) {
  if (!template) return; // model not loaded yet

  // ...then one more every ENEMY_SPAWN_DELAY seconds, at random points around the screen edge.
  spawnTimer += delta;
  while (spawnTimer >= ENEMY_SPAWN_DELAY) {
    spawnTimer -= ENEMY_SPAWN_DELAY;
    spawnEnemy();
  }

  for (const enemy of enemies) {
    // Vector from the enemy to the player, flattened to the ground plane.
    const direction = new THREE.Vector3().subVectors(player.position, enemy.position);
    direction.z = 0;
    if (direction.lengthSq() < 1e-6) continue;
    direction.normalize();

    // Move one step closer, then face that direction (yaw about world Z on the model).
    enemy.position.addScaledVector(direction, ENEMY_SPEED * delta);
    const model = enemy.userData.model;
    if (model) {
      // Facing uses the model's yaw; see ENEMY_YAW_OFFSET for why +90 deg is required.
      model.rotation.y = Math.atan2(direction.y, direction.x) + ENEMY_YAW_OFFSET;
    }
  }
}
