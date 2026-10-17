import * as THREE from "three";
import {
  cloneMaterials,
  cloneModel,
  enableShadows,
  fadeMaterials,
  loadGLTF,
  normalizeModel,
} from "../core/Assets.js";
import {
  circlesTouch,
  getCollider,
  isLineSightClear,
  isMoveFree,
  isSpotFree,
  MAX_MOVE_SUB_STEP,
  registerCollider,
  unregisterCollider,
} from "../core/Collision.js";
import { clamp } from "../core/MathUtils.js";
import {
  ARENA,
  COLLISION,
  ENEMY,
  PROJECTILE,
  TRAIL,
} from "../config/tuning.js";
import { ENEMY_TYPES } from "../config/enemies.js";
import player, { getHitCenter, getStats } from "./Player.js";
import { isInsideTrail } from "./Trail.js";
import { spawnHeart } from "./Pickup.js";
import { spawnEnemyShot } from "./Projectile.js";
import { playSfxAt } from "../systems/Audio.js";
import { addScore } from "../systems/Score.js";
import { recordKill } from "../systems/Achievements.js";

const STUCK_ESCAPE_SECONDS = 0.5;
const ESCAPE_WAYPOINT_DISTANCE = 5;
const ESCAPE_WAYPOINT_REACHED = 0.9;
const ESCAPE_PROBE_SPACING = 1.5;
const STUCK_EPSILON = 0.01;

const KNOCKBACK_STEP = 0.15;

const CONTACT_ANIM_INTERVAL = 0.6;

const ANIM_FADE = 0.15;

const enemies = [];

let sceneRef = null;
let ready = false;

const prepared = {};

let endlessHpMul = 1;
let endlessSpeedMul = 1;
let endlessAttackMul = 1;

let doomMul = 1;
let doomHpMul = 1;

export function setDoomScaling(damageMul, hpMul) {
  doomMul = damageMul;
  doomHpMul = hpMul;
}

export function getDoomMul() {
  return doomMul;
}

export function getDoomHpMul() {
  return doomHpMul;
}

const SILHOUETTE_COLOR = new THREE.Color(ENEMY.silhouetteColor);

export function isOutsideArena(x, y) {
  return Math.abs(x) > ARENA.width / 2 || Math.abs(y) > ARENA.depth / 2;
}

export async function initEnemies(scene) {
  sceneRef = scene;

  const entries = Object.values(ENEMY_TYPES);
  const gltfs = await Promise.all(entries.map((type) => loadGLTF(type.model)));

  entries.forEach((type, index) => {
    const gltf = gltfs[index];
    const template = gltf.scene;
    enableShadows(template);

    const probe = cloneModel(template);
    const shape = normalizeModel(probe, { targetHeight: type.targetHeight });

    const clips = {
      move: findClip(gltf.animations, type.moveClip),
      attack: findClip(gltf.animations, type.attackClip),
      hit: findClip(gltf.animations, type.hitClip),
      death: findClip(gltf.animations, type.deathClip),
    };
    const missing = Object.entries(clips)
      .filter(([, clip]) => !clip)
      .map(([key]) => key);
    if (missing.length > 0) {
      console.warn(
        `Enemy "${type.id}": no clip for [${missing.join(", ")}].`,
        "Available:",
        gltf.animations.map((clip) => clip.name),
      );
    }

    prepared[type.id] = {
      template,
      scale: shape.scale,
      groundOffset: shape.groundOffset,
      radius: shape.radius * COLLISION.enemyRadiusMul,
      clips,
    };
  });

  ready = true;
}

function findClip(animations, name) {
  if (!name || animations.length === 0) return null;
  const base = (clipName) => {
    const bar = clipName.lastIndexOf("|");
    return bar >= 0 ? clipName.slice(bar + 1) : clipName;
  };
  const exact = animations.find(
    (clip) => clip.name === name || base(clip.name) === name,
  );
  if (exact) return exact;
  const lower = name.toLowerCase();
  const caseInsensitive = animations.find(
    (clip) => base(clip.name).toLowerCase() === lower,
  );
  if (caseInsensitive) return caseInsensitive;
  return (
    animations.find((clip) => {
      const clipName = base(clip.name).toLowerCase();
      return clipName.includes(lower) || lower.includes(clipName);
    }) || null
  );
}

