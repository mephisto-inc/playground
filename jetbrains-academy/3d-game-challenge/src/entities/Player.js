import * as THREE from "three";
import {cloneMaterials, enableShadows, loadGLTF, normalizeModel,} from "../core/Assets.js";
import {isMoveFree, MAX_MOVE_SUB_STEP, registerCollider,} from "../core/Collision.js";
import {getMoveTarget} from "../core/Input.js";
import {ABILITY, COLLISION, ENEMY, PICKUP, PLAYER} from "../config/tuning.js";
import {getClass} from "../config/classes.js";
import {clearMinions, createMinions, updateMinions} from "./Minion.js";
import {spawnTrail} from "./Trail.js";
import {sweepPickups} from "./Pickup.js";
import {addPierceToPlayerShots} from "./Projectile.js";
import {playSfx} from "../systems/Audio.js";
import {
  recordCardCollected,
  recordClassPlayed,
  recordDash,
  recordShieldBlock,
  unlockAchievement,
} from "../systems/Achievements.js";
import {markCollected} from "../systems/Collection.js";

const MODEL_YAW_OFFSET = Math.PI / 2;

const LEAN_SNAP_UP_FRACTION = 0.1;
const LEAN_ROLL_END_FRACTION = 0.45;

const player = new THREE.Group();
export default player;

let sceneRef = null;
let model = null;
let modelMaterials = [];
let modelGroundZ = 0;
let playerCollider = registerCollider(player, player.position, 0.6);

export const playerReady = load();

async function load() {
  const gltf = await loadGLTF("/assets/tode.glb");
  const template = gltf.scene;
  enableShadows(template);

  model = template;
  normalizeModel(model, {targetHeight: PLAYER.targetHeight});
  modelGroundZ = model.position.z;

  modelMaterials = cloneMaterials(model);
  for (const material of modelMaterials) material.transparent = true;

  player.add(model);
  player.visible = false;

  playerCollider = registerCollider(
    player,
    player.position,
    measureRadius(model) * COLLISION.playerRadiusMul,
  );
  return model;
}

function measureRadius(object) {
  object.updateMatrixWorld(true);
  let radius = 0.5;
  const vertex = new THREE.Vector3();
  object.traverse((child) => {
    if (!child.isMesh) return;
    const positions = child.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      child.getVertexPosition(i, vertex).applyMatrix4(child.matrixWorld);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
    }
  });
  return radius;
}

const hitCenter = new THREE.Vector2();
const hitCenterBox = new THREE.Box3();
const hitCenterPoint = new THREE.Vector3();

function updateHitCenter() {
  if (model) {
    player.updateMatrixWorld(true);
    hitCenterBox.setFromObject(model);
    hitCenterBox.getCenter(hitCenterPoint);

    if (
      Number.isFinite(hitCenterPoint.x) &&
      Number.isFinite(hitCenterPoint.y)
    ) {
      hitCenter.set(hitCenterPoint.x, hitCenterPoint.y);
      return;
    }
  }
  hitCenter.set(player.position.x, player.position.y);
}

let stats = makeBaseStats();
let classId = "pusher";
let collectedCards = [];
let dead = false;
let iframes = 0;
let deathAnimTime = 0;

let dashPickupQueue = {hearts: 0, powerups: 0};

let cooldownRemaining = 0;
let shieldRemaining = 0;
let pushSucceeded = false;
let pushBurstPending = false;

let slowFactor = 1;
let slowTimer = 0;

const dashClones = [];

const move = {
  direction: new THREE.Vector3(),
  start: new THREE.Vector3(),
  target: new THREE.Vector3(),
  progress: 1,
  yaw: 0,
};

