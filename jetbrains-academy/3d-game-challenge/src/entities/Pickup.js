import * as THREE from "three";
import {PICKUP} from "../config/tuning.js";
import {isInsideTrail} from "./Trail.js";

function makeHeartShape() {
  const shape = new THREE.Shape();

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

const heartMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4d6d,
  side: THREE.DoubleSide,
});

const powerupGeometry = new THREE.PlaneGeometry(0.55, 0.55);
const powerupMaterial = new THREE.MeshBasicMaterial({
  color: 0x9b6bff,
  side: THREE.DoubleSide,
});

const pickups = [];
let sceneRef = null;
let elapsed = 0;

export function spawnHeart(x, y) {
  spawnPickup("heart", heartGeometry, heartMaterial, x, y);
}

export function spawnPowerupDrop(x, y) {
  spawnPickup("powerup", powerupGeometry, powerupMaterial, x, y);
}

function spawnPickup(kind, geometry, material, x, y) {
  if (!sceneRef) return;
  const mesh = new THREE.Mesh(geometry, material);

  mesh.scale.setScalar(0.6);
  mesh.position.set(x, y, 0.15);

  mesh.rotation.z =
    Math.random() * Math.PI * 2 + (kind === "powerup" ? Math.PI / 4 : 0);
  sceneRef.add(mesh);
  pickups.push({mesh, kind, age: 0, t: Math.random() * Math.PI * 2});
}

export function updatePickups(delta, playerX, playerY, magnetRadius) {
  elapsed += delta;
  const collected = {hearts: 0, powerups: 0};

  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.age += delta;

    const dx = playerX - pickup.mesh.position.x;
    const dy = playerY - pickup.mesh.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= PICKUP.collectRadius) {
      collected[pickup.kind === "powerup" ? "powerups" : "hearts"]++;
      removePickupAt(i);
      continue;
    }

    if (isInsideTrail(pickup.mesh.position.x, pickup.mesh.position.y)) {
      collected[pickup.kind === "powerup" ? "powerups" : "hearts"]++;
      removePickupAt(i);
      continue;
    }

    if (distance <= magnetRadius && distance > 1e-6) {
      const pull = Math.min(distance, 8 * delta);
      pickup.mesh.position.x += (dx / distance) * pull;
      pickup.mesh.position.y += (dy / distance) * pull;
    }

    const pulse =
      1 +
      PICKUP.pulseAmplitude *
      Math.sin(elapsed * PICKUP.pulseHz * Math.PI * 2 + pickup.t);
    pickup.mesh.scale.setScalar(0.6 * pulse);
    pickup.mesh.rotation.z += delta * 0.8;

    const lifetime =
      pickup.kind === "powerup" ? PICKUP.powerupLifetime : PICKUP.lifetime;
    if (pickup.age >= lifetime) {
      removePickupAt(i);
    }
  }

  return collected;
}

export function sweepPickups(x, y, radius) {
  const collected = {hearts: 0, powerups: 0};
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    const dx = pickup.mesh.position.x - x;
    const dy = pickup.mesh.position.y - y;
    if (Math.hypot(dx, dy) > radius) continue;
    collected[pickup.kind === "powerup" ? "powerups" : "hearts"]++;
    removePickupAt(i);
  }
  return collected;
}

function removePickupAt(index) {
  const pickup = pickups[index];
  pickups.splice(index, 1);
  if (pickup.mesh.parent) pickup.mesh.parent.remove(pickup.mesh);
}

export function clearPickups() {
  for (let i = pickups.length - 1; i >= 0; i--) removePickupAt(i);
}

export function initPickups(scene) {
  sceneRef = scene;
}