export function getEnemyRadius(typeId) {
  return prepared[typeId] ? prepared[typeId].radius : 1;
}

export function setEndlessScaling(hpMul, speedMul, attackMul) {
  endlessHpMul = hpMul;
  endlessSpeedMul = speedMul;
  endlessAttackMul = attackMul;
}

export function spawnEnemy(typeId, position) {
  if (!ready || !sceneRef) return null;
  const type = ENEMY_TYPES[typeId];
  const typePrepared = prepared[typeId];
  if (!type || !typePrepared) return null;

  if (!isSpotFree(position.x, position.y, typePrepared.radius)) return null;

  const model = cloneModel(typePrepared.template);
  model.rotation.x = Math.PI / 2;
  model.scale.setScalar(typePrepared.scale);
  model.position.z += typePrepared.groundOffset;

  const materials = cloneMaterials(model);
  const flashOriginals = materials.map((material) => ({
    material,
    emissive: material.emissive ? material.emissive.clone() : null,
    intensity:
      material.emissiveIntensity !== undefined
        ? material.emissiveIntensity
        : null,
    color: material.color ? material.color.clone() : null,
  }));

  const group = new THREE.Group();
  group.position.set(position.x, position.y, 0);
  group.add(model);
  sceneRef.add(group);

  const mixer = new THREE.AnimationMixer(model);
  const makeAction = (clip, loopOnce) => {
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    if (loopOnce) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    return action;
  };
  const actions = {
    move: makeAction(typePrepared.clips.move, false),
    attack: makeAction(typePrepared.clips.attack, true),
    hit: makeAction(typePrepared.clips.hit, true),
    death: makeAction(typePrepared.clips.death, true),
  };
  if (actions.move) actions.move.play();

  const data = group.userData;
  data.typeConfig = type;
  data.maxHp = Math.ceil(type.hp * endlessHpMul * doomHpMul);

  data.hp = data.maxHp;
  data.collider = registerCollider(group, group.position, typePrepared.radius);
  data.touchingPlayer = false;
  data.stuckTimer = 0;
  data.escapeWaypoint = null;
  data.dying = false;
  data.dyingTimer = 0;
  data.fading = false;
  data.materials = materials;
  data.stunTimer = 0;
  data.flashTimer = 0;
  data.flashOriginals = flashOriginals;
  data.mixer = mixer;
  data.actions = actions;
  data.currentAction = actions.move;
  data.oneShotRemaining = 0;
  data.contactAnimTimer = 0;
  data.velocity = { x: 0, y: 0 };
  data.travelClock = 0;

  data.blocksShots = type.behavior === "tank";

  data.fireTimer = Math.random() * ENEMY.rangedFireInterval;

  data.speederTimer =
    Math.random() * (ENEMY.speederDashOn + ENEMY.speederDashOff);

  data.silhouette = 0;
  data.silhouetteDirty = false;

  data.trailTickTimer = Math.random() * TRAIL.tickInterval;

  data.slowFactor = 1;
  data.slowTimer = 0;

  data.lastHitSource = "shot";

  enemies.push(group);
  return group;
}

export function damageEnemy(enemy, amount, options = {}) {
  if (!enemy || enemy.userData.dying) return false;

  enemy.userData.hp -= amount;
  enemy.userData.lastHitSource = options.source || "shot";
  if (!options.silent) {
    flashEnemy(enemy);

    playSfxAt(
      "hit",
      enemy.position.x,
      enemy.position.y,
      player.position.x,
      player.position.y,
    );
  }

  if (options.knockback > 0) {
    knockbackEnemy(
      enemy,
      options.knockbackX || 0,
      options.knockbackY || 0,
      options.knockback,
    );
  }

  if (enemy.userData.hp <= 0) {
    killEnemy(enemy);
    return true;
  }

  if (!options.silent) playOneShot(enemy, enemy.userData.actions.hit);
  return false;
}

export function applySlow(enemy, factor, duration) {
  if (!enemy || enemy.userData.dying) return;
  const data = enemy.userData;
  data.slowFactor = Math.min(data.slowTimer > 0 ? data.slowFactor : 1, factor);
  data.slowTimer = Math.max(data.slowTimer, duration);
}

