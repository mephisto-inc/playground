import * as THREE from 'three';
import { registerBoxCollider } from './Collision.js';

// Map component: builds the game world's ground (spec: Game world -> Map background).
//
// It owns three things, all parented to one exported `map` group:
//   1. a checkerboard floor   — the readable green grid that defines the play space;
//   2. a dark backdrop plane  — so everything beyond the floor reads as empty darkness instead
//                               of the page's white background showing through the canvas edge;
//   3. invisible boundary walls — colliders (no meshes) that fence characters onto the floor.
//
// main.js calls initMap(scene) once to build all of it and add the group to the scene. House.js
// then parents the houses to the same `map` group ("add them to the map group"), so the whole
// world stays organised under one node. Keeping `map` as a group also means the whole world could
// later be hidden, moved, or scaled in one go.

// --- Tuning -----------------------------------------------------------------
// Side length of the square floor, in world units. A compact 650 (13 checker repeats) keeps the
// arena tight around the origin — houses and enemies stay in the action instead of being scattered
// across a huge empty field. Exported so the house and enemy systems can keep their own placements
// inside these walls.
export const MAP_SIZE = 650;

// Side length of one checkerboard square, in world units (spec: "make it more yours" allows this;
// a fine grid reads better under a 3/4 camera than the old 50-unit grid did).
const TILE_SIZE = 25;

// The two alternating square colours from the spec.
const CHECKER_DARK = '#228B22'; // Dark Green
const CHECKER_LIGHT = '#90EE90'; // Light Green

// The dark plane that sits under everything. It only shows beyond the floor's edges, which is the
// point: it makes the area outside the play space look like a void, so the player cannot see past
// the walls. Sized far larger than the floor so that, from any reachable viewpoint, the visible
// ground past the edge is backdrop rather than the white page. It must stay within the camera's
// far plane (9000); at 12000 across, its furthest corner from the camera is ~8500 away, so it fits.
const BACKDROP_SIZE = 12000;

// Lowered a little below the floor (z = 0) so the two never z-fight. The step is a fraction of a
// percent of the map size, so it is not visible at this camera distance.
const BACKDROP_Z = -1;
const BACKDROP_COLOR = 0x111111; // near-black

// Thickness of the invisible boundary walls, in world units. They are placed just *outside* the
// floor edge, so their inner faces line up with the edge and a character's circle comes to rest
// at the boundary. Thickness only has to be large enough that no single frame's step can tunnel
// through a wall (sub-stepping in Collision.js already guarantees that).
const WALL_THICKNESS = 50;

// --- The map group ----------------------------------------------------------
// Exported so House.js can parent houses to it and main.js can hand it around. It starts empty;
// initMap() fills it in.
export const map = new THREE.Group();

// A 2x2 texel checker texture: diagonally matching texels so a single repeat makes a proper
// check. RepeatWrapping tiles it across the floor; NearestFilter keeps the square edges hard when
// the floor is magnified (the min filter keeps its default mipmapping, which avoids the distant
// floor turning into shimmering noise).
function makeCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = CHECKER_DARK;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillRect(1, 1, 1, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  // The hex colours above are CSS/sRGB values; tag the texture so three converts them correctly
  // instead of treating them as linear and rendering washed-out greens.
  texture.colorSpace = THREE.SRGBColorSpace;
  // Each repeat covers a 2x2 block of squares, so a repeat spans 2 * TILE_SIZE units. Getting
  // this factor of two wrong is the classic bug: forgetting it halves the apparent square size.
  const repeats = MAP_SIZE / (2 * TILE_SIZE);
  texture.repeat.set(repeats, repeats);
  return texture;
}

// Builds the checkerboard floor as a single plane. A PlaneGeometry already lies in the XY plane
// facing +Z, which is exactly this scene's ground (Z-up), so no rotation is needed. One textured
// plane is one draw call and gives perfectly crisp squares, unlike a grid of thousands of tile
// meshes. (MeshBasicMaterial, not a lit material: the spec fixes the two colours, and unlit keeps
// them exact — a lit floor would shade darker toward the horizon.)
function makeFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    new THREE.MeshBasicMaterial({ map: makeCheckerTexture() }),
  );
  return floor;
}

// A big dark plane under the floor so the world past the edge looks dark. Unlit for the same
// reason as the floor: it should read as one flat void, not a shaded surface.
function makeBackdrop() {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE),
    new THREE.MeshBasicMaterial({ color: BACKDROP_COLOR }),
  );
  backdrop.position.z = BACKDROP_Z;
  return backdrop;
}

// Four axis-aligned box colliders just outside the floor edge, sealing the play area. They are
// invisible: no mesh is created, because "don't let the player see past the walls" is handled by
// the dark backdrop, not by a visible barrier.
function addBoundaryWalls() {
  const half = MAP_SIZE / 2;

  // [centre x, centre y, halfWidth, halfDepth]. Each wall is pushed out by half its thickness so
  // its inner face sits on the floor edge; the half-extents run 50 past the corners so the four
  // walls overlap and leave no diagonal gap for a character to slip through.
  const walls = [
    [0, half + WALL_THICKNESS / 2, half + WALL_THICKNESS, WALL_THICKNESS / 2], // +Y
    [0, -half - WALL_THICKNESS / 2, half + WALL_THICKNESS, WALL_THICKNESS / 2], // -Y
    [-half - WALL_THICKNESS / 2, 0, WALL_THICKNESS / 2, half + WALL_THICKNESS], // -X
    [half + WALL_THICKNESS / 2, 0, WALL_THICKNESS / 2, half + WALL_THICKNESS], // +X
  ];

  for (const [x, y, halfWidth, halfDepth] of walls) {
    // Each wall needs its own owner key in the collider registry, and since walls never move, a
    // bare Object3D used purely as a collider handle is enough. It is never added to the scene.
    const owner = new THREE.Object3D();
    registerBoxCollider(owner, new THREE.Vector3(x, y, 0), halfWidth, halfDepth);
  }
}

// Builds the map and adds it to the scene. Called once from main.js. Returns the group for
// convenience, though it is also exported directly.
export function initMap(scene) {
  map.add(makeBackdrop());
  map.add(makeFloor());
  addBoundaryWalls(); // registers colliders immediately, so they exist before the first enemy spawn
  scene.add(map);
  return map;
}
