import * as THREE from 'three';

// Collision module: the shared "characters must not overlap" rules (spec: Collision detection),
// extended for the game world (spec: Game world) to also cover static obstacles.
//
// Two kinds of collider live in the registry:
//   * circle — every moving character, reduced to a shape measured from its own geometry (not a
//     raw bounding box, which is far too boxy for rounded characters). Two circles overlap when
//     their centres are closer than radiusA + radiusB + COLLISION_DISTANCE.
//   * box — static, axis-aligned obstacles: the houses (House.js) and the map's boundary walls
//     (Map.js). A box carries halfWidth/halfDepth instead of a radius.
//
// Everything is 2D: height is ignored, so a bee blocks Tode whether he is standing or mid-hop,
// and a character is blocked by a house no matter how high the hop arc climbs.
//
// Every check happens in the position-update phase of the animation loop (updatePlayer /
// updateEnemies), and a character only commits a move that came back free.

// Padding added on top of the two circles, so the "hitbox" can be tuned without touching the
// models. Raise it for a chunkier feel, lower it to let characters almost touch.
// (The spec requires this to be its own constant.)
export const COLLISION_DISTANCE = 2;

// The largest world-space increment a character may move in a single collision check. Movement
// is resolved by advancing in increments of at most this size and stopping at the first one that
// would overlap (see the module note above isMoveFree). This exists because the old rule rejected
// a whole frame's step, which left a resting gap that silently grew with (difficulty-scaled)
// speed: the game-over "touch" then fired from too far away. Sub-stepping keeps the gap fixed
// regardless of speed and also stops a fast character from skipping through another in one jump.
//
// Expressed as a fraction of COLLISION_DISTANCE so the two scale together: the granularity stays
// proportionally fine whether the padding is tight or chunky.
//   TODO (tuning/perf): smaller = more accurate contact but more isMoveFree calls per frame;
//     larger = cheaper but a bigger resting gap. Quarter of the padding is a good middle ground.
const MOVE_SUB_STEP_FRACTION = 0.25;
export const MAX_MOVE_SUB_STEP = COLLISION_DISTANCE * MOVE_SUB_STEP_FRACTION;

// Tolerance for the "is it touching yet?" comparison, so a move that lands a hair inside from
// floating-point rounding is not treated as an overlap.
const EPSILON = 1e-6;

// Every character that can collide, keyed by its owner object. `position` is stored by
// reference (the live Vector3 on the character's group), so the registry never has to be
// refreshed as characters move.
const colliders = new Map();

// TODO (future enemies / bosses): the registry now holds both circles (characters) and boxes
//       (obstacles), but it still assumes exactly one collider per owner. A boss will probably
//       need several colliders (or a different shape again), so expect this to grow into a small
//       list of shapes per owner. The callers below should not have to change much.
//
// TODO (hop-over, reversed): an earlier version also compared a vertical range [z, z + height]
//       so an airborne Tode could clear a bee; it felt stiff, so height is deliberately out of
//       the test now. To restore it: keep the measured height on the collider and have
//       penetrationOf() return Math.min(horizontal, vertical), where vertical is the overlap
//       of the two [z, z + height] ranges. The "no worse than before" rule stays as-is.

// Registers a moving character's circular collider and returns it (callers keep the result and
// hand it back to isMoveFree). Registering the same owner twice replaces its collider. `position`
// is kept by reference to the owner's live Vector3, so the collider tracks the character for free.
export function registerCollider(owner, position, radius) {
  const collider = { position, shape: 'circle', radius };
  colliders.set(owner, collider);
  return collider;
}

// Registers a static, axis-aligned box obstacle (a house or a boundary wall) and returns it.
// `halfWidth`/`halfDepth` are half-extents along world X/Y, measured from `position`. The spec
// only ever rotates houses in multiples of PI/2 about the scene-vertical Z axis, so a house's
// footprint stays axis-aligned whatever its yaw — which is exactly what lets a plain AABB stand
// in for the real walls instead of costing us rotated-box math. Obstacles never move, so unlike a
// character, `position` here is a fixed point rather than a live reference.
export function registerBoxCollider(owner, position, halfWidth, halfDepth) {
  const collider = { position, shape: 'box', halfWidth, halfDepth };
  colliders.set(owner, collider);
  return collider;
}

export function unregisterCollider(owner) {
  colliders.delete(owner);
}

// Read-only lookup for the collider a character registered. GameState and Enemy use it to ask
// about a *specific* other character (e.g. "does this step touch the player?") without having to
// re-derive radii or reach into the registry Map directly.
export function getCollider(owner) {
  return colliders.get(owner);
}