export function knockbackEnemy(enemy, dirX, dirY, distance) {
  if (!enemy || enemy.userData.dying) return;
  if (enemy.userData.typeConfig.behavior === "tank") return;
  const collider = enemy.userData.collider;
  const length = Math.hypot(dirX, dirY);
  if (!collider || length < 1e-6) return;

  const ux = dirX / length;
  const uy = dirY / length;
  let remaining = distance;
  while (remaining > 0) {
    const step = Math.min(KNOCKBACK_STEP, remaining);
    const nx = enemy.position.x + ux * step;
    const ny = enemy.position.y + uy * step;
    if (!isMoveFree(collider, nx, ny, true)) break;
    enemy.position.x = nx;
    enemy.position.y = ny;
    remaining -= step;
  }
}

export function stunEnemy(enemy, duration) {
  if (!enemy || enemy.userData.dying) return;
  enemy.userData.stunTimer = Math.max(enemy.userData.stunTimer, duration);
}

function killEnemy(enemy) {
  const data = enemy.userData;
  data.dying = true;
  data.touchingPlayer = false;
  data.velocity.x = 0;
  data.velocity.y = 0;

  unregisterCollider(enemy);
  data.collider = null;

  const deathAction = data.actions.death;
  if (deathAction) {
    deathAction.reset();
    deathAction.setEffectiveWeight(1);
    deathAction.play();
    data.currentAction = deathAction;
    const clipDuration = deathAction.getClip().duration;

    data.dyingTimer = clamp(clipDuration, ENEMY.deathLinger, 1.8);
  } else {
    data.dyingTimer = ENEMY.deathLinger;
  }

  addScore(data.typeConfig.score);

  recordKill(data.lastHitSource, false);

  if (Math.random() < getStats().dropChance) {
    spawnHeart(enemy.position.x, enemy.position.y);
  }
}

function flashEnemy(enemy) {
  const data = enemy.userData;
  data.flashTimer = ENEMY.hitFlashDuration;
  for (const entry of data.flashOriginals) {
    if (!entry.emissive) continue;
    entry.material.emissive.setHex(0xffffff);
    if (entry.intensity !== null) entry.material.emissiveIntensity = 1;
  }
}

function restoreFlash(enemy) {
  for (const entry of enemy.userData.flashOriginals) {
    if (!entry.emissive) continue;
    entry.material.emissive.copy(entry.emissive);
    if (entry.intensity !== null)
      entry.material.emissiveIntensity = entry.intensity;
  }
}

function updateSilhouette(enemy, delta) {
  const data = enemy.userData;
  const target = isOutsideArena(enemy.position.x, enemy.position.y) ? 1 : 0;
  if (data.silhouette === target && !data.silhouetteDirty) return;

  const step = delta / ENEMY.silhouetteBlend;
  data.silhouette =
    target > data.silhouette
      ? Math.min(target, data.silhouette + step)
      : Math.max(target, data.silhouette - step);

  for (const entry of data.flashOriginals) {
    if (!entry.color) continue;
    entry.material.color
      .copy(entry.color)
      .lerp(SILHOUETTE_COLOR, data.silhouette);
  }
  data.silhouetteDirty = data.silhouette > 0;
}

function updateTrailTint(enemy, inTrail) {
  const data = enemy.userData;
  if (data.flashTimer > 0) return;
  if (!inTrail && !data.trailTinted) return;
  data.trailTinted = inTrail;
  for (const entry of data.flashOriginals) {
    if (!entry.emissive) continue;
    if (inTrail) {
      entry.material.emissive.setHex(TRAIL.tint);
      if (entry.intensity !== null)
        entry.material.emissiveIntensity = TRAIL.tintIntensity;
    } else {
      entry.material.emissive.copy(entry.emissive);
      if (entry.intensity !== null)
        entry.material.emissiveIntensity = entry.intensity;
    }
  }
}

function playOneShot(enemy, action) {
  const data = enemy.userData;
  if (!action) return;
  const from = data.currentAction;
  action.reset();
  action.setEffectiveWeight(1);
  action.play();
  if (from && from !== action) from.crossFadeTo(action, ANIM_FADE, false);
  data.currentAction = action;
  data.oneShotRemaining = Math.max(action.getClip().duration - ANIM_FADE, 0.05);
}

