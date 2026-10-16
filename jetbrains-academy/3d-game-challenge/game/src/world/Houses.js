import * as THREE from 'three';
import { cloneModel, enableShadows, loadGLTF, normalizeModel } from '../core/Assets.js';
import { registerBoxCollider } from '../core/Collision.js';
import { COLLISION, TREES } from '../config/tuning.js';

// Houses component: places the five fixed houses. Houses block both movement and shots (they
// register box colliders), and four of them double as cover for the 8 spawn points behind them.
// A house standing between the camera and the player also fades to TREES.fadeOpacity — the same
// look and timing as the arena's trees (see updateHouseFade at the bottom).
//
// Placement notes:
//   * Positions and model files come from the house table below.
//   * Scale is derived from geometry (normalizeModel) with a cap on footprint size, so every
//     model lands at a similar visual size and no house pokes through the boundary walls.
//   * Rotations are quarter turns (multiples of 90 deg) chosen to face the arena centre, which
//     keeps every footprint axis-aligned so the AABB collider is exact.

// One entry per house: model asset id and ground position. The corner houses sit 31.68 units from
// the centre on X and 18.72 on Y; the fifth house is offset cover near the centre.
const HOUSES = [
    { asset: '053kskrV4U_', x: -31.68, y: 18.72 }, // House 1 — Mansion (Northwest corner)
    { asset: 'oJJIRwv6Bo', x: 31.68, y: 18.72 },   // House 2 — Townhouse (Northeast corner)
    { asset: 'L7h0SjZX2K', x: -31.68, y: -18.72 }, // House 3 — Residence (Southwest corner)
    { asset: 'vZ1CLbWmSx', x: 31.68, y: -18.72 },  // House 4 — Building (Southeast corner)
    { asset: 'wxi3kAu5ey', x: -9.9, y: 6.3 },      // House 5 — Hut (offset cover near the centre)
];

// Target height of every house, in world units. Sized to read as a proper building against the
// 87.48 x 58.32 arena and the ~1-unit player.
const HOUSE_HEIGHT = 4.95;

// The live houses for the occlusion fade: { object (the placed group), materials, opacity }.
// updateHouseFade drives them; placed houses never move, so only the opacity changes.
const houses = [];

// Occlusion-fade detection (same rule as world/Trees.js, sized for a whole building): a house
// farther than HOUSE_FADE_RADIUS from the player is never checked, and it counts as occluding
// when its centre sits within HOUSE_FADE_LATERAL of the player's view column and on the camera
// side of it. HOUSE_FADE_LATERAL is about the largest house's footprint half-diagonal
// (6.3 / 2 * sqrt(2) ~= 4.45), so any house wide enough to hide Tode still triggers.
const HOUSE_FADE_RADIUS = 12;
const HOUSE_FADE_LATERAL = 4.5;

// Ground-plane basis of the fixed isometric camera (azimuth -45 deg): the view direction's
// ground projection is (-0.707, 0.707); screen-right is (0.707, 0.707). Same as world/Trees.js.
const FADE_FORWARD_X = -Math.SQRT1_2;
const FADE_FORWARD_Y = Math.SQRT1_2;
const FADE_RIGHT_X = Math.SQRT1_2;
const FADE_RIGHT_Y = Math.SQRT1_2;

// Maximum footprint (the longer of the two ground-plane extents) a house may occupy. Corner
// houses sit 12.06 units inside the walls on X (31.68 vs 43.74) and 10.44 on Y (18.72 vs
// 29.16), so even a full 6.3-unit footprint leaves 8.9 units (X) / 7.3 units (Y) of walking
// room between the house and the wall — more than enough for the spawn-point enemies to walk
// out instead of wedging. The central house is untouched by this cap.
const HOUSE_MAX_FOOTPRINT = 6.3;

