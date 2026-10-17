import * as THREE from "three";
import { getEnemies } from "./Enemy.js";
import { spawnMinionShot } from "./Projectile.js";
import { assetUrl } from "../core/Assets.js";
import { isLineSightClear } from "../core/Collision.js";
import { playSfx } from "../systems/Audio.js";
import { COLLISION, PLAYER, PROJECTILE } from "../config/tuning.js";

let texture = null;
let texturePromise = null;

const minions = [];
let elapsed = 0;

const MINION_SHOT_SPEED = PROJECTILE.playerSpeed * PROJECTILE.minionSpeedMul;

let creationToken = 0;

function loadSpriteTexture() {
  if (texturePromise) return texturePromise;
  texturePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.src = assetUrl("/assets/tode.svg");
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, 128, 128);
      const canvasTexture = new THREE.CanvasTexture(canvas);
      canvasTexture.colorSpace = THREE.SRGBColorSpace;
      texture = canvasTexture;
      resolve(canvasTexture);
    };
    image.onerror = reject;
  });
  return texturePromise;
}

export async function createMinions(scene, ability) {
  clearMinions();
  const token = creationToken;
  try {
    await loadSpriteTexture();
  } catch (error) {
    console.error("Failed to load minion sprite (tode.svg)", error);
    return;
  }
  if (token !== creationToken) return;
  const count = ability.minionCount;
  for (let i = 0; i < count; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);

    sprite.scale.setScalar(0.9);
    const group = new THREE.Group();
    group.add(sprite);
    scene.add(group);
    minions.push({
      group,
      timer: Math.random() * ability.minionInterval,
      rateMul: 1 + (Math.random() * 2 - 1) * ability.minionRateJitter,
      angleOffset: (i / count) * Math.PI * 2,
    });
  }
}

export function updateMinions(delta, playerPos, stats, ability) {
  if (minions.length === 0) return;
  elapsed += delta;

  const fireRateMul =
    PLAYER.baseFireCooldown / Math.max(stats.fireCooldown, 0.05);
  const baseInterval = ability.minionInterval / fireRateMul;

  const range = stats.range * ability.rangeMul;
  const enemies = getEnemies();

  for (const minion of minions) {
    const angle = elapsed * ability.orbitSpeed + minion.angleOffset;
    minion.group.position.set(
      playerPos.x + Math.cos(angle) * ability.orbitRadius,
      playerPos.y + Math.sin(angle) * ability.orbitRadius,
      ability.orbitHeight,
    );

    const interval = baseInterval * minion.rateMul;
    minion.timer += delta;
    if (minion.timer < interval) continue;
    minion.timer -= interval;

    const target = findNearestEnemy(enemies, minion.group.position, range);
    if (!target) continue;

    fireVolley(minion.group.position, target, stats, ability);
    playSfx("minion_shot");
  }
}

function findNearestEnemy(enemies, position, range) {
  let best = null;
  let bestDistanceSq = range * range;
  for (const enemy of enemies) {
    if (enemy.userData.dying) continue;
    const dx = enemy.position.x - position.x;
    const dy = enemy.position.y - position.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= bestDistanceSq) continue;
    if (
      !isLineSightClear(
        position.x,
        position.y,
        enemy.position.x,
        enemy.position.y,
        PROJECTILE.playerRadius * COLLISION.projectileRadiusMul,
        true,
      )
    ) {
      continue;
    }
    bestDistanceSq = distanceSq;
    best = enemy;
  }
  return best;
}

function fireVolley(origin, target, stats, ability) {
  const damage = ability.minionDamage + (stats.damage - PLAYER.baseDamage);
  const count = Math.max(1, stats.projectiles);

  const dx = target.position.x - origin.x;
  const dy = target.position.y - origin.y;
  const distance = Math.max(Math.hypot(dx, dy), 1e-4);
  const flightTime = distance / MINION_SHOT_SPEED;
  const velocity = target.userData.velocity || { x: 0, y: 0 };
  const aimX =
    target.position.x + velocity.x * flightTime * PROJECTILE.aimLeadFactor;
  const aimY =
    target.position.y + velocity.y * flightTime * PROJECTILE.aimLeadFactor;

  const baseAngle = Math.atan2(aimY - origin.y, aimX - origin.x);
  const spread =
    (((count - 1) / 2) * (PROJECTILE.multiShotSpreadDeg * Math.PI)) / 180;

  for (let i = 0; i < count; i++) {
    const angle =
      baseAngle -
      spread +
      (i * (PROJECTILE.multiShotSpreadDeg * Math.PI)) / 180;
    const bullet = spawnMinionShot(
      origin.x,
      origin.y,
      Math.cos(angle),
      Math.sin(angle),
      { damage, speed: MINION_SHOT_SPEED, radiusMul: stats.bulletRadiusMul },
    );

    if (bullet) bullet.pierce = stats.pierce;
  }
}

export function clearMinions() {
  for (const minion of minions) {
    minion.group.remove(...minion.group.children);
    if (minion.group.parent) minion.group.parent.remove(minion.group);
  }
  minions.length = 0;
  elapsed = 0;
  creationToken++;
}