export function updateEnemies(delta) {
  if (!ready) return;

  const playerCollider = getCollider(player);

  const playerCenter = getHitCenter();

  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    const data = enemy.userData;

    if (data.isBoss) continue;

    const collider = data.collider;

    data.mixer.update(delta);

    if (data.flashTimer > 0) {
      data.flashTimer -= delta;
      if (data.flashTimer <= 0) restoreFlash(enemy);
    }

    updateSilhouette(enemy, delta);

    if (data.dying) {
      data.dyingTimer -= delta;
      if (!data.fading && data.dyingTimer <= ENEMY.deathFade) {
        data.fading = true;
        enemy.traverse((node) => {
          if (node.isMesh) node.castShadow = false;
        });
      }
      if (data.fading) {
        fadeMaterials(
          data.materials,
          Math.max(0, data.dyingTimer / ENEMY.deathFade),
        );
      }
      if (data.dyingTimer <= 0) removeEnemy(enemy);
      continue;
    }

    if (data.oneShotRemaining > 0) {
      data.oneShotRemaining -= delta;
      if (
        data.oneShotRemaining <= 0 &&
        data.actions.move &&
        data.currentAction !== data.actions.move
      ) {
        const move = data.actions.move;
        move.reset();
        move.setEffectiveWeight(1);
        move.play();
        data.currentAction.crossFadeTo(move, ANIM_FADE, false);
        data.currentAction = move;
      }
    }

    if (data.slowTimer > 0) {
      data.slowTimer -= delta;
      if (data.slowTimer <= 0) data.slowFactor = 1;
    }

    const inTrail = isInsideTrail(enemy.position.x, enemy.position.y);
    if (inTrail) {
      data.trailTickTimer -= delta;
      if (data.trailTickTimer <= 0) {
        data.trailTickTimer = TRAIL.tickInterval;
        const stats = getStats();
        let damage =
          (TRAIL.damageBase + stats.hearts * TRAIL.damagePerHeart) *
          stats.trailDamageMul;
        if (stats.critChance > 0 && Math.random() < stats.critChance)
          damage *= 2;
        damageEnemy(enemy, damage, { silent: true, source: "trail" });
        if (data.dying) continue;
      }
    }
    updateTrailTint(enemy, inTrail);

    if (data.stunTimer > 0) {
      data.stunTimer -= delta;
      data.touchingPlayer = false;
      data.velocity.x = 0;
      data.velocity.y = 0;
      continue;
    }

    const toPlayerX = player.position.x - enemy.position.x;
    const toPlayerY = player.position.y - enemy.position.y;
    const playerDistance = Math.hypot(toPlayerX, toPlayerY);
    const behavior = data.typeConfig.behavior;

    let dirX = 0;
    let dirY = 0;

    if (behavior === "chase" || behavior === "tank") {
      if (playerDistance > 1e-6) {
        dirX = toPlayerX / playerDistance;
        dirY = toPlayerY / playerDistance;
      }
    } else if (behavior === "ranged") {
      const inner = ENEMY.rangedStandoff - ENEMY.rangedBand;
      const outer = ENEMY.rangedStandoff + ENEMY.rangedBand;
      if (playerDistance > outer) {
        dirX = toPlayerX / playerDistance;
        dirY = toPlayerY / playerDistance;
      } else if (playerDistance < inner && playerDistance > 1e-6) {
        dirX = -toPlayerX / playerDistance;
        dirY = -toPlayerY / playerDistance;
      } else if (playerDistance > 1e-6) {
        const side =
          data.orbitSide || (data.orbitSide = Math.random() < 0.5 ? 1 : -1);
        dirX = (-toPlayerY / playerDistance) * side * 0.5;
        dirY = (toPlayerX / playerDistance) * side * 0.5;
      }
    } else if (behavior === "speeder") {
      data.speederTimer -= delta;
      const cycle = ENEMY.speederDashOn + ENEMY.speederDashOff;
      if (data.speederTimer <= 0) data.speederTimer += cycle;
      const dashing = data.speederTimer > ENEMY.speederDashOff;
      if (dashing && playerDistance > 1e-6) {
        const zigzag =
          (Math.sin(data.travelClock * ENEMY.speederZigzagHz * Math.PI * 2) *
            (ENEMY.speederZigzagDeg * Math.PI)) /
          180;
        const baseAngle = Math.atan2(toPlayerY, toPlayerX) + zigzag;
        dirX = Math.cos(baseAngle);
        dirY = Math.sin(baseAngle);
      }
    }

    if (collider && data.escapeWaypoint) {
      const arrived =
        enemy.position.distanceTo(data.escapeWaypoint) <=
        ESCAPE_WAYPOINT_REACHED;
      if (
        arrived ||
        hasLineOfSight(collider, enemy.position, player.position)
      ) {
        data.escapeWaypoint = null;
        data.stuckTimer = 0;
      } else {
        const wx = data.escapeWaypoint.x - enemy.position.x;
        const wy = data.escapeWaypoint.y - enemy.position.y;
        const wLength = Math.hypot(wx, wy);
        if (wLength > 1e-6) {
          dirX = wx / wLength;
          dirY = wy / wLength;
        }
      }
    }

    const moving = dirX !== 0 || dirY !== 0;
    const startX = enemy.position.x;
    const startY = enemy.position.y;

    if (collider && moving) {
      const speed =
        ENEMY.baseSpeed *
        data.typeConfig.speedMul *
        endlessSpeedMul *
        data.slowFactor;

      const stepLength = speed * delta;
      const subSteps = Math.max(1, Math.ceil(stepLength / MAX_MOVE_SUB_STEP));
      const subX = (dirX * stepLength) / subSteps;
      const subY = (dirY * stepLength) / subSteps;

      for (let i = 0; i < subSteps; i++) {
        const nx = enemy.position.x + subX;
        const ny = enemy.position.y + subY;
        if (isMoveFree(collider, nx, ny, true)) {
          enemy.position.x = nx;
          enemy.position.y = ny;
          continue;
        }

        if (isMoveFree(collider, nx, enemy.position.y, true)) {
          enemy.position.x = nx;
          continue;
        }
        if (isMoveFree(collider, enemy.position.x, ny, true)) {
          enemy.position.y = ny;
          continue;
        }
        break;
      }

      const moved =
        Math.hypot(enemy.position.x - startX, enemy.position.y - startY) >
        STUCK_EPSILON;
      if (moved) {
        data.stuckTimer = 0;
      } else {
        data.stuckTimer += delta;
        updateEscapeState(collider, enemy);
      }
    }

    data.velocity.x = (enemy.position.x - startX) / Math.max(delta, 1e-6);
    data.velocity.y = (enemy.position.y - startY) / Math.max(delta, 1e-6);
    data.travelClock += delta;

    const model =
      enemy.userData.model || (enemy.userData.model = enemy.children[0]);
    if (model && moving) {
      model.rotation.y = Math.atan2(dirY, dirX) + data.typeConfig.yawOffset;
    }

    data.touchingPlayer =
      !!collider &&
      !!playerCollider &&
      circlesTouch(
        enemy.position.x,
        enemy.position.y,
        collider.radius,
        playerCenter.x,
        playerCenter.y,
        playerCollider.radius,
      );

    data.contactAnimTimer -= delta;
    if (
      data.touchingPlayer &&
      data.contactAnimTimer <= 0 &&
      data.actions.attack
    ) {
      data.contactAnimTimer = CONTACT_ANIM_INTERVAL;
      playOneShot(enemy, data.actions.attack);
    }

    if (behavior === "ranged") {
      data.fireTimer -= delta;
      if (data.fireTimer <= 0) {
        data.fireTimer =
          ENEMY.rangedFireInterval / (endlessAttackMul * doomMul);

        const outside = isOutsideArena(enemy.position.x, enemy.position.y);
        const inRange = playerDistance <= ENEMY.rangedStandoff * 1.6;

        const clearShot =
          !outside &&
          isLineSightClear(
            enemy.position.x,
            enemy.position.y,
            player.position.x,
            player.position.y,
            PROJECTILE.enemyRadius * COLLISION.projectileRadiusMul,
          );
        if (inRange && clearShot) {
          const flightTime = playerDistance / PROJECTILE.enemySpeed;
          const playerVelocity = player.userData.velocity || { x: 0, y: 0 };
          let aimX =
            player.position.x +
            playerVelocity.x * flightTime * ENEMY.rangedAimLead;
          let aimY =
            player.position.y +
            playerVelocity.y * flightTime * ENEMY.rangedAimLead;

          const missAngle = Math.random() * Math.PI * 2;
          const missDistance = Math.sqrt(Math.random()) * ENEMY.rangedAimError;
          aimX += Math.cos(missAngle) * missDistance;
          aimY += Math.sin(missAngle) * missDistance;

          const dirToAimX = aimX - enemy.position.x;
          const dirToAimY = aimY - enemy.position.y;
          const aimLength = Math.max(Math.hypot(dirToAimX, dirToAimY), 1e-6);

          spawnEnemyShot(
            enemy.position.x,
            enemy.position.y,
            dirToAimX / aimLength,
            dirToAimY / aimLength,
            enemy,

            endlessAttackMul * doomMul,
          );

          if (data.currentAction !== data.actions.attack) {
            playOneShot(enemy, data.actions.attack);
          }
        }
      }
    }
  }
}

