import * as THREE from 'three';
import { PICKUP } from '../config/tuning.js';

// Pickup component: drop items that enemies and bosses leave behind. The 3D asset set has no
// pickup model, so everything is built from flat shapes that stay readable from the top-down
// camera with zero extra assets:
//   * heart   — red heart (heals one heart; magnet-attracted; 30 s life)
//   * powerup — purple diamond card (opens a bonus power-up draft; NOT magnet-attracted, must
//               be walked or dashed over; 10 s life)

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

// The power-up drop is a square rotated 45 degrees into a diamond (a "card"), flat on the floor.
const powerupGeometry = new THREE.PlaneGeometry(0.55, 0.55);
const powerupMaterial = new THREE.MeshBasicMaterial({
    color: 0x9b6bff,
    side: THREE.DoubleSide,
});

// Every live pickup: { mesh, kind: 'heart' | 'powerup', age, t }.
const pickups = [];
let sceneRef = null;
let elapsed = 0; // shared clock for the cosmetic pulse

// Spawns one heart at (x, y) on the ground. Called by Enemy/Boss on kill drops.
export function spawnHeart(x, y) {
    spawnPickup('heart', heartGeometry, heartMaterial, x, y);
}

// Spawns one power-up card at (x, y) on the ground. Called by Boss on its rare bonus drop.
export function spawnPowerupDrop(x, y) {
    spawnPickup('powerup', powerupGeometry, powerupMaterial, x, y);
}

function spawnPickup(kind, geometry, material, x, y) {
    if (!sceneRef) return;
    const mesh = new THREE.Mesh(geometry, material);
    // ~0.84 units across, sized against the 1.0-unit player.
    mesh.scale.setScalar(0.6);
    mesh.position.set(x, y, 0.15);
    // Random spin so drops do not look stamped; the diamond gets an extra 45 degrees to face
    // the camera as a diamond rather than a square.
    mesh.rotation.z = Math.random() * Math.PI * 2 + (kind === 'powerup' ? Math.PI / 4 : 0);
    sceneRef.add(mesh);
    pickups.push({ mesh, kind, age: 0, t: Math.random() * Math.PI * 2 });
}

// Advances every pickup: heartbeat pulse, magnet attraction (hearts only) and collection.
//
//   * `playerX/playerY` — the hero's ground position.
//   * `magnetRadius`    — the pickup attraction radius (doubled by the Point Magnet card).
//
// Returns { hearts, powerups }: how many of each were collected this frame. Combat applies the
// healing/sound/draft logic, keeping this module free of Player and Run imports.
export function updatePickups(delta, playerX, playerY, magnetRadius) {
    elapsed += delta;
    const collected = { hearts: 0, powerups: 0 };

    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        pickup.age += delta;

        const dx = playerX - pickup.mesh.position.x;
        const dy = playerY - pickup.mesh.position.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= PICKUP.collectRadius) {
            // Close enough: consume it.
            collected[pickup.kind === 'powerup' ? 'powerups' : 'hearts']++;
            removePickupAt(i);
            continue;
        }

        // Power-up cards are never magnet-attracted (they must be walked/dashed over), so the
        // pull only applies to hearts.
        if (pickup.kind === 'heart' && distance <= magnetRadius && distance > 1e-6) {
            // Magnet pull: move toward the player fast enough to feel snappy, but never
            // overshooting past them in one frame.
            const pull = Math.min(distance, 8 * delta);
            pickup.mesh.position.x += (dx / distance) * pull;
            pickup.mesh.position.y += (dy / distance) * pull;
        }

        // Cosmetic heartbeat: the pickup stays flat on the floor (z fixed — a vertical bob dipped
        // the flat mesh under the floor plane and read as the item blinking out) and instead
        // pulsates its size around the base 0.6 scale, plus a slow spin so drops still read as
        // alive.
        const pulse = 1 + PICKUP.pulseAmplitude
            * Math.sin(elapsed * PICKUP.pulseHz * Math.PI * 2 + pickup.t);
        pickup.mesh.scale.setScalar(0.6 * pulse);
        pickup.mesh.rotation.z += delta * 0.8;

        // Uncollected items are eventually removed, so the floor does not litter over a long run.
        // Power-up cards expire faster than hearts (they are worth much more).
        const lifetime = pickup.kind === 'powerup' ? PICKUP.powerupLifetime : PICKUP.lifetime;
        if (pickup.age >= lifetime) {
            removePickupAt(i);
        }
    }

    return collected;
}

// Collects every pickup whose center lies within `radius` of (x, y) instantly, ignoring the
// magnet rules — used by the Dasher to vacuum drops touched by a dash (dash pickups are queued
// on the Player and handled by Combat like normal pickups). Returns { hearts, powerups }.
export function sweepPickups(x, y, radius) {
    const collected = { hearts: 0, powerups: 0 };
    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        const dx = pickup.mesh.position.x - x;
        const dy = pickup.mesh.position.y - y;
        if (Math.hypot(dx, dy) > radius) continue;
        collected[pickup.kind === 'powerup' ? 'powerups' : 'hearts']++;
        removePickupAt(i);
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
