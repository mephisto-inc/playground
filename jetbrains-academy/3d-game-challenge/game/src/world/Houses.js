import * as THREE from 'three';
import { cloneModel, enableShadows, loadGLTF, normalizeModel } from '../core/Assets.js';
import { registerBoxCollider } from '../core/Collision.js';

// Houses component (GDD 5): places the five fixed houses at their exact GDD positions. Houses
// block both movement and shots (they register box colliders), and four of them double as cover
// for the 8 spawn points behind them.
//
// Placement notes:
//   * Positions and model files come straight from the GDD house table (House 1..5).
//   * Scale is derived from geometry (normalizeModel) with a cap on footprint size, so every
//     model lands at a similar visual size and no house pokes through the boundary walls.
//   * Rotations are quarter turns (multiples of 90 deg) chosen to face the arena centre, which
//     keeps every footprint axis-aligned so the AABB collider is exact.

// One entry per GDD house: id, model, position, and the GDD "role" kept as a comment trail.
// Positions: the GDD's original table, pulled toward the centre for the round-5 97.2 x 64.8
// arena (each round-4 coordinate x0.8 — the "closer to the centre by 20%" request). The big
// wall gaps this opens are documented in the footprint note below.
const HOUSES = [
    { asset: '053kskrV4U_', x: -35.2, y: 20.8 },  // House 1 — Mansion (Northwest corner)
    { asset: 'oJJIRwv6Bo', x: 35.2, y: 20.8 },    // House 2 — Townhouse (Northeast corner)
    { asset: 'L7h0SjZX2K', x: -35.2, y: -20.8 },  // House 3 — Residence (Southwest corner)
    { asset: 'vZ1CLbWmSx', x: 35.2, y: -20.8 },   // House 4 — Building (Southeast corner)
    { asset: 'wxi3kAu5ey', x: -11, y: 7 },        // House 5 — Hut (offset cover near the centre)
];

// Target height of every house, in world units. The GDD fixes the positions but not the scale;
// 5.5 units tall reads as a proper building against the 97.2 x 64.8 arena and the ~1-unit player.
const HOUSE_HEIGHT = 5.5;

// Maximum footprint (the longer of the two ground-plane extents) a house may occupy. Corners
// sit 13.4 units inside the walls on X (35.2 vs 48.6) and 11.6 on Y (20.8 vs 32.4), so even a
// full 7-unit footprint leaves 9.9 units (X) / 8.1 units (Y) of walking room between the house
// and the wall — more than enough for the spawn-point enemies to walk out instead of wedging.
// Central house is untouched by this cap.
const HOUSE_MAX_FOOTPRINT = 7;

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
    // reference. Houses never move, so it stays valid for the whole run.
    const halfWidth = size.x / 2;
    const halfDepth = size.y / 2;
    registerBoxCollider(group, group.position, halfWidth, halfDepth);
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

// Sanity note for future edits: houses must not overlap each other or the arena walls. The
// positions above guarantee this at the current footprint cap (each corner house keeps ≥6.5
// units to the walls); if positions or scales change, verify with a quick visual pass.
