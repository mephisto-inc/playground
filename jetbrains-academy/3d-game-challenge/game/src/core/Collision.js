import * as THREE from 'three';
import { COLLISION } from '../config/tuning.js';

// Collision module: two shared responsibilities —
//
//   * MOVEMENT (isMoveFree / isObstacleFree) — "may a mover stand at (x, y)?". Only static
//     boxes block movement/shots: houses and the arena's boundary walls. Characters pass
//     through each other; contact between them is a separate overlap test.
//
//   * DETECTION (circlesTouch / isSpotFree) — "do these two circles touch?" / "is this spawn
//     spot clear of everything?". circlesTouch takes both centres explicitly, so player-facing
//     tests can use the player's VISUAL centre (which follows the hop's lean) instead of the
//     feet position his collider stores.
//
// Everything is 2D on the ground plane: height is ignored, so a hopping player is still blocked
// by a house and an airborne enemy still touches Tode.

// The size multipliers and the contact padding live in config/tuning.js (COLLISION); radii are
// scaled where they are measured so every consumer reads one consistent number.

// The largest world-space increment a mover may advance per collision check. Both characters and
// projectiles advance in sub-steps of at most this size, so fast movement cannot tunnel through a
// wall and a mover always comes to rest right at the boundary instead of a frame's-step short.
export const MAX_MOVE_SUB_STEP = 0.1;

// Tolerance so a step landing a hair inside a boundary due to floating-point rounding is not
// treated as an overlap.
const EPSILON = 1e-6;

// Registry of every collider, keyed by its owner object. Character circles keep their position
// Vector3 by reference (it always reflects the live object); box colliders store a fixed point.
const colliders = new Map();

// Registers a moving character's circular collider and returns it. Registering the same owner
// again replaces the previous collider.
export function registerCollider(owner, position, radius) {
    const collider = { position, shape: 'circle', radius };
    colliders.set(owner, collider);
    return collider;
}

// Registers a static axis-aligned box obstacle (house or boundary wall) and returns it.
// `halfWidth`/`halfDepth` are half-extents along world X/Y. Only quarter-turn yaws are used on
// houses, so their footprints stay axis-aligned and a plain AABB is exact.
//
// `options.boundary` marks the arena's border walls: they still block the player and every
// projectile, but enemies and the boss may ignore them (they spawn outside the arena and must
// walk in; see isMoveFree's ignoreBoundary parameter).
export function registerBoxCollider(owner, position, halfWidth, halfDepth, options = {}) {
    const collider = { position, shape: 'box', halfWidth, halfDepth, boundary: !!options.boundary };
    colliders.set(owner, collider);
    return collider;
}

export function unregisterCollider(owner) {
    colliders.delete(owner);
}

// Read-only lookup of the collider a character registered (used by Combat and Enemy to ask about
// the player specifically without re-deriving radii).
export function getCollider(owner) {
    return colliders.get(owner);
}

// How much a circle of `radius` centred at (x, y) overlaps `other`, in world units (0 = clear).
// One number answers both "are they touching?" and "would this move deepen the overlap?".
function penetrationOf(x, y, radius, other) {
    if (other.shape === 'box') {
        const dx = Math.max(Math.abs(x - other.position.x) - other.halfWidth, 0);
        const dy = Math.max(Math.abs(y - other.position.y) - other.halfDepth, 0);
        return Math.max(0, radius + COLLISION.padding - Math.hypot(dx, dy));
    }
    return Math.max(
        0,
        radius + other.radius + COLLISION.padding -
            Math.hypot(x - other.position.x, y - other.position.y),
    );
}

// True when two character circles touch. Both centres are explicit (unlike the direction of a
// wouldOverlap-style call), so a test can pass the player's visual centre (Player.getHitCenter)
// instead of the feet position his own collider stores. The padding matches penetrationOf.
export function circlesTouch(x1, y1, r1, x2, y2, r2) {
    return r1 + r2 + COLLISION.padding - Math.hypot(x2 - x1, y2 - y1) > EPSILON;
}

// True if moving `mover` to (x, y) is allowed: it must land clear of every static box. Characters
// are skipped entirely — they never block movement in this game.
//
// `ignoreBoundary` (enemies/boss only) skips the arena's border walls, so they can walk in from
// their outside spawn points and get pushed back out by knockback; the player never passes it.
//
// The one exception: a mover already inside a box may take a step that does not deepen the
// overlap, so it can always back out instead of being frozen (odd states like a house placed on
// top of a character).
export function isMoveFree(mover, x, y, ignoreBoundary = false) {
    for (const other of colliders.values()) {
        if (other === mover) continue;
        if (other.shape !== 'box') continue;
        if (ignoreBoundary && other.boundary) continue;
        const after = penetrationOf(x, y, mover.radius, other);
        if (after <= EPSILON) continue;
        const before = penetrationOf(mover.position.x, mover.position.y, mover.radius, other);
        if (before <= EPSILON) return false; // was clear — may not enter the box now
        if (after > before + EPSILON) return false; // already inside — may not push deeper
    }
    return true;
}