function hasLineOfSight(collider, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dy) / ESCAPE_PROBE_SPACING),
  );
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!isMoveFree(collider, from.x + dx * t, from.y + dy * t, true))
      return false;
  }
  return true;
}

function pickEscapeWaypoint(collider, enemy, avoid) {
  const toPlayerX = player.position.x - enemy.position.x;
  const toPlayerY = player.position.y - enemy.position.y;
  const length = Math.hypot(toPlayerX, toPlayerY);
  if (length < 1e-6) return null;

  const sideX = (-toPlayerY / length) * ESCAPE_WAYPOINT_DISTANCE;
  const sideY = (toPlayerX / length) * ESCAPE_WAYPOINT_DISTANCE;
  const left = new THREE.Vector3(
    enemy.position.x + sideX,
    enemy.position.y + sideY,
    0,
  );
  const right = new THREE.Vector3(
    enemy.position.x - sideX,
    enemy.position.y - sideY,
    0,
  );

  const free = [];
  if (isMoveFree(collider, left.x, left.y, true)) free.push(left);
  if (isMoveFree(collider, right.x, right.y, true)) free.push(right);
  if (free.length === 0) return null;
  if (free.length === 1) return free[0];

  if (avoid) {
    const onLeft =
      (avoid.x - enemy.position.x) * sideX +
        (avoid.y - enemy.position.y) * sideY >
      0;
    return onLeft ? right : left;
  }
  return Math.random() < 0.5 ? left : right;
}