// Loads one house template and places it. The template is cloned per instance; houses are static
// meshes, so the clones share geometry/materials with it (fine — nothing here disposes them).
async function placeHouse(definition, mapGroup) {
    const gltf = await loadGLTF(`/assets/${definition.asset}.glb`);
    const template = gltf.scene;

    // Quarter-turn yaw: the nearest multiple of 90 degrees that faces the arena centre. Keeps
    // footprints axis-aligned (exact AABB colliders) while still turning fronts inward.
    const toCenter = Math.atan2(-definition.y, -definition.x);
    const yaw = Math.round(toCenter / (Math.PI / 2)) * (Math.PI / 2);

    const model = cloneModel(template);
    enableShadows(model);

    // The materials the occlusion fade touches. Each house loads its own GLB (and the template is
    // discarded), so these are already exclusive to this house — no per-instance clone needed.
    const materials = new Set();
    model.traverse((child) => {
        if (!child.isMesh) return;
        if (Array.isArray(child.material)) {
            for (const material of child.material) materials.add(material);
        } else if (child.material) {
            materials.add(child.material);
        }
    });

    // First normalization: scale to the target height with the model's own proportions.
    normalizeModel(model, { targetHeight: HOUSE_HEIGHT, yaw });

    // Cap the footprint: if the house is wider than allowed after the height fit, re-normalize
    // to a proportionally smaller height so the footprint lands exactly on the cap. (Measuring
    // world-space bounds needs a parent with fresh matrices; a scratch group supplies one.)
    const scratch = new THREE.Group();
    scratch.add(model);
    scratch.updateMatrixWorld(true);
    const firstBox = new THREE.Box3().setFromObject(scratch);
    const firstSize = firstBox.getSize(new THREE.Vector3());
    const longestFootprint = Math.max(firstSize.x, firstSize.y);
    if (longestFootprint > HOUSE_MAX_FOOTPRINT) {
        const shrinkFactor = HOUSE_MAX_FOOTPRINT / longestFootprint;
        normalizeModel(model, { targetHeight: HOUSE_HEIGHT * shrinkFactor, yaw });
    }

    // Final bounds: recentre the footprint on the group origin (so group.position is the
    // collision centre) and confirm the ground rest (normalizeModel already lifted the model;
    // recentring x/y does not disturb z).
    scratch.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scratch);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // The group carries position only; the model carries rotation/scale plus these small
    // recentring nudges, keeping `group.position` as the collider's anchor.
    const group = new THREE.Group();
    model.position.x -= center.x;
    model.position.y -= center.y;
    group.add(model);
    group.position.set(definition.x, definition.y, 0);
    mapGroup.add(group);

    // Register the collider last: group.position is final now and the collider stores it by
    // reference. Houses never move, so it stays valid for the whole run. COLLISION.houseRadiusMul
    // scales both half-extents (1 keeps the measured footprint exactly).
    const halfWidth = (size.x / 2) * COLLISION.houseRadiusMul;
    const halfDepth = (size.y / 2) * COLLISION.houseRadiusMul;
    registerBoxCollider(group, group.position, halfWidth, halfDepth);

    // Register the fade entry last: the group's final position is the fade's reference point.
    houses.push({ object: group, materials, opacity: 1 });
}

// Ground positions of every house centre. The tree scatter (world/Trees.js) uses these to keep
// its twisted trees clear of the buildings.
export function getHouseCenters() {
    return HOUSES.map((house) => ({ x: house.x, y: house.y }));
}

// Loads every house model and places the five houses. Called once from main.js with the arena
// group (so the whole world rotates together in the main menu).
//
// A failed load is logged but does not block the game: the arena simply has one house fewer.
export async function initHouses(mapGroup) {
    for (const definition of HOUSES) {
        try {
            await placeHouse(definition, mapGroup);
        } catch (error) {
            console.error(`Failed to load house model ${definition.asset}.glb`, error);
        }
    }
}

// Per-frame occlusion fade, called from main.js next to the trees' (and skipped in the main
// menu, like the trees). A house inside HOUSE_FADE_RADIUS of the player fades toward
// TREES.fadeOpacity when it stands on the player's view column between the camera and the
// player, and fades back to fully opaque when clear. Fade speed: TREES.fadeDuration seconds for
// a full swing — the exact look of the arena's trees.
export function updateHouseFade(delta, playerPosition) {
    if (houses.length === 0) return;

    const radiusSq = HOUSE_FADE_RADIUS * HOUSE_FADE_RADIUS;
    const step = TREES.fadeDuration > 0 ? delta / TREES.fadeDuration : 1;

    for (const house of houses) {
        const dx = house.object.position.x - playerPosition.x;
        const dy = house.object.position.y - playerPosition.y;

        let target = 1;
        if (dx * dx + dy * dy <= radiusSq) {
            const along = dx * FADE_FORWARD_X + dy * FADE_FORWARD_Y;
            if (along < 0) { // nearer the camera than the player along the view direction
                const lateral = Math.abs(dx * FADE_RIGHT_X + dy * FADE_RIGHT_Y);
                if (lateral <= HOUSE_FADE_LATERAL) target = TREES.fadeOpacity;
            }
        }

        if (house.opacity === target) continue;
        house.opacity = target < house.opacity
            ? Math.max(target, house.opacity - step)
            : Math.min(target, house.opacity + step);

        // transparent is enabled only while fading, exactly like the trees: a fully opaque house
        // renders in the opaque pass (correct depth sorting). Flipping the flag MUST bump
        // needsUpdate — three.js bakes the opaque/transparent mode into the compiled shader (the
        // opaque variant forces alpha to 1), so without a recompile the opacity change is ignored.
        const transparent = house.opacity < 1;
        for (const material of house.materials) {
            if (material.transparent !== transparent) {
                material.transparent = transparent;
                material.needsUpdate = true;
            }
            material.opacity = house.opacity;
        }
    }
}

// Sanity note for future edits: houses must not overlap each other or the arena walls. The
// positions above guarantee this at the current footprint cap (each corner house keeps at least
// 7.2 units to the walls); if positions or scales change, verify with a quick visual pass.
