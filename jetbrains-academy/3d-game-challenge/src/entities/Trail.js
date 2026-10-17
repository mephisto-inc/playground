import * as THREE from "three";
import { distanceToSegment } from "../core/MathUtils.js";
import { TRAIL } from "../config/tuning.js";

const quadGeometry = new THREE.PlaneGeometry(1, 1);

const trails = [];
let sceneRef = null;

export function spawnTrail(x1, y1, x2, y2, duration, width) {
  if (!sceneRef) return;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) return;

  const material = new THREE.MeshBasicMaterial({
    color: TRAIL.color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(quadGeometry, material);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.06);
  mesh.scale.set(length, width, 1);

  mesh.rotation.z = Math.atan2(dy, dx);
  sceneRef.add(mesh);

  trails.push({ mesh, x1, y1, x2, y2, ttl: duration, duration, width });
}

export function updateTrails(delta) {
  for (let i = trails.length - 1; i >= 0; i--) {
    const trail = trails[i];
    trail.ttl -= delta;
    if (trail.ttl <= 0) {
      trails.splice(i, 1);
      if (trail.mesh.parent) trail.mesh.parent.remove(trail.mesh);
      continue;
    }

    trail.mesh.material.opacity = 0.35 * (trail.ttl / trail.duration);
  }
}

export function isInsideTrail(x, y) {
  for (const trail of trails) {
    if (
      distanceToSegment(x, y, trail.x1, trail.y1, trail.x2, trail.y2) <=
      trail.width / 2
    ) {
      return true;
    }
  }
  return false;
}

export function clearTrails() {
  for (let i = trails.length - 1; i >= 0; i--) {
    const trail = trails[i];
    trails.splice(i, 1);
    if (trail.mesh.parent) trail.mesh.parent.remove(trail.mesh);
  }
}

export function initTrails(scene) {
  sceneRef = scene;
}
