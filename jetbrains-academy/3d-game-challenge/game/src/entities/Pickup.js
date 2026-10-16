import * as THREE from 'three';
import { PICKUP } from '../config/tuning.js';

// Pickup component: health items that enemies and bosses drop. The 3D asset set has no pickup
// model, so a flat red heart built from a Shape keeps it readable from the top-down camera with
// zero extra assets.

// One heart shape, reused by every pickup's geometry (shapes are cheap to build once).
function makeHeartShape() {
    const shape = new THREE.Shape();
    // Classic heart outline drawn in the XY plane: two bumps and a point. Numbers below are
    // relative units; the mesh is scaled to its final size at spawn.
    const x = 0;
    const y = 0;
    shape.moveTo(x, y + 0.5);
    shape.bezierCurveTo(x, y + 0.8, x - 0.6, y + 0.8, x - 0.6, y + 0.3);
    shape.bezierCurveTo(x - 0.6, y - 0.1, x, y - 0.3, x, y - 0.6);
    shape.bezierCurveTo(x, y - 0.3, x + 0.6, y - 0.1, x + 0.6, y + 0.3);
    shape.bezierCurveTo(x + 0.6, y + 0.8, x, y + 0.8, x, y + 0.5);
    return shape;
}

const heartGeometry = new THREE.ShapeGeometry(makeHeartShape());

// The heart lies flat: ShapeGeometry is authored in the XY plane facing +Z, which is exactly the
// ground plane of this Z-up scene — no rotation needed.
const heartMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4d6d,
    side: THREE.DoubleSide,
});

// Every live pickup: { mesh, age }.
const pickups = [];
let sceneRef = null;
let elapsed = 0; // shared clock for the cosmetic heartbeat pulse

// Spawns one heart at (x, y) on the ground. Called by Enemy/Boss on kill drops.
export function spawnHeart(x, y) {
    if (!sceneRef) return;
    const mesh = new THREE.Mesh(heartGeometry, heartMaterial);
    // ~0.84 units across, sized against the 1.0-unit player.
    mesh.scale.setScalar(0.6);
    mesh.position.set(x, y, 0.15);
    mesh.rotation.z = Math.random() * Math.PI * 2; // random spin so drops do not look stamped
    sceneRef.add(mesh);
    pickups.push({ mesh, age: 0, t: Math.random() * Math.PI * 2 });
}

// Advances every pickup: heartbeat pulse, magnet attraction and collection.
//
//   * `playerX/playerY` — the hero's ground position.
//   * `magnetRadius`    — the pickup attraction radius (doubled by the Point Magnet card).
//
// Returns how many hearts were collected this frame; Combat applies the healing and the pickup
// sound, keeping this module free of Player imports.
export function updatePickups(delta, playerX, playerY, magnetRadius) {
    elapsed += delta;
    let collected = 0;

    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        pickup.age += delta;

        const dx = playerX - pickup.mesh.position.x;
        const dy = playerY - pickup.mesh.position.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= PICKUP.collectRadius) {
            // Close enough: consume it.
            collected++;
            removePickupAt(i);
            continue;
        }

        if (distance <= magnetRadius && distance > 1e-6) {
            // Magnet pull: move toward the player fast enough to feel snappy, but never
            // overshooting past them in one frame.
            const pull = Math.min(distance, 8 * delta);
            pickup.mesh.position.x += (dx / distance) * pull;
            pickup.mesh.position.y += (dy / distance) * pull;
        }

        // Cosmetic heartbeat: the heart stays flat on the floor (z fixed — a vertical bob dipped
        // the flat mesh under the floor plane and read as the heart blinking out) and instead
        // pulsates its size around the base 0.6 scale, plus a slow spin so drops still read as
        // alive.
        const pulse = 1 + PICKUP.pulseAmplitude
            * Math.sin(elapsed * PICKUP.pulseHz * Math.PI * 2 + pickup.t);
        pickup.mesh.scale.setScalar(0.6 * pulse);
        pickup.mesh.rotation.z += delta * 0.8;

        // Uncollected hearts are eventually removed, so the floor does not litter over a long run.
        if (pickup.age >= PICKUP.lifetime) {
            removePickupAt(i);
        }
    }

    return collected;
}

function removePickupAt(index) {
    const pickup = pickups[index];
    pickups.splice(index, 1);
    if (pickup.mesh.parent) pickup.mesh.parent.remove(pickup.mesh);
}

// Removes every pickup (new run / reset). Called by Run.resetWorld().
export function clearPickups() {
    for (let i = pickups.length - 1; i >= 0; i--) removePickupAt(i);
}

// Stores the scene pickups are added to. Called once from main.js.
export function initPickups(scene) {
    sceneRef = scene;
}
