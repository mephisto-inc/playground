import { cloneMaterials, cloneModel, enableShadows, loadGLTF, normalizeModel } from '../core/Assets.js';
import { ARENA, SPAWN_POINTS, TREES } from '../config/tuning.js';
import { getHouseCenters } from './Houses.js';

// Trees component: the decorative forest around and inside the arena. Pines fill a ring just
// beyond the boundary walls (the spawn points sit in that ring); twisted trees scatter over the
// arena floor. Every tree is placed once at startup and never moves.
//
// Trees are pure decoration — they register no colliders, so movement, shots and targeting all
// ignore them. Two things still react to them:
//   * the shadow map — every tree casts and receives the moonlight shadows;
//   * the camera — a tree standing between the camera and the player fades to TREES.fadeOpacity
//     (see updateTreeFade; player-only, enemies never trigger it).
//
// The instances live in the arena's map group, so the main menu's slow spin carries them along.

// The live trees: { model, materials, opacity }. `materials` are per-instance clones so fading
// one tree never touches its siblings; `opacity` is the current fade level.
const trees = [];

// Loaded templates by asset id (a failed load simply leaves its id out of the map).
const templates = new Map();

// Ground-plane basis of the fixed isometric camera (azimuth -45 deg, see config/tuning.js):
// the view direction's ground projection is (-0.707, 0.707); screen-right is (0.707, 0.707).
const FADE_FORWARD_X = -Math.SQRT1_2;
const FADE_FORWARD_Y = Math.SQRT1_2;
const FADE_RIGHT_X = Math.SQRT1_2;
const FADE_RIGHT_Y = Math.SQRT1_2;

// How far to the side of the player's view column (in world units) a tree may sit and still
// count as occluding. Roughly the visual width of a trunk-plus-lower-canopy column.
const FADE_LATERAL = 1.6;

// Loads every tree template once. Called by initTrees; a missing model is logged and skipped,
// the forest simply has one variant fewer.
async function loadTemplates() {
    const ids = [...TREES.pines, ...TREES.twisted];
    const results = await Promise.all(ids.map(async (id) => {
        try {
            return [id, (await loadGLTF(`/assets/${id}.glb`)).scene];
        } catch (error) {
            console.error(`Failed to load tree model ${id}.glb`, error);
            return [id, null];
        }
    }));
    for (const [id, scene] of results) {
        if (scene) templates.set(id, scene);
    }
}

// Plants one tree of the given variant pool at (x, y): random variant, random height inside
// [heightMin, heightMax] times the per-instance jitter, random yaw. Returns the model, or null
// when none of the pool's templates loaded.
function plantTree(mapGroup, variantIds, heightMin, heightMax, x, y) {
    const available = variantIds.filter((id) => templates.has(id));
    if (available.length === 0) return null;

    const id = available[Math.floor(Math.random() * available.length)];
    const model = cloneModel(templates.get(id));
    const jitter = TREES.heightJitterMin
        + Math.random() * (TREES.heightJitterMax - TREES.heightJitterMin);
    const height = (heightMin + Math.random() * (heightMax - heightMin)) * jitter;
    const yaw = Math.random() * Math.PI * 2; // full turn: trees are round, any angle looks right

    const { groundOffset } = normalizeModel(model, { targetHeight: height, yaw });
    model.position.set(x, y, groundOffset); // groundOffset rests the lowest vertex on the floor

    const materials = cloneMaterials(model); // per-instance copies for the occlusion fade
    enableShadows(model);
    model.traverse((child) => {
        if (child.isMesh) child.receiveShadow = true;
    });
    mapGroup.add(model);

    trees.push({ model, materials, opacity: 1 });
    return model;
}

// A random point in the forest ring: inside the rectangle expanded by TREES.ringDepth, but
// outside the one expanded by TREES.ringStart (so every point is at least ringStart units beyond
// the wall's outer surface). Null when the candidate lands too close to the walls.
function randomRingPoint() {
    const halfX = ARENA.width / 2 + ARENA.wallThickness;
    const halfY = ARENA.depth / 2 + ARENA.wallThickness;
    const outerX = halfX + TREES.ringDepth;
    const outerY = halfY + TREES.ringDepth;
    const innerX = halfX + TREES.ringStart;
    const innerY = halfY + TREES.ringStart;

    const x = (Math.random() * 2 - 1) * outerX;
    const y = (Math.random() * 2 - 1) * outerY;
    if (Math.abs(x) <= innerX && Math.abs(y) <= innerY) return null;
    return { x, y };
}

