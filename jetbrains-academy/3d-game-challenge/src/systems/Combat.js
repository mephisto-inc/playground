import {BOSS, COLLISION, ENEMY, PICKUP, PROJECTILE,} from "../config/tuning.js";
import player, {
  consumeDashPickups,
  consumePushBurst,
  damagePlayer,
  getAbilityValues,
  getHitCenter,
  getSlowFactor,
  getStats,
  healPlayer,
  isDead,
  isInvulnerable,
  isShieldActive,
  markPushSuccess,
  updatePlayer,
} from "../entities/Player.js";
import {
  applySlow,
  damageEnemy,
  getDoomMul,
  getEnemies,
  knockbackEnemy,
  stunEnemy,
  updateEnemies,
} from "../entities/Enemy.js";
import {damageBoss, updateBoss} from "../entities/Boss.js";
import {reflectProjectilesNear, spawnPlayerShot, updateProjectiles,} from "../entities/Projectile.js";
import {updatePickups} from "../entities/Pickup.js";
import {updateTrails} from "../entities/Trail.js";
import {playSfx} from "./Audio.js";
import {markPlayerDamaged, recordPush} from "./Achievements.js";
import {getCollider, isLineSightClear} from "../core/Collision.js";
import {getGroundViewCull} from "../world/Camera.js";
import {getState, STATE} from "../core/StateMachine.js";

let fireTimer = 0;
let deathCallback = null;
let powerupCallback = null;
let pendingPowerups = 0;

const viewCull = {x: 0, y: 0, radius: 0};

export function onPlayerDeath(callback) {
  deathCallback = callback;
}

export function onPowerupCollected(callback) {
  powerupCallback = callback;
}

export function resetCombat() {
  fireTimer = 0;
  pendingPowerups = 0;
}

export function updateCombat(delta) {
  updatePlayer(delta);
  updateEnemies(delta);
  updateBoss(delta);

  updateAutoShooter(delta);

  reflectWithShield();

  const events = updateProjectiles(
    delta,
    getEnemies(),
    playerHitShape(),
    getGroundViewCull(viewCull, PROJECTILE.enemyCullMargin),
  );
  resolveEnemyHits(events.enemyHits);
  resolvePlayerHits(events.playerHits);

  resolveContactDamage();

  applyPushBurst();

  const collected = updatePickups(
    delta,
    player.position.x,
    player.position.y,
    getStats().magnetRadius,
  );
  const swept = consumeDashPickups();
  handlePickups(
    collected.hearts + swept.hearts,
    collected.powerups + swept.powerups,
  );

  updateTrails(delta);

  if (isDead() && deathCallback) deathCallback();
}

function handlePickups(hearts, powerups) {
  if (hearts > 0) {
    healPlayer(hearts * PICKUP.heal);
    playSfx("heart");
  }
  pendingPowerups += powerups;
  if (
    pendingPowerups > 0 &&
    getState() === STATE.WAVE_PLAYING &&
    powerupCallback
  ) {
    pendingPowerups--;
    powerupCallback();
  }
}

function updateAutoShooter(delta) {
  const stats = getStats();
  const target = findNearestTarget(stats.range);
  if (!target) return;

  fireTimer -= delta * getSlowFactor();
  if (fireTimer > 0) return;
  fireTimer = stats.fireCooldown;

  fireVolley(target);
}