function updateEscapeState(collider, enemy) {
  const data = enemy.userData;

  if (data.escapeWaypoint) {
    if (data.stuckTimer < STUCK_ESCAPE_SECONDS * 2) return;
    data.escapeWaypoint =
      pickEscapeWaypoint(collider, enemy, data.escapeWaypoint) ??
      data.escapeWaypoint;
    data.stuckTimer = STUCK_ESCAPE_SECONDS;
    return;
  }

  if (data.stuckTimer < STUCK_ESCAPE_SECONDS) return;
  data.escapeWaypoint = pickEscapeWaypoint(collider, enemy, null);
  data.stuckTimer = data.escapeWaypoint ? STUCK_ESCAPE_SECONDS : 0;
}

export function getEnemies() {
  return enemies;
}

export function getAliveCount() {
  let count = 0;
  for (const enemy of enemies) {
    if (!enemy.userData.dying && !enemy.userData.isBoss) count++;
  }
  return count;
}

export function addToEnemyList(enemy) {
  if (!enemies.includes(enemy)) enemies.push(enemy);
}

export function removeFromEnemyList(enemy) {
  const index = enemies.indexOf(enemy);
  if (index !== -1) enemies.splice(index, 1);
}

function removeEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index === -1) return false;

  enemies.splice(index, 1);
  unregisterCollider(enemy);

  if (enemy.parent) enemy.parent.remove(enemy);
  return true;
}

export function resetEnemies() {
  for (const enemy of enemies.slice()) removeEnemy(enemy);
  endlessHpMul = 1;
  endlessSpeedMul = 1;
  endlessAttackMul = 1;
  doomMul = 1;
  doomHpMul = 1;
}