function makeBaseStats() {
  return {
    maxHearts: PLAYER.baseHearts,
    hearts: PLAYER.baseHearts,
    speedMul: 1.0,
    fireCooldown: PLAYER.baseFireCooldown,
    damage: PLAYER.baseDamage,
    projectiles: PLAYER.baseProjectiles,
    pierce: PLAYER.basePierce,
    range: PLAYER.baseRange,
    iFrames: PLAYER.baseIFrames,
    magnetRadius: PICKUP.magnetRadius,
    dropChance: ENEMY.baseDropChance,

    critChance: 0,
    thornsDamage: 0,
    berserkPerMissingHeart: 0,
    shotKnockback: 0,
    slowOnHitMul: 0,
    slowOnHitDuration: 0,
    bulletRadiusMul: 1,
    dodgeChance: 0,
    trailDurationAdd: 0,
    trailWidthMul: 1,
    trailDamageMul: 1,
  };
}

export function initPlayer(scene) {
  sceneRef = scene;
  scene.add(player);
}

export function configureClass(nextClassId) {
  classId = nextClassId;
  const definition = getClass(classId);
  stats = makeBaseStats();
  stats.maxHearts = definition.hearts;
  stats.hearts = definition.hearts;

  collectedCards = [];
  dead = false;
  iframes = 0;
  deathAnimTime = 0;
  cooldownRemaining = 0;
  shieldRemaining = 0;
  pushSucceeded = false;
  pushBurstPending = false;
  dashPickupQueue = {hearts: 0, powerups: 0};
  clearDashClones();
  clearMinions();

  recordClassPlayed(classId);

  resetPlayer();
  if (definition.ability.minionCount) {
    createMinions(sceneRef, definition.ability);
  }
}

export function getAbilityValues() {
  return getClass(classId).ability;
}

export function getActiveClassId() {
  return classId;
}

export function applyCard(card) {
  collectedCards.push(card.id);
  markCollected(card.id);
  const effect = card.effect;

  if (effect.fireRateMul) stats.fireCooldown /= effect.fireRateMul;
  if (effect.projectilesAdd) stats.projectiles += effect.projectilesAdd;
  if (effect.pierceAdd) {
    stats.pierce += effect.pierceAdd;

    addPierceToPlayerShots(effect.pierceAdd);
  }
  if (effect.speedAdd) stats.speedMul += effect.speedAdd;
  if (effect.damageAdd) stats.damage += effect.damageAdd;
  if (effect.rangeMul) stats.range *= effect.rangeMul;
  if (effect.maxHeartsAdd) {
    stats.maxHearts = Math.max(
      0,
      Math.min(PLAYER.maxHearts, stats.maxHearts + effect.maxHeartsAdd),
    );
    stats.hearts = Math.min(stats.hearts, stats.maxHearts);
    if (stats.hearts <= 0) {
      stats.hearts = 0;
      dead = true;
      deathAnimTime = 0;
    }

    if (stats.maxHearts >= PLAYER.maxHearts) unlockAchievement("fullHearts");
  }
  if (effect.heal) healPlayer(effect.heal);
  if (effect.iFramesSet !== undefined) stats.iFrames = effect.iFramesSet;
  if (effect.magnetMul) stats.magnetRadius *= effect.magnetMul;
  if (effect.dropChanceSet !== undefined)
    stats.dropChance = effect.dropChanceSet;
  if (effect.critChanceAdd) stats.critChance += effect.critChanceAdd;
  if (effect.thornsDamage) stats.thornsDamage += effect.thornsDamage;
  if (effect.berserkPerMissingHeart) {
    stats.berserkPerMissingHeart += effect.berserkPerMissingHeart;
  }
  if (effect.shotKnockback) stats.shotKnockback += effect.shotKnockback;
  if (effect.slowOnHitMul) {
    stats.slowOnHitMul = effect.slowOnHitMul;
    stats.slowOnHitDuration =
      effect.slowOnHitDuration || stats.slowOnHitDuration;
  }
  if (effect.bulletRadiusMul) stats.bulletRadiusMul *= effect.bulletRadiusMul;
  if (effect.dodgeChanceAdd) stats.dodgeChance += effect.dodgeChanceAdd;
  if (effect.trailDurationAdd)
    stats.trailDurationAdd += effect.trailDurationAdd;
  if (effect.trailWidthMul) stats.trailWidthMul *= effect.trailWidthMul;
  if (effect.trailDamageMul) stats.trailDamageMul *= effect.trailDamageMul;

  stats.fireCooldown = Math.max(0.1, stats.fireCooldown);

  recordCardCollected(collectedCards.length);
}