// A random twisted-tree point inside the arena, or null when it lands in a keep-out zone: the
// center clearing, a house clearance circle, or a spawn lane (the walking lines from the 8
// spawn points to the center — those must stay visually open).
function randomScatterPoint() {
    const x = (Math.random() * 2 - 1) * (ARENA.width / 2 - TREES.arenaMargin);
    const y = (Math.random() * 2 - 1) * (ARENA.depth / 2 - TREES.arenaMargin);

    if (Math.hypot(x, y) < TREES.centerClearance) return null;
    for (const house of getHouseCenters()) {
        if (Math.hypot(x - house.x, y - house.y) < TREES.houseClearance) return null;
    }
    for (const spawn of SPAWN_POINTS) {
        if (distanceToSegment(x, y, spawn.x, spawn.y, 0, 0) < TREES.spawnLaneClearance) {
            return null;
        }
    }
    return { x, y };
}

// Ground distance from point P to the segment A-B (used for the spawn-lane clearance).
function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq > 0
        ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq))
        : 0;
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

// True when `point` keeps at least TREES.minSpacing from every already-placed tree.
function isFarFromPlaced(point, placed) {
    const minSq = TREES.minSpacing * TREES.minSpacing;
    for (const other of placed) {
        const dx = point.x - other.x;
        const dy = point.y - other.y;
        if (dx * dx + dy * dy < minSq) return false;
    }
    return true;
}

// Loads the tree templates and plants the whole forest. Called once from main.js with the arena
// group (map). A failed template load is logged and skipped, never blocking the game.
export async function initTrees(mapGroup) {
    await loadTemplates();

    const placed = []; // ground positions already taken (both zones share the spacing rule)

    // The pine ring: attempts run until ringCount trees stand or the attempt budget runs out.
    let ringPlaced = 0;
    for (let attempt = 0; attempt < TREES.ringAttempts && ringPlaced < TREES.ringCount; attempt++) {
        const point = randomRingPoint();
        if (!point || !isFarFromPlaced(point, placed)) continue;
        const tree = plantTree(
            mapGroup, TREES.pines, TREES.pineHeightMin, TREES.pineHeightMax, point.x, point.y,
        );
        if (!tree) break; // no pine templates loaded: nothing left to plant
        placed.push(point);
        ringPlaced++;
    }

    // The inner scatter: twisted trees, same attempt-budget pattern.
    let scatterPlaced = 0;
    for (let attempt = 0; attempt < TREES.scatterAttempts && scatterPlaced < TREES.scatterCount; attempt++) {
        const point = randomScatterPoint();
        if (!point || !isFarFromPlaced(point, placed)) continue;
        const tree = plantTree(
            mapGroup, TREES.twisted, TREES.twistedHeightMin, TREES.twistedHeightMax,
            point.x, point.y,
        );
        if (!tree) break;
        placed.push(point);
        scatterPlaced++;
    }
}

// Per-frame occlusion fade, called from main.js (skipped in the main menu, where the player is
// hidden and the world spins). A tree inside TREES.fadeCheckRadius of the player fades toward
// TREES.fadeOpacity when it stands on the player's view column between the camera and the
// player: its ground position is toward the camera along the view direction (a negative
// projection on FADE_FORWARD) and within FADE_LATERAL of the column's centre line. Everything
// else fades back to fully opaque. Fade speed: full swing in TREES.fadeDuration seconds.
export function updateTreeFade(delta, playerPosition) {
    if (trees.length === 0) return;

    const radiusSq = TREES.fadeCheckRadius * TREES.fadeCheckRadius;
    const step = TREES.fadeDuration > 0 ? delta / TREES.fadeDuration : 1;

    for (const tree of trees) {
        const dx = tree.model.position.x - playerPosition.x;
        const dy = tree.model.position.y - playerPosition.y;

        let target = 1;
        if (dx * dx + dy * dy <= radiusSq) {
            const along = dx * FADE_FORWARD_X + dy * FADE_FORWARD_Y;
            if (along < 0) { // nearer the camera than the player along the view direction
                const lateral = Math.abs(dx * FADE_RIGHT_X + dy * FADE_RIGHT_Y);
                if (lateral <= FADE_LATERAL) target = TREES.fadeOpacity;
            }
        }

        if (tree.opacity === target) continue;
        tree.opacity = target < tree.opacity
            ? Math.max(target, tree.opacity - step)
            : Math.min(target, tree.opacity + step);

        // transparent is enabled only while fading: a fully opaque tree renders in the opaque
        // pass (correct depth sorting), and toggling it needs no shader rebuild.
        const transparent = tree.opacity < 1;
        for (const material of tree.materials) {
            material.transparent = transparent;
            material.opacity = tree.opacity;
        }
    }
}
