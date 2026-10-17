import * as THREE from "three";
import { isObstacleFree, MAX_MOVE_SUB_STEP } from "../core/Collision.js";
import { COLLISION, PROJECTILE } from "../config/tuning.js";

const bulletGeometry = new THREE.SphereGeometry(1, 8, 6);

const materials = {
  player: new THREE.MeshBasicMaterial({ color: PROJECTILE.colors.player }),
  minion: new THREE.MeshBasicMaterial({ color: PROJECTILE.colors.minion }),
  enemy: new THREE.MeshBasicMaterial({ color: PROJECTILE.colors.enemy }),
  boss: new THREE.MeshBasicMaterial({ color: PROJECTILE.colors.boss }),
};

const bullets = [];
let sceneRef = null;

function spawnBullet({
  owner,
  x,
  y,
  z,
  dirX,
  dirY,
  speed,
  damage,
  radius,
  life,
  pierce = 0,
  sender = null,
  source = null,
}) {
  if (!sceneRef) return null;

  const mesh = new THREE.Mesh(bulletGeometry, materials[owner]);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(radius);
  sceneRef.add(mesh);

  const bullet = {
    mesh,
    owner,
    damage,
    hitRadius: radius * COLLISION.projectileRadiusMul,
    speedX: dirX * speed,
    speedY: dirY * speed,
    life,
    pierce,
    hitSet: new Set(),
    sender,
    source,
  };
  bullets.push(bullet);
  return bullet;
}

export function spawnPlayerShot(
  x,
  y,
  dirX,
  dirY,
  { damage, speed, radiusMul = 1 },
) {
  return spawnBullet({
    owner: "player",
    x,
    y,
    z: 0.7,
    dirX,
    dirY,
    speed,
    damage,
    radius: PROJECTILE.playerRadius * radiusMul,
    life: PROJECTILE.playerLifetime,
    source: "shot",
  });
}

export function spawnMinionShot(
  x,
  y,
  dirX,
  dirY,
  { damage, speed, radiusMul = 1 },
) {
  return spawnBullet({
    owner: "minion",
    x,
    y,
    z: 0.7,
    dirX,
    dirY,
    speed,
    damage,
    radius: PROJECTILE.playerRadius * radiusMul,
    life: PROJECTILE.playerLifetime,
    source: "minion",
  });
}

export function spawnEnemyShot(x, y, dirX, dirY, sender = null, speedMul = 1) {
  return spawnBullet({
    owner: "enemy",
    x,
    y,
    z: 0.7,
    dirX,
    dirY,
    speed: PROJECTILE.enemySpeed * speedMul,
    damage: PROJECTILE.damage,
    radius: PROJECTILE.enemyRadius,
    life: PROJECTILE.enemyLifetime,
    sender,
  });
}

export function spawnBossOrb(x, y, dirX, dirY, speedMul = 1, sender = null) {
  return spawnBullet({
    owner: "boss",
    x,
    y,
    z: 0.7,
    dirX,
    dirY,
    speed: PROJECTILE.bossOrbSpeed * speedMul,
    damage: PROJECTILE.damage,
    radius: PROJECTILE.bossOrbRadius,
    life: PROJECTILE.bossOrbLifetime,
    sender,
  });
}

export function reflectProjectilesNear(x, y, radius, reflectDamage) {
  let reflected = 0;
  for (const bullet of bullets) {
    if (bullet.owner !== "enemy" && bullet.owner !== "boss") continue;
    const dx = bullet.mesh.position.x - x;
    const dy = bullet.mesh.position.y - y;
    if (Math.hypot(dx, dy) > radius + bullet.hitRadius) continue;

    const speed = Math.hypot(bullet.speedX, bullet.speedY);
    if (speed < 1e-6) continue;

    let dirX = -bullet.speedX / speed;
    let dirY = -bullet.speedY / speed;

    if (bullet.sender && !bullet.sender.userData.dying) {
      const toSenderX = bullet.sender.position.x - bullet.mesh.position.x;
      const toSenderY = bullet.sender.position.y - bullet.mesh.position.y;
      const toSender = Math.hypot(toSenderX, toSenderY);
      if (toSender > 1e-6) {
        dirX = toSenderX / toSender;
        dirY = toSenderY / toSender;
      }
    }

    bullet.owner = "player";
    bullet.damage = reflectDamage;
    bullet.pierce = 0;
    bullet.hitSet.clear();
    bullet.speedX = dirX * PROJECTILE.playerSpeed;
    bullet.speedY = dirY * PROJECTILE.playerSpeed;
    bullet.life = PROJECTILE.playerLifetime;
    bullet.source = "reflect";
    bullet.mesh.material = materials.player;
    reflected++;
  }
  return reflected;
}

export function addPierceToPlayerShots(extraPierce) {
  for (const bullet of bullets) {
    if (bullet.owner === "player" || bullet.owner === "minion")
      bullet.pierce += extraPierce;
  }
}

export function updateProjectiles(delta, enemies, playerInfo) {
  const events = { enemyHits: [], playerHits: [] };

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    const stepX = bullet.speedX * delta;
    const stepY = bullet.speedY * delta;
    const distance = Math.hypot(stepX, stepY);
    const subSteps = Math.max(1, Math.ceil(distance / MAX_MOVE_SUB_STEP));
    let dead = false;

    for (let s = 0; s < subSteps && !dead; s++) {
      bullet.mesh.position.x += stepX / subSteps;
      bullet.mesh.position.y += stepY / subSteps;

      if (
        !isObstacleFree(
          bullet.mesh.position.x,
          bullet.mesh.position.y,
          bullet.hitRadius,
          true,
        )
      ) {
        dead = true;
        break;
      }

      if (bullet.owner === "player" || bullet.owner === "minion") {
        for (let e = 0; e < enemies.length; e++) {
          const enemy = enemies[e];
          if (!enemy.userData.collider || enemy.userData.dying) continue;
          if (bullet.hitSet.has(enemy)) continue;
          const dx = enemy.position.x - bullet.mesh.position.x;
          const dy = enemy.position.y - bullet.mesh.position.y;
          const reach = enemy.userData.collider.radius + bullet.hitRadius;
          if (dx * dx + dy * dy > reach * reach) continue;

          bullet.hitSet.add(enemy);
          events.enemyHits.push({ bullet, enemy });

          if (enemy.userData.blocksShots) {
            dead = true;
          } else if (bullet.pierce > 0) {
            bullet.pierce--;
          } else {
            dead = true;
          }
          break;
        }
      } else if (playerInfo) {
        const dx = playerInfo.x - bullet.mesh.position.x;
        const dy = playerInfo.y - bullet.mesh.position.y;
        const reach = playerInfo.radius + bullet.hitRadius;
        if (dx * dx + dy * dy <= reach * reach) {
          events.playerHits.push(bullet);
          dead = true;
        }
      }
    }

    bullet.life -= delta;
    if (bullet.life <= 0) dead = true;

    if (dead) removeBulletAt(i);
  }

  return events;
}

function removeBulletAt(index) {
  const bullet = bullets[index];
  bullets.splice(index, 1);
  if (bullet.mesh.parent) bullet.mesh.parent.remove(bullet.mesh);
}

export function clearProjectiles() {
  for (let i = bullets.length - 1; i >= 0; i--) removeBulletAt(i);
}

export function initProjectiles(scene) {
  sceneRef = scene;
}