let invincible = false;

export function setPlayerInvincible(value) {
  invincible = value === true;
}

export function damagePlayer(amount, kind = "physical") {
  if (dead) return "dead";
  if (invincible) return "immune";
  if (kind === "physical" && shieldRemaining > 0) {
    recordShieldBlock();
    if (!pushSucceeded) {
      pushSucceeded = true;
      pushBurstPending = true;
      playSfx("parry");
      playPushImpact();
    }
    return "shielded";
  }
  if (iframes > 0) return "immune";
  if (stats.dodgeChance > 0 && Math.random() < stats.dodgeChance) {
    return "dodged";
  }

  stats.hearts -= amount;
  iframes = stats.iFrames;
  playSfx("hurt");

  if (stats.hearts <= 0) {
    stats.hearts = 0;
    dead = true;
    deathAnimTime = 0;
    return "dead";
  }
  return "hit";
}

export function healPlayer(amount) {
  stats.hearts = Math.min(stats.maxHearts, stats.hearts + amount);
}

export function isDead() {
  return dead;
}

export function isInvulnerable() {
  return iframes > 0;
}

export function isShieldActive() {
  return shieldRemaining > 0;
}

export function markPushSuccess() {
  if (pushSucceeded) return;
  pushSucceeded = true;
  pushBurstPending = true;
  playSfx("parry");
  playPushImpact();
}

export function applyPlayerSlow(factor, duration) {
  slowFactor = Math.min(slowTimer > 0 ? slowFactor : 1, factor);
  slowTimer = Math.max(slowTimer, duration);
}

export function getSlowFactor() {
  return slowFactor;
}

export function consumePushBurst() {
  if (!pushBurstPending) return null;
  pushBurstPending = false;
  const ability = getAbilityValues();
  return {
    radius: ability.shockwaveRadius,

    damage: ability.shockwaveBaseDamage + stats.hearts,

    knockback: ability.knockback || 0,
  };
}

export function tryActivateAbility() {
  if (dead || cooldownRemaining > 0 || !model) return;
  const ability = getAbilityValues();

  if (classId === "pusher") {
    cooldownRemaining = ability.cooldown;
    shieldRemaining = ability.shield;
    pushSucceeded = false;
    showPushGlow();
  } else if (classId === "dasher") {
    cooldownRemaining = ability.cooldown;
    performDash(ability);
  }
}

function performDash(ability) {
  const direction = dashDirection();
  const startX = player.position.x;
  const startY = player.position.y;

  let travelled = 0;
  const step = Math.min(0.2, ability.distance);
  while (travelled < ability.distance) {
    const next = Math.min(step, ability.distance - travelled);
    const nx = player.position.x + direction.x * next;
    const ny = player.position.y + direction.y * next;
    if (!isMoveFree(playerCollider, nx, ny)) break;
    player.position.x = nx;
    player.position.y = ny;
    travelled += next;
  }

  move.progress = 1;
  move.start.copy(player.position);
  move.target.copy(player.position);

  const duration =
    ability.trailBaseDuration +
    ability.trailPerHeart * stats.hearts +
    stats.trailDurationAdd;
  spawnTrail(
    startX,
    startY,
    player.position.x,
    player.position.y,
    duration,
    ability.trailWidth * stats.trailWidthMul,
  );

  sweepDashPickups(startX, startY, player.position.x, player.position.y);

  spawnDashClones(
    startX,
    startY,
    player.position.x,
    player.position.y,
    ability,
  );

  iframes = Math.max(iframes, ability.extraIFrames);

  recordDash();
  playSfx("dash");
}

function sweepDashPickups(x1, y1, x2, y2) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const samples = Math.max(1, Math.ceil(length));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const swept = sweepPickups(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1.0);
    dashPickupQueue.hearts += swept.hearts;
    dashPickupQueue.powerups += swept.powerups;
  }
}

export function consumeDashPickups() {
  const result = dashPickupQueue;
  dashPickupQueue = {hearts: 0, powerups: 0};
  return result;
}

