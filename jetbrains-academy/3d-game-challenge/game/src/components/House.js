import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerBoxCollider, isSpotFree } from './Collision.js';
import { MAP_SIZE } from './Map.js';

// House component: loads small_house.glb once and scatters three copies across the map as solid
// obstacles (spec: Game world -> Obstacles). main.js calls initHouses(mapGroup) once; the houses
// are parented to the map group so the whole world lives under one node.
//
// "Solid" is delivered through the shared collision registry: each house registers an axis-aligned
// box collider (see Collision.registerBoxCollider), so both the player and every enemy are already
// blocked by houses with no extra code in their movement — they all funnel through isMoveFree.

// --- Tuning -----------------------------------------------------------------
const HOUSE_COUNT = 3;      // spec: three houses
const HOUSE_SCALE = 65;     // spec: scale the model by 65
// The houses are spread across the whole map rather than confined to a fixed disc, so they scale
// with the arena now that it is small. This is the only fixed part of the bound: a house centre
// must stay this far inside the wall's inner face, on top of the house's own clearance (which is
// measured per house in pickHousePosition, since a random 90-degree yaw swaps the footprint).
const HOUSE_EDGE_MARGIN = 5;
// How many random spots to try before settling for the last one. Placing three houses is trivial,
// so this only ever matters if the map gets crowded by a future edit.
const PLACE_RETRY_ATTEMPTS = 30;

const loader = new GLTFLoader();

// small_house.glb — model characteristics (source: public/models/small_house.glb)
//   format:      glTF 2.0 binary, generator "obj2gltf" (converted from OBJ)
//   scene:       one node ("Node") holding one mesh ("Node-Mesh"); the node has no transform
//   mesh:        1 mesh, 9 primitives
//   skinning:    0 skins, 0 animations — a plain static mesh
//   local bounds: roughly X [-0.38, 0.51], Y [-0.56, 0.66] (up), Z [-0.38, 0.45]
//
// Because it is static (nothing skinned or animated), a plain `.clone()` is safe — unlike the
// enemies, which need SkeletonUtils.clone so their skeletons are not shared. The clones share this
// geometry/materials, which is fine (and why nothing here disposes them).
//
// Orient: rotation.x = +PI/2 lays the Y-up model onto this Z-up ground (same trick as the player
// and enemies). Its local height then runs along world Z. The model is NOT centred on its own
// origin and does not sit at z = 0, so both the footprint centring and the ground lift are read
// from a bounding box per house rather than hard-coded.

// Picks a random spot spread across the map and confirms it is clear of everything already
// registered (the player at the origin, the boundary walls, and any houses placed earlier),
// retrying a bounded number of times and then keeping the last candidate. The map rect is treated
// as an inscribed disc: the centre may not come nearer than its own `clearance` (footprint
// circumscribing radius) plus HOUSE_EDGE_MARGIN to the walls, so the footprint always lands fully
// on the floor. `clearance` also doubles as the packing radius, so houses keep the same "circles
// must not touch" spacing the characters use.
function pickHousePosition(clearance) {
  const placementRadius = Math.max(0, MAP_SIZE / 2 - clearance - HOUSE_EDGE_MARGIN);
  let fallback = new THREE.Vector3();
  for (let attempt = 0; attempt < PLACE_RETRY_ATTEMPTS; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    // sqrt() keeps the points uniform across the disc instead of bunching them at the centre.
    const radius = Math.sqrt(Math.random()) * placementRadius;
    fallback.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    if (isSpotFree(fallback.x, fallback.y, clearance)) break;
    // TODO: on a full map this keeps the last candidate and can overlap a little. Fine for three
    //       houses; a packed map would want a proper packing step instead.
  }
  return fallback;
}

// Builds one house, grounded, centred, and collidable, then drops it into the map group.
function addHouse(template, mapGroup) {
  // The group carries position (so the model's own rotation cannot move its footprint); the model
  // inside carries rotation/scale and the small position nudges used for centring and grounding.
  const group = new THREE.Group();

  const model = template.clone();
  model.rotation.x = Math.PI / 2; // lay the Y-up model onto the Z-up ground
  // Random quarter-turn yaw: 0, 90, 180, or 270 degrees. Multiples of PI/2 keep the footprint
  // axis-aligned, which is what lets the box collider stay a simple AABB.
  model.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
  model.scale.setScalar(HOUSE_SCALE);
  group.add(model);

  // Measure the bounding box of the rotated/scaled model in the group's frame. Refresh the world
  // matrices first — reading geometry-affecting transforms before they propagate is exactly what
  // threw the enemies 689 units off the map in an earlier bug.
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Recentre the footprint on the group origin (so `group.position` is the collision centre) and
  // lift the model so its lowest point rests on z = 0 (spec: houses sit exactly on the ground).
  // These translate the model in the group's frame, so they are unaffected by the model's own yaw.
  model.position.x -= center.x;
  model.position.y -= center.y;
  model.position.z -= box.min.z;

  // The footprint's half-extents (X/Y, after the random yaw) are the box collider's half sizes.
  const halfWidth = size.x / 2;
  const halfDepth = size.y / 2;
  const clearance = Math.hypot(halfWidth, halfDepth);

  const spot = pickHousePosition(clearance);
  group.position.set(spot.x, spot.y, 0);
  mapGroup.add(group);

  // Register last: `group.position` must be final, since the collider holds that Vector3 by
  // reference and never refreshes it. Houses are static, so it stays correct for the whole run.
  registerBoxCollider(group, group.position, halfWidth, halfDepth);
}

// Loads the model once and places the houses. Called once from main.js, after initMap so the map
// group and the boundary-wall colliders already exist.
export function initHouses(mapGroup) {
  loader.load(
    '/models/small_house.glb',
    (gltf) => {
      const template = gltf.scene;
      for (let i = 0; i < HOUSE_COUNT; i++) addHouse(template, mapGroup);
    },
    undefined,
    (error) => {
      // TODO: failing to load leaves the map with no obstacles and no error surfaced to the
      //       player. If houses ever become optional, hide the failure; otherwise consider a
      //       visible fallback (e.g. plain box meshes) so the game stays playable.
      console.error('Failed to load small_house.glb', error);
    },
  );
}