function findNearestTarget(range) {
  let best = null;
  let bestDistanceSq = range * range;
  const originX = player.position.x;
  const originY = player.position.y;
  for (const enemy of getEnemies()) {
    if (enemy.userData.dying) continue;
    const dx = enemy.position.x - originX;
    const dy = enemy.position.y - originY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= bestDistanceSq) continue;
    if (
      !isLineSightClear(
        originX,
        originY,
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

function fireVolley(target) {
  const stats = getStats();
  const originX = player.position.x;
  const originY = player.position.y;
  const shotSpeed = PROJECTILE.playerSpeed * getSlowFactor();

  const dx = target.position.x - originX;
  const dy = target.position.y - originY;
  const distance = Math.max(Math.hypot(dx, dy), 1e-4);
  const flightTime = distance / shotSpeed;
  const velocity = target.userData.velocity || {x: 0, y: 0};
  const aimX =
    target.position.x + velocity.x * flightTime * PROJECTILE.aimLeadFactor;
  const aimY =
    target.position.y + velocity.y * flightTime * PROJECTILE.aimLeadFactor;

  const baseAngle = Math.atan2(aimY - originY, aimX - originX);
  const spread = (PROJECTILE.multiShotSpreadDeg * Math.PI) / 180;
  const count = Math.max(1, stats.projectiles);
  const offset = ((count - 1) / 2) * spread;

  const missingHearts = Math.max(0, stats.maxHearts - stats.hearts);
  const baseDamage =
    stats.damage + stats.berserkPerMissingHeart * missingHearts;

  for (let i = 0; i < count; i++) {
    const angle = baseAngle - offset + i * spread;
    let damage = baseDamage;
    if (stats.critChance > 0 && Math.random() < stats.critChance) damage *= 2;
    const bullet = spawnPlayerShot(
      originX,
      originY,
      Math.cos(angle),
      Math.sin(angle),
      {
        damage,
        speed: shotSpeed,
        radiusMul: stats.bulletRadiusMul,
      },
    );
    if (bullet) bullet.pierce = stats.pierce;
  }
  playSfx("shoot");
}

function reflectWithShield() {
  if (!isShieldActive()) return;
  const center = getHitCenter();
  const ability = getAbilityValues();
  const reflected = reflectProjectilesNear(
    center.x,
    center.y,
    ability.reflectRadius,
    ability.reflectDamage,
  );
  if (reflected > 0) markPushSuccess();
}

function applyPushBurst() {
  const burst = consumePushBurst();
  if (!burst) return;
  const ability = getAbilityValues();
  const stats = getStats();

  const px = player.position.x;
  const py = player.position.y;
  for (const enemy of getEnemies()) {
    if (enemy.userData.dying) continue;
    const reach =
      burst.radius +
      (enemy.userData.collider ? enemy.userData.collider.radius : 0);
    const distance = Math.hypot(enemy.position.x - px, enemy.position.y - py);
    if (distance > reach) continue;

    let damage = burst.damage;
    if (stats.critChance > 0 && Math.random() < stats.critChance) damage *= 2;

    if (enemy.userData.isBoss) {
      const shoved = !enemy.userData.knockbackImmune;
      damageBoss(damage, {
        knockback: shoved ? BOSS.knockbackDistance : 0,
        knockbackX: enemy.position.x - px,
        knockbackY: enemy.position.y - py,
        source: "shockwave",
      });
      if (shoved) recordPush();
    } else {
      if (
        enemy.userData.typeConfig.behavior !== "tank" &&
        burst.knockback > 0 &&
        distance > 1e-6
      ) {
        knockbackEnemy(
          enemy,
          enemy.position.x - px,
          enemy.position.y - py,
          burst.knockback,
        );
        recordPush();
      }
      damageEnemy(enemy, damage, {source: "shockwave"});
      stunEnemy(enemy, ability.stun);
    }
  }
}

function resolveEnemyHits(enemyHits) {
  const stats = getStats();
  for (const {bullet, enemy} of enemyHits) {
    const options = {source: bullet.source || "shot"};
    if (enemy.userData.isBoss) {
      damageBoss(bullet.damage, options);
      continue;
    }
    damageEnemy(enemy, bullet.damage, options);
    if (enemy.userData.dying) continue;
    if (stats.slowOnHitMul > 0 && stats.slowOnHitDuration > 0) {
      applySlow(enemy, stats.slowOnHitMul, stats.slowOnHitDuration);
    }
    if (stats.shotKnockback > 0) {
      knockbackEnemy(enemy, bullet.speedX, bullet.speedY, stats.shotKnockback);
    }
  }
}

function resolvePlayerHits(playerHits) {
  const damage = PROJECTILE.damage * getDoomMul();
  for (let i = 0; i < playerHits.length; i++) {
    const result = damagePlayer(damage, "projectile");
    if (result === "hit" || result === "dead") markPlayerDamaged();
  }
}

function resolveContactDamage() {
  if (isDead() || (isInvulnerable() && !isShieldActive())) return;
  const stats = getStats();
  const contactDamage = getDoomMul();

  for (const enemy of getEnemies()) {
    if (enemy.userData.isBoss || enemy.userData.dying) continue;
    if (!enemy.userData.touchingPlayer) continue;

    const result = damagePlayer(contactDamage, "physical");
    if (result === "hit" || result === "dead") {
      markPlayerDamaged();
      if (stats.thornsDamage > 0) {
        damageEnemy(enemy, stats.thornsDamage, {source: "thorns"});
      }
    }

    knockbackEnemy(
      enemy,
      enemy.position.x - player.position.x,
      enemy.position.y - player.position.y,
      ENEMY.knockbackDistance,
    );
  }
}

function playerHitShape() {
  const collider = getCollider(player);
  const center = getHitCenter();
  return {
    x: center.x,
    y: center.y,
    radius: collider ? collider.radius : 0.6,
  };
}