function dashDirection() {
  const target = getMoveTarget(player.position);
  if (target) {
    const dx = target.x - player.position.x;
    const dy = target.y - player.position.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-4) return {x: dx / length, y: dy / length};
  }
  return {
    x: Math.cos(move.yaw - MODEL_YAW_OFFSET),
    y: Math.sin(move.yaw - MODEL_YAW_OFFSET),
  };
}

function spawnDashClones(x1, y1, x2, y2, ability) {
  if (!model || !sceneRef) return;
  for (let i = 0; i < ability.cloneCount; i++) {
    const t = (i + 1) / (ability.cloneCount + 1);
    const clone = model.clone();
    clone.position.set(
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
      clone.position.z,
    );
    clone.rotation.copy(model.rotation);
    const materials = cloneMaterials(clone);
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.5;
    }
    sceneRef.add(clone);
    dashClones.push({
      clone,
      materials,
      life: ability.cloneLife,
      total: ability.cloneLife,
    });
  }
}

function updateDashClones(delta) {
  for (let i = dashClones.length - 1; i >= 0; i--) {
    const entry = dashClones[i];
    entry.life -= delta;
    if (entry.life <= 0) {
      dashClones.splice(i, 1);
      for (const material of entry.materials) material.dispose();
      if (entry.clone.parent) entry.clone.parent.remove(entry.clone);
      continue;
    }
    const opacity = 0.5 * (entry.life / entry.total);
    entry.clone.traverse((child) => {
      if (child.isMesh && child.material) child.material.opacity = opacity;
    });
  }
}

function clearDashClones() {
  for (const entry of dashClones) {
    for (const material of entry.materials) material.dispose();
    if (entry.clone.parent) entry.clone.parent.remove(entry.clone);
  }
  dashClones.length = 0;
}

const PUSH_GLOW_COLOR = 0x8fe6c9;
const PUSH_IMPACT_COLOR = 0xeafff5;
const PUSH_RING_COLOR = 0xbdf5e6;

function createPushFx(geometry, color, z) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.z = z;
  mesh.visible = false;
  player.add(mesh);
  return mesh;
}

const pushGlow = createPushFx(
  new THREE.RingGeometry(
    ABILITY.pushGlowRadius * 0.5,
    ABILITY.pushGlowRadius,
    40,
  ),
  PUSH_GLOW_COLOR,
  0.12,
);
const pushImpact = createPushFx(
  new THREE.CircleGeometry(0.5, 24),
  PUSH_IMPACT_COLOR,
  0.14,
);

const pushRing = createPushFx(
  new THREE.RingGeometry(0.72, 1, 40),
  PUSH_RING_COLOR,
  0.13,
);

let pushFxState = "none";
let pushFxTime = 0;
let pushFxClock = 0;

function showPushGlow() {
  pushFxState = "glow";
  pushFxTime = 0;
  pushGlow.scale.setScalar(1);
  pushGlow.visible = true;
  pushImpact.visible = false;
  pushRing.visible = false;
}

function playPushImpact() {
  pushFxState = "impact";
  pushFxTime = 0;
  pushGlow.visible = false;
  pushImpact.scale.setScalar(0.6);
  pushImpact.material.opacity = 0.9;
  pushImpact.visible = true;
  pushRing.visible = false;
}

function playPushFail() {
  pushFxState = "fail";
  pushFxTime = 0;
  pushGlow.visible = true;
  pushImpact.visible = false;
  pushRing.visible = false;
}

function hidePushFx() {
  pushFxState = "none";
  pushFxTime = 0;
  pushGlow.visible = false;
  pushImpact.visible = false;
  pushRing.visible = false;
}

