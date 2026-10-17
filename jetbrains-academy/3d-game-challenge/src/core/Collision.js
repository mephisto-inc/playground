import * as THREE from "three";
import { COLLISION } from "../config/tuning.js";

export const MAX_MOVE_SUB_STEP = 0.1;

const EPSILON = 1e-6;

const colliders = new Map();

export function registerCollider(owner, position, radius) {
  const collider = { position, shape: "circle", radius };
  colliders.set(owner, collider);
  return collider;
}

export function registerBoxCollider(
  owner,
  position,
  halfWidth,
  halfDepth,
  options = {},
) {
  const collider = {
    position,
    shape: "box",
    halfWidth,
    halfDepth,
    boundary: !!options.boundary,
  };
  colliders.set(owner, collider);
  return collider;
}

export function unregisterCollider(owner) {
  colliders.delete(owner);
}

export function getCollider(owner) {
  return colliders.get(owner);
}

function penetrationOf(x, y, radius, other) {
  if (other.shape === "box") {
    const dx = Math.max(Math.abs(x - other.position.x) - other.halfWidth, 0);
    const dy = Math.max(Math.abs(y - other.position.y) - other.halfDepth, 0);
    return Math.max(0, radius + COLLISION.padding - Math.hypot(dx, dy));
  }
  return Math.max(
    0,
    radius +
      other.radius +
      COLLISION.padding -
      Math.hypot(x - other.position.x, y - other.position.y),
  );
}

export function circlesTouch(x1, y1, r1, x2, y2, r2) {
  return r1 + r2 + COLLISION.padding - Math.hypot(x2 - x1, y2 - y1) > EPSILON;
}

export function isMoveFree(mover, x, y, ignoreBoundary = false) {
  for (const other of colliders.values()) {
    if (other === mover) continue;
    if (other.shape !== "box") continue;
    if (ignoreBoundary && other.boundary) continue;
    const after = penetrationOf(x, y, mover.radius, other);
    if (after <= EPSILON) continue;
    const before = penetrationOf(
      mover.position.x,
      mover.position.y,
      mover.radius,
      other,
    );
    if (before <= EPSILON) return false;
    if (after > before + EPSILON) return false;
  }
  return true;
}

export function isObstacleFree(x, y, radius, ignoreBoundary = false) {
  for (const other of colliders.values()) {
    if (other.shape !== "box") continue;
    if (ignoreBoundary && other.boundary) continue;
    if (penetrationOf(x, y, radius, other) > EPSILON) return false;
  }
  return true;
}

export function isLineSightClear(
  x1,
  y1,
  x2,
  y2,
  margin,
  ignoreBoundary = false,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const other of colliders.values()) {
    if (other.shape !== "box") continue;
    if (ignoreBoundary && other.boundary) continue;

    const minX = other.position.x - other.halfWidth - margin;
    const maxX = other.position.x + other.halfWidth + margin;
    const minY = other.position.y - other.halfDepth - margin;
    const maxY = other.position.y + other.halfDepth + margin;

    let tMin = 0;
    let tMax = 1;

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

    return false;
  }
  return true;
}

export function isSpotFree(x, y, radius) {
  for (const other of colliders.values()) {
    if (penetrationOf(x, y, radius, other) > EPSILON) return false;
  }
  return true;
}

export function measureCollisionShape(object) {
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
      child.getVertexPosition(i, vertex).applyMatrix4(child.matrixWorld);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
      minZ = Math.min(minZ, vertex.z);
      min.min(vertex);
      max.max(vertex);
    }
  });

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
