import * as THREE from 'three';

// Trail component (Dasher class): the ground trail left by the dash. It is a translucent strip
// lying on the floor that slows enemies standing on it — common enemies more than the Boss.
//
// The trail is purely geometric: one quad per dash (a stretched plane), fading out over its
// lifetime. Slowdown queries test the enemy's ground position against each live segment.

// Shared unit plane: scaled per trail (length x width) so no geometry is built per dash.
const quadGeometry = new THREE.PlaneGeometry(1, 1);

// Trail color: a cool cyan that reads as "superhero speed" over the cobblestone floor.
const TRAIL_COLOR = 0x4dd2ff;

// Every live trail: { mesh, x1, y1, x2, y2, ttl, duration, width }.
const trails = [];
let sceneRef = null;

// Lays a trail from (x1, y1) to (x2, y2). `duration` is its full lifetime in seconds (from the
// Dasher class ability definition), `width` the across-the-strip width in world units.
export function spawnTrail(x1, y1, x2, y2, duration, width) {
    if (!sceneRef) return;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) return; // a zero-length dash leaves nothing

    const material = new THREE.MeshBasicMaterial({
        color: TRAIL_COLOR,
        transparent: true,
        opacity: 0.35,
        depthWrite: false, // transparent decal; must not fight other transparent draws
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(quadGeometry, material);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.06); // just above the floor, below pickups
    mesh.scale.set(length, width, 1);
    // The unit plane's long axis is +X; rotate it to lie along the dash direction.
    mesh.rotation.z = Math.atan2(dy, dx);
    sceneRef.add(mesh);

    trails.push({ mesh, x1, y1, x2, y2, ttl: duration, duration, width });
}

// Advances every trail's fade and removes the expired ones.
export function updateTrails(delta) {
    for (let i = trails.length - 1; i >= 0; i--) {
        const trail = trails[i];
        trail.ttl -= delta;
        if (trail.ttl <= 0) {
            trails.splice(i, 1);
            if (trail.mesh.parent) trail.mesh.parent.remove(trail.mesh);
            continue;
        }
        // Linear fade keeps the strip readable for most of its life, then gone.
        trail.mesh.material.opacity = 0.35 * (trail.ttl / trail.duration);
    }
}

// Speed multiplier for a character standing at (x, y): 1 outside every trail, otherwise the
// given in-trail factor (the caller passes the class ability's value — common enemies use one,
// the Boss a weaker one). When trails overlap the strongest slow wins, enforced by taking the
// minimum.
export function getTrailSpeedFactor(x, y, inTrailFactor) {
    let factor = 1;
    for (const trail of trails) {
        // Distance from the point to the trail segment, compared against the half-width.
        const dx = trail.x2 - trail.x1;
        const dy = trail.y2 - trail.y1;
        const lengthSq = dx * dx + dy * dy;
        let t = 0;
        if (lengthSq > 1e-9) {
            t = ((x - trail.x1) * dx + (y - trail.y1) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t)); // clamp to the segment
        }
        const closestX = trail.x1 + dx * t;
        const closestY = trail.y1 + dy * t;
        if (Math.hypot(x - closestX, y - closestY) <= trail.width / 2) {
            factor = Math.min(factor, inTrailFactor);
        }
    }
    return factor;
}

// Removes every trail (new run / reset). Called by Run.resetWorld().
export function clearTrails() {
    for (let i = trails.length - 1; i >= 0; i--) {
        const trail = trails[i];
        trails.splice(i, 1);
        if (trail.mesh.parent) trail.mesh.parent.remove(trail.mesh);
    }
}

// Stores the scene trails are added to. Called once from main.js.
export function initTrails(scene) {
    sceneRef = scene;
}