function updatePushFx(delta) {
  pushFxClock += delta;
  const pulse = 0.5 + 0.5 * Math.sin(pushFxClock * 14);

  switch (pushFxState) {
    case "glow": {
      pushGlow.material.opacity = 0.3 + 0.3 * pulse;
      pushGlow.scale.setScalar(1 + 0.06 * pulse);
      break;
    }
    case "impact": {
      pushFxTime += delta;
      const p = Math.min(pushFxTime / ABILITY.pushImpactDuration, 1);
      pushImpact.scale.setScalar(0.6 + 0.7 * p);
      pushImpact.material.opacity = 0.9 * (1 - 0.6 * p);
      if (p >= 1) {
        pushFxState = "ring";
        pushFxTime = 0;
        pushImpact.visible = false;
        pushRing.visible = true;
      }
      break;
    }
    case "ring": {
      pushFxTime += delta;
      const p = Math.min(pushFxTime / ABILITY.pushRingDuration, 1);
      pushRing.scale.setScalar(
        1 + (getAbilityValues().shockwaveRadius - 1) * p,
      );
      pushRing.material.opacity = 0.85 * (1 - p);
      if (p >= 1) hidePushFx();
      break;
    }
    case "fail": {
      pushFxTime += delta;
      const p = Math.min(pushFxTime / ABILITY.pushFailDuration, 1);
      pushGlow.scale.setScalar(1 - 0.6 * p);
      pushGlow.material.opacity = 0.5 * (1 - p);
      if (p >= 1) hidePushFx();
      break;
    }
    default:
      break;
  }
}

export function updatePlayer(delta) {
  if (dead) {
    hidePushFx();
    return;
  }

  const frameStartX = player.position.x;
  const frameStartY = player.position.y;

  if (iframes > 0) iframes = Math.max(0, iframes - delta);
  if (slowTimer > 0) {
    slowTimer = Math.max(0, slowTimer - delta);
    if (slowTimer === 0) slowFactor = 1;
  }

  if (cooldownRemaining > 0)
    cooldownRemaining = Math.max(0, cooldownRemaining - delta * slowFactor);
  if (shieldRemaining > 0) {
    shieldRemaining = Math.max(0, shieldRemaining - delta);

    if (shieldRemaining === 0 && !pushSucceeded) {
      playSfx("parry_failed");
      playPushFail();
    }
  }
  updateDashClones(delta);
  updatePushFx(delta);

  if (move.progress >= 1) {
    const target = getMoveTarget(player.position);
    if (target) {
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const distance = Math.hypot(dx, dy);
      move.direction.set(dx / distance, dy / distance, 0);
      move.start.copy(player.position);

      move.target
        .copy(move.start)
        .addScaledVector(
          move.direction,
          Math.min(PLAYER.hopDistance, distance),
        );
      move.progress = 0;
      move.yaw =
        Math.atan2(move.direction.y, move.direction.x) + MODEL_YAW_OFFSET;
      playSfx("jump");
    }
  }

  if (move.progress < 1) {
    const groundSpeed = PLAYER.baseSpeed * stats.speedMul * slowFactor;
    const targetProgress = Math.min(
      move.progress + (delta * groundSpeed) / PLAYER.hopDistance,
      1,
    );
    const hopLength = move.start.distanceTo(move.target);
    const subProgress =
      hopLength > 0 ? Math.min(MAX_MOVE_SUB_STEP / hopLength, 1) : 1;

    let blocked = false;
    while (move.progress < targetProgress) {
      const nextProgress = Math.min(
        move.progress + subProgress,
        targetProgress,
      );
      const nextX = THREE.MathUtils.lerp(
        move.start.x,
        move.target.x,
        nextProgress,
      );
      const nextY = THREE.MathUtils.lerp(
        move.start.y,
        move.target.y,
        nextProgress,
      );

      if (!isMoveFree(playerCollider, nextX, nextY)) {
        const slideX = isMoveFree(playerCollider, nextX, player.position.y);
        const slideY =
          !slideX && isMoveFree(playerCollider, player.position.x, nextY);
        if (slideX || slideY) {
          const slidX = slideX ? nextX : player.position.x;
          const slidY = slideX ? player.position.y : nextY;
          const shiftX = slidX - nextX;
          const shiftY = slidY - nextY;
          move.start.x += shiftX;
          move.start.y += shiftY;
          move.target.x += shiftX;
          move.target.y += shiftY;
          move.progress = nextProgress;
          player.position.x = slidX;
          player.position.y = slidY;
          continue;
        }
        blocked = true;
        break;
      }
      move.progress = nextProgress;
      player.position.x = nextX;
      player.position.y = nextY;
    }

    if (blocked) {
      move.start.copy(player.position);
      move.target.copy(player.position);
      move.progress = targetProgress;
    }
  }

  player.position.z = Math.sin(move.progress * Math.PI) * PLAYER.hopHeight;

  orientModel(move.yaw, move.progress < 1 ? currentLean() : 0);
  updateHitCenter();

  const opacity =
    iframes > 0 && Math.floor(iframes * 10) % 2 === 0
      ? PLAYER.iframeFlashOpacity
      : 1;
  for (const material of modelMaterials) material.opacity = opacity;

  player.userData.velocity = {
    x: (player.position.x - frameStartX) / Math.max(delta, 1e-6),
    y: (player.position.y - frameStartY) / Math.max(delta, 1e-6),
  };

  updateMinions(delta, player.position, stats, getAbilityValues());
}