// How much a circle of `radius` centred at (x, y) overlaps `other` on the ground plane, in world
// units. 0 means they are not touching. One number answers both "are they touching?" and "how
// much further would this move push them together?", which is what the move rule below needs.
//
// Movers are always circles (see wouldOverlap/isMoveFree), so only `other` needs the shape split:
//   * circle: centre-to-centre distance minus the two radii and the padding.
//   * box: distance from the centre to the nearest point on the box — clamp the offset on each
//     axis to the half-extent, so anything inside the box collapses to 0 on that axis. A centre
//     inside the box therefore always has penetration = radius + padding (a constant), which is
//     what lets a character that somehow ends up inside back out without deepening the overlap.
function penetrationOf(x, y, radius, other) {
  if (other.shape === 'box') {
    const dx = Math.max(Math.abs(x - other.position.x) - other.halfWidth, 0);
    const dy = Math.max(Math.abs(y - other.position.y) - other.halfDepth, 0);
    return Math.max(0, radius + COLLISION_DISTANCE - Math.hypot(dx, dy));
  }
  return Math.max(
    0,
    radius + other.radius + COLLISION_DISTANCE -
      Math.hypot(x - other.position.x, y - other.position.y),
  );
}

// True if placing `mover` at (x, y) would overlap `other` specifically. This is the targeted
// cousin of isMoveFree: it ignores every other character and only asks about one opponent. The
// game-over contact check needs exactly that — an enemy may be blocked by a *second* enemy at
// the same time it is blocked by the player, and only the second test is what "the bee touched
// the hero" means. Callers must pass a registered collider for both arguments; `mover` is always
// a moving character (a circle), while `other` may be a circle or an obstacle box.
export function wouldOverlap(mover, x, y, other) {
  return penetrationOf(x, y, mover.radius, other) > EPSILON;
}

// True if moving `mover` to (x, y) is allowed: the step must land clear of every other
// character (spec: "only update an object's coordinates if the intended next position is
// validated as collision-free"). A character that is already clear of another one is NEVER
// allowed to step into it — that is what keeps Tode from walking through a bee.
//
// Callers do not hand this a whole frame's step and stop when it returns false: they advance in
// increments of at most MAX_MOVE_SUB_STEP and stop at the first rejection, so they come to rest
// right at the boundary instead of a variable distance short of it (see MAX_MOVE_SUB_STEP above).
//
// The one deliberate exception: a character that is *already* overlapping another may take a
// step that does not deepen that overlap, so it can always back out instead of being frozen
// inside a shape. This only ever applies once an overlap exists (which the rule above makes
// impossible in normal play); it is the safety hatch for odd states like a jammed spawn.
export function isMoveFree(mover, x, y) {
  for (const other of colliders.values()) {
    if (other === mover) continue;
    const after = penetrationOf(x, y, mover.radius, other);
    if (after <= EPSILON) continue; // lands clear of this one
    const before = penetrationOf(mover.position.x, mover.position.y, mover.radius, other);
    if (before <= EPSILON) return false; // was clear — may not enter now
    if (after > before + EPSILON) return false; // already inside — may not push deeper
  }
  return true;
}

// True if no other character currently overlaps the circle at (x, y). Stricter than
// isMoveFree: it does not forgive an overlap, which is what placing a brand-new character
// wants (a fresh spawn has no "current" position worth protecting).
export function isSpotFree(x, y, radius) {
  for (const other of colliders.values()) {
    if (penetrationOf(x, y, radius, other) > EPSILON) return false;
  }
  return true;
}

// Measures a character's collision shape from its own geometry. Call it on the model while it
// is still unparented and already at its final scale/rotation — everything is reported in the
// character's own frame, which is exactly the frame its group's position lives in.
//
// Returns:
//   radius        max ground-plane distance from the model's centre to any of its surface
//                 points. A circumscribing circle: generous on the diagonals, but it can
//                 never let two characters visually overlap.
//   groundOffset  lift to add to model.position.z so the lowest point rests on z = 0.
//
// TODO: a circle already beats a box for a rounded character, but an ellipse would hug the
//       toad/bee silhouettes better. Only worth it if the resulting gap looks too big.
export function measureCollisionShape(object) {
  // Refresh the world matrices BEFORE reading any vertex. SkeletonUtils.clone() leaves the
  // cloned skeleton's bone matrices stale, and measuring before they refresh is what threw
  // the enemies 689 units off the map in an earlier bug (the box came out ~100x too large).
  // With fresh matrices, this walk and Box3.setFromObject give identical results — verified
  // against three.js's own precise path for both of our models.
  object.updateMatrixWorld(true);

  let radius = 0;
  let minZ = Infinity;
  const vertex = new THREE.Vector3();

  object.traverse((child) => {
    if (!child.isMesh) return;
    const positions = child.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      // getVertexPosition() applies the skinning (bones + inverse bind matrices) for a
      // SkinnedMesh and the plain geometry for a Mesh; matrixWorld then brings the point
      // into the character's frame. Doing it once per vertex at load time is cheap.
      child.getVertexPosition(i, vertex).applyMatrix4(child.matrixWorld);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
      minZ = Math.min(minZ, vertex.z);
    }
  });

  return { radius, groundOffset: -minZ };
}