// True if a projectile (or any transient circle) may sit at (x, y): static boxes only, no
// "was inside" forgiveness — a shot that ends up inside a house must die, not slide along it.
export function isObstacleFree(x, y, radius) {
    for (const other of colliders.values()) {
        if (other.shape !== 'box') continue;
        if (penetrationOf(x, y, radius, other) > EPSILON) return false;
    }
    return true;
}

// True if the straight line from (x1, y1) to (x2, y2) stays clear of every static box inflated
// by `margin` world units. This is the line-of-sight gate checked before firing (player
// auto-shooter, minions, ranged enemies): a target behind a house is skipped instead of being
// shot "through" the wall, and passing `margin` = the shooter's projectile radius also rejects
// lines that would only graze a house corner. Character circles are ignored — they never stop
// projectiles.
//
// Implementation: the slab method clips the segment against each inflated AABB; if any part of
// the segment (t in [0, 1]) falls inside one, the line is blocked.
export function isLineSightClear(x1, y1, x2, y2, margin) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    for (const other of colliders.values()) {
        if (other.shape !== 'box') continue;

        const minX = other.position.x - other.halfWidth - margin;
        const maxX = other.position.x + other.halfWidth + margin;
        const minY = other.position.y - other.halfDepth - margin;
        const maxY = other.position.y + other.halfDepth + margin;

        let tMin = 0;
        let tMax = 1;

        // X slab: parallel lines only constrain the test when they start inside the slab.
        if (Math.abs(dx) < EPSILON) {
            if (x1 < minX || x1 > maxX) continue;
        } else {
            let t1 = (minX - x1) / dx;
            let t2 = (maxX - x1) / dx;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) continue;
        }

        // Y slab, same treatment.
        if (Math.abs(dy) < EPSILON) {
            if (y1 < minY || y1 > maxY) continue;
        } else {
            let t1 = (minY - y1) / dy;
            let t2 = (maxY - y1) / dy;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) continue;
        }

        return false; // the segment crosses this box — the line is blocked
    }
    return true;
}

// True if no registered collider currently overlaps the circle at (x, y). Used when placing a
// brand-new character (spawns), where an existing overlap is never acceptable.
export function isSpotFree(x, y, radius) {
    for (const other of colliders.values()) {
        if (penetrationOf(x, y, radius, other) > EPSILON) return false;
    }
    return true;
}

// Measures a model's collision shape and ground offset from its own geometry. Call it on the
// model while it is still unparented and already at its final scale/rotation — everything is
// reported in the character's own frame, which is the frame its group's position lives in.
//
// Returns:
//   radius        max ground-plane distance from the model's centre to any surface vertex.
//                 A circumscribing circle: generous on the diagonals but never overlapping.
//   groundOffset  lift to add to model.position.z so the lowest point rests on z = 0.
//   size          full vertex-bounds extents {x, y, z} in the model's current frame — used by
//                 normalizeModel() to scale a model to a target height at load time.
export function measureCollisionShape(object) {
    // Refresh world matrices BEFORE reading any vertex: SkeletonUtils.clone() leaves the cloned
    // skeleton's bone matrices stale, and measuring them before refresh produces wild sizes.
    object.updateMatrixWorld(true);

    let radius = 0;
    let minZ = Infinity;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const vertex = new THREE.Vector3();

    object.traverse((child) => {
        if (!child.isMesh) return;
        const positions = child.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            // getVertexPosition() applies skinning for SkinnedMesh and plain geometry otherwise;
            // matrixWorld then brings the vertex into the character's frame.
            child.getVertexPosition(i, vertex).applyMatrix4(child.matrixWorld);
            radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
            minZ = Math.min(minZ, vertex.z);
            min.min(vertex);
            max.max(vertex);
        }
    });

    // An empty model (no meshes) must not produce Infinity/-Infinity values downstream.
    if (!Number.isFinite(minZ)) {
        minZ = 0;
        min.set(0, 0, 0);
        max.set(0, 0, 0);
    }

    return {
        radius,
        groundOffset: -minZ,
        size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    };
}