const baseEuler = new THREE.Euler(Math.PI / 2, 0, 0, "XYZ");
const LEAN_AXIS = new THREE.Vector3(1, 0, 0);
const baseQuaternion = new THREE.Quaternion();
const leanQuaternion = new THREE.Quaternion();

function orientModel(yaw, lean) {
  if (!model) return;
  baseQuaternion.setFromEuler(baseEuler.set(Math.PI / 2, yaw, 0, "XYZ"));
  leanQuaternion.setFromAxisAngle(LEAN_AXIS, lean);
  model.quaternion.copy(baseQuaternion).multiply(leanQuaternion);
}

function currentLean() {
  const amplitude = Math.min(
    PLAYER.baseSpeed * stats.speedMul * slowFactor * PLAYER.leanPerSpeed,
    PLAYER.leanMax,
  );
  const progress = move.progress;
  if (progress < LEAN_SNAP_UP_FRACTION) {
    const t = progress / LEAN_SNAP_UP_FRACTION;
    return -amplitude * (t * t * (3 - 2 * t));
  }
  if (progress < LEAN_ROLL_END_FRACTION) {
    const span = LEAN_ROLL_END_FRACTION - LEAN_SNAP_UP_FRACTION;
    const t = (progress - LEAN_SNAP_UP_FRACTION) / span;
    const s = t * t * (3 - 2 * t);
    return amplitude * (2 * s - 1);
  }
  return amplitude;
}

export function updateDeathAnimation(delta) {
  if (!dead || deathAnimTime >= PLAYER.deathAnimDuration) return false;
  deathAnimTime += delta;
  const t = Math.min(1, deathAnimTime / PLAYER.deathAnimDuration);

  if (model) {
    model.rotation.z = -t * Math.PI * 2;

    model.position.z = modelGroundZ - t * 0.5 * PLAYER.targetHeight;
  }
  for (const material of modelMaterials) material.opacity = Math.max(0, 1 - t);
  return t < 1;
}

export function getStats() {
  return stats;
}

export function getHearts() {
  return stats.hearts;
}

export function getAbilityInfo() {
  const definition = getClass(classId);
  return {
    icon: definition.icon,
    cooldown: definition.ability.cooldown || 0,
    remaining: cooldownRemaining,
    passive: !definition.ability.cooldown,
  };
}

export function getCollectedCards() {
  return collectedCards.slice();
}

export function getHitCenter() {
  return hitCenter;
}

export function resetPlayer() {
  player.position.set(0, 0, 0);
  hitCenter.set(player.position.x, player.position.y);
  move.progress = 1;
  move.direction.set(0, 0, 0);
  move.start.copy(player.position);
  move.target.copy(player.position);
  iframes = 0;
  slowFactor = 1;
  slowTimer = 0;

  player.userData.velocity = {x: 0, y: 0};
  hidePushFx();
  player.visible = true;
  if (model) {
    model.rotation.z = 0;

    model.position.z = modelGroundZ;
  }
  for (const material of modelMaterials) material.opacity = 1;
}
