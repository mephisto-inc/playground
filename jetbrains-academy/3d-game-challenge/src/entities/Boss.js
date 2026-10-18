import * as THREE from "three";
import {
  cloneMaterials,
  cloneModel,
  disposeModel,
  enableShadows,
  fadeMaterials,
  loadGLTF,
  normalizeModel,
} from "../core/Assets.js";
import {
  circlesTouch,
  getCollider,
  isMoveFree,
  isSpotFree,
  MAX_MOVE_SUB_STEP,
  registerCollider,
  unregisterCollider,
} from "../core/Collision.js";
import {clamp} from "../core/MathUtils.js";
import {BOSS, COLLISION, ENEMY, SPAWN_POINTS, TRAIL,} from "../config/tuning.js";
import {BOSS_TYPE} from "../config/enemies.js";
import player, {
  applyPlayerSlow,
  damagePlayer,
  getHitCenter,
  getStats,
  isInvulnerable,
  isShieldActive,
} from "./Player.js";
import {
  addToEnemyList,
  getAliveCount,
  getDoomHpMul,
  getDoomMul,
  isOutsideArena,
  removeFromEnemyList,
  spawnEnemy,
} from "./Enemy.js";
import {isInsideTrail} from "./Trail.js";
import {spawnHeart, spawnPowerupDrop} from "./Pickup.js";
import {spawnBossOrb} from "./Projectile.js";
import {playSfxAt} from "../systems/Audio.js";
import {addScore} from "../systems/Score.js";
import {recordKill} from "../systems/Achievements.js";

const ANIM_FADE = 0.15;

const CHARGE_RED = 0xcc1f1f;

const PUSH_STEP = 0.15;

const STUCK_ESCAPE_SECONDS = 0.5;
const ESCAPE_WAYPOINT_DISTANCE = 6;
const ESCAPE_WAYPOINT_REACHED = 1.2;
const ESCAPE_PROBE_SPACING = 1.5;
const STUCK_EPSILON = 0.01;

const WAVE_INNER = 0.9;

let sceneRef = null;
let prepared = null;
let boss = null;
let endlessSpeedMul = 1;
let endlessAttackMul = 1;

const wave = {
  mesh: null,
  active: false,
  originX: 0,
  originY: 0,
  dirAngle: 0,
  radius: 0,
  maxRadius: 0,
  speed: 0,
  hit: false,
};

const SILHOUETTE_COLOR = new THREE.Color(ENEMY.silhouetteColor);

export async function initBoss(scene) {
  sceneRef = scene;
  const gltf = await loadGLTF(BOSS_TYPE.model);
  const template = gltf.scene;
  enableShadows(template);

  const probe = cloneModel(template);
  const shape = normalizeModel(probe, {targetHeight: BOSS_TYPE.targetHeight});

  const findClip = (name) => {
    if (!name) return null;
    const base = (clipName) => {
      const bar = clipName.lastIndexOf("|");
      return bar >= 0 ? clipName.slice(bar + 1) : clipName;
    };
    const lower = name.toLowerCase();
    return (
      gltf.animations.find(
        (clip) => clip.name === name || base(clip.name) === name,
      ) ||
      gltf.animations.find((clip) => base(clip.name).toLowerCase() === lower) ||
      gltf.animations.find((clip) => {
        const clipName = base(clip.name).toLowerCase();
        return clipName.includes(lower) || lower.includes(clipName);
      }) ||
      null
    );
  };
  const clips = {
    move: findClip(BOSS_TYPE.moveClip),
    idle: findClip(BOSS_TYPE.idleClip),
    attack: findClip(BOSS_TYPE.attackClip),
    volley: findClip(BOSS_TYPE.volleyClip),
    hit: findClip(BOSS_TYPE.hitClip),
    death: findClip(BOSS_TYPE.deathClip),
  };
  const missing = Object.entries(clips)
    .filter(([, clip]) => !clip)
    .map(([key]) => key);
  if (missing.length > 0) {
    console.warn(
      `Boss: no clip for [${missing.join(", ")}].`,
      "Available:",
      gltf.animations.map((clip) => clip.name),
    );
  }

  prepared = {
    template,
    scale: shape.scale,
    groundOffset: shape.groundOffset,
    radius: shape.radius * COLLISION.bossRadiusMul,
    clips,
  };
}

export function spawnBoss(
  hp,
  speedMul = BOSS.speedMul,
  orbSpeedMul = 1,
  knockbackImmune = false,
  hpRage = false,
) {
  if (!prepared || !sceneRef || boss) return null;
  hideBossWave();

  const point = pickSpawnPoint();
  if (!point) return null;

  const model = cloneModel(prepared.template);
  model.rotation.x = Math.PI / 2;
  model.scale.setScalar(prepared.scale);
  model.position.z += prepared.groundOffset;

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
  group.position.set(point.x, point.y, 0);
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
    move: makeAction(prepared.clips.move, false),
    idle: makeAction(prepared.clips.idle, false),
    attack: makeAction(prepared.clips.attack, true),
    volley: makeAction(prepared.clips.volley, true),
    hit: makeAction(prepared.clips.hit, true),
    death: makeAction(prepared.clips.death, true),
  };
  if (actions.move) actions.move.play();
  else if (actions.idle) actions.idle.play();

  const data = group.userData;
  data.isBoss = true;
  data.maxHp = Math.ceil(hp * getDoomHpMul());
  data.hp = data.maxHp;
  data.speedMul = speedMul;
  data.orbSpeedMul = orbSpeedMul;
  data.knockbackImmune = knockbackImmune;
  data.hpRage = hpRage;
  data.collider = registerCollider(group, group.position, prepared.radius);
  data.dying = false;
  data.dyingTimer = 0;
  data.fading = false;
  data.model = model;
  data.materials = materials;
  data.flashTimer = 0;
  data.flashOriginals = flashOriginals;
  data.mixer = mixer;
  data.actions = actions;
  data.currentAction = actions.move || actions.idle;
  data.oneShotRemaining = 0;
  data.touchingPlayer = false;
  data.velocity = {x: 0, y: 0};

  data.state = "chaseA";
  data.stateTimer = BOSS.phaseAChase;
  data.stuckTimer = 0;
  data.escapeWaypoint = null;
  data.lastAttack = null;
  data.nextChase = "chaseB";
  data.spiralAngle = 0;
  data.spiralTimer = 0;
  data.dashDirection = {x: 0, y: 0};
  data.dashHit = false;

  data.silhouette = 0;
  data.silhouetteDirty = false;

  data.trailTickTimer = Math.random() * TRAIL.tickInterval;
  data.trailTinted = false;

  data.lastHitSource = "shot";

  boss = group;
  addToEnemyList(group);

  playSfxAt(
    "boss_spawn",
    group.position.x,
    group.position.y,
    player.position.x,
    player.position.y,
  );
  return group;
}

function pickSpawnPoint() {
  const candidates = SPAWN_POINTS.map((point) => point);

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const point of candidates) {
    if (isSpotFree(point.x, point.y, prepared.radius)) return point;
  }
  return null;
}

export function damageBoss(amount, options = {}) {
  if (!boss || boss.userData.dying) return false;

  const data = boss.userData;
  data.hp -= amount;
  data.lastHitSource = options.source || "shot";
  if (!options.silent) {
    flashBoss();

    playSfxAt(
      "hit",
      boss.position.x,
      boss.position.y,
      player.position.x,
      player.position.y,
    );
  }

  if (options.knockback > 0) {
    knockbackBoss(
      options.knockbackX || 0,
      options.knockbackY || 0,
      options.knockback,
    );
  }

  if (data.hp <= 0) {
    killBoss();
    return true;
  }
  if (!options.silent) playOneShot(boss, data.actions.hit);
  return false;
}

function knockbackBoss(dirX, dirY, distance) {
  if (!boss || boss.userData.dying || boss.userData.knockbackImmune) return;
  const collider = boss.userData.collider;
  const length = Math.hypot(dirX, dirY);
  if (!collider || length < 1e-6) return;

  const ux = dirX / length;
  const uy = dirY / length;
  let remaining = distance;
  while (remaining > 0) {
    const step = Math.min(PUSH_STEP, remaining);
    const nx = boss.position.x + ux * step;
    const ny = boss.position.y + uy * step;
    if (!isMoveFree(collider, nx, ny, true)) break;
    boss.position.x = nx;
    boss.position.y = ny;
    remaining -= step;
  }
}

function killBoss() {
  const data = boss.userData;
  data.dying = true;
  data.touchingPlayer = false;
  data.velocity.x = 0;
  data.velocity.y = 0;
  hideBossWave();
  unregisterCollider(boss);
  data.collider = null;

  const deathAction = data.actions.death;
  if (deathAction) {
    cancelOneShot(boss);
    deathAction.reset();
    deathAction.setEffectiveWeight(1);
    deathAction.play();
    data.currentAction = deathAction;
    data.dyingTimer = clamp(deathAction.getClip().duration, 2.0, 3.0);
  } else {
    data.dyingTimer = 2.5;
  }

  addScore(BOSS_TYPE.score);

  recordKill(data.lastHitSource, true);

  const min = BOSS.heartDropsMin;
  const max = Math.max(min, BOSS.heartDropsMax);
  const drops = min + Math.floor(Math.random() * (max - min + 1));
  for (let i = 0; i < drops; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.6 + Math.random() * 1.2;
    spawnHeart(
      boss.position.x + Math.cos(angle) * radius,
      boss.position.y + Math.sin(angle) * radius,
    );
  }

  if (Math.random() < BOSS.powerupDropChance) {
    spawnPowerupDrop(boss.position.x, boss.position.y);
  }
}

export function updateBoss(delta) {
  if (!boss) return;
  const data = boss.userData;
  const collider = data.collider;

  updateBossWave(delta);

  data.mixer.update(delta);

  if (data.flashTimer > 0) {
    data.flashTimer -= delta;
    if (data.flashTimer <= 0) restoreBossMaterials();
  }

  updateBossSilhouette(delta);

  if (data.dying) {
    data.dyingTimer -= delta;
    if (!data.fading && data.dyingTimer <= BOSS.deathFade) {
      data.fading = true;
      boss.traverse((node) => {
        if (node.isMesh) node.castShadow = false;
      });
    }
    if (data.fading) {
      fadeMaterials(
        data.materials,
        Math.max(0, data.dyingTimer / BOSS.deathFade),
      );
    }
    if (data.dyingTimer <= 0) removeBoss();
    return;
  }

  if (data.oneShotRemaining > 0) {
    data.oneShotRemaining -= delta;
    if (data.oneShotRemaining <= 0) resumeLoopAction();
  }

  const inTrail = isInsideTrail(boss.position.x, boss.position.y);
  if (inTrail) {
    data.trailTickTimer -= delta;
    if (data.trailTickTimer <= 0) {
      data.trailTickTimer = TRAIL.tickInterval;
      const stats = getStats();
      let damage =
        (TRAIL.damageBase + stats.hearts * TRAIL.damagePerHeart) *
        stats.trailDamageMul;
      if (stats.critChance > 0 && Math.random() < stats.critChance) damage *= 2;
      damageBoss(damage, {silent: true, source: "trail"});
      if (data.dying) return;
    }
  }
  updateBossTrailTint(inTrail);

  const toPlayerX = player.position.x - boss.position.x;
  const toPlayerY = player.position.y - boss.position.y;
  const playerDistance = Math.max(Math.hypot(toPlayerX, toPlayerY), 1e-6);
  const dirToPlayerX = toPlayerX / playerDistance;
  const dirToPlayerY = toPlayerY / playerDistance;

  data.stateTimer -= delta;
  const startX = boss.position.x;
  const startY = boss.position.y;
  let moving = false;

  if (data.state === "chaseA" || data.state === "chaseB") {
    const speed = ENEMY.baseSpeed * data.speedMul * endlessSpeedMul;

    let chaseX = dirToPlayerX;
    let chaseY = dirToPlayerY;
    if (collider && data.escapeWaypoint) {
      const arrived =
        boss.position.distanceTo(data.escapeWaypoint) <=
        ESCAPE_WAYPOINT_REACHED;
      if (arrived || hasLineOfSight(collider, boss.position, player.position)) {
        data.escapeWaypoint = null;
        data.stuckTimer = 0;
      } else {
        const wx = data.escapeWaypoint.x - boss.position.x;
        const wy = data.escapeWaypoint.y - boss.position.y;
        const wLength = Math.hypot(wx, wy);
        if (wLength > 1e-6) {
          chaseX = wx / wLength;
          chaseY = wy / wLength;
        }
      }
    }

    const travelled = moveBoss(collider, chaseX, chaseY, speed, delta);
    if (travelled > STUCK_EPSILON) {
      data.stuckTimer = 0;
    } else if (collider) {
      data.stuckTimer += delta;
      updateEscapeState(collider);
    }
    faceBoss(chaseX, chaseY);
    moving = true;

    if (data.stateTimer <= 0) {
      startRandomAttack(data.state === "chaseA" ? "chaseB" : "chaseA");
    }
  } else if (data.state === "chargeA") {
    faceBoss(dirToPlayerX, dirToPlayerY);
    if (data.stateTimer <= 0) {
      if (!isOutsideArena(boss.position.x, boss.position.y)) fireOrbVolley();
      finishAttack();
    }
  } else if (data.state === "spiral") {
    faceBoss(dirToPlayerX, dirToPlayerY);
    data.spiralTimer -= delta;
    if (data.spiralTimer <= 0) {
      data.spiralTimer = BOSS.spiralInterval;
      if (!isOutsideArena(boss.position.x, boss.position.y)) fireSpiralBurst();
    }
    if (data.stateTimer <= 0) finishAttack();
  } else if (data.state === "telegraph") {
    faceBoss(dirToPlayerX, dirToPlayerY);
    if (data.stateTimer <= 0) {
      data.state = "dash";
      data.stateTimer = BOSS.dashDuration;
      data.dashDirection.x = dirToPlayerX;
      data.dashDirection.y = dirToPlayerY;
      data.dashHit = false;
      restoreBossMaterials();
    }
  } else if (data.state === "dash") {
    const speed = BOSS.dashSpeed * endlessSpeedMul;
    const travelled = moveBoss(
      collider,
      data.dashDirection.x,
      data.dashDirection.y,
      speed,
      delta,
    );
    moving = true;
    faceBoss(data.dashDirection.x, data.dashDirection.y);

    const playerCollider = getCollider(player);
    const playerCenter = getHitCenter();
    if (
      !data.dashHit &&
      playerCollider &&
      collider &&
      circlesTouch(
        boss.position.x,
        boss.position.y,
        collider.radius,
        playerCenter.x,
        playerCenter.y,
        playerCollider.radius,
      )
    ) {
      if (!isInvulnerable() || isShieldActive()) {
        data.dashHit = true;

        damagePlayer(BOSS.dashDamage * getDoomMul(), "physical");
        finishAttack();
      }
    }

    const blocked = travelled <= 1e-6;
    if (data.stateTimer <= 0 || blocked) {
      if (data.state === "dash") {
        finishAttack();
      }
    }
  }

  if (data.state !== "dash" && collider) {
    if (pushPlayerOut(collider)) {
      damagePlayer(BOSS.contactDamage * getDoomMul(), "physical");
    }
  }

  data.velocity.x = (boss.position.x - startX) / Math.max(delta, 1e-6);
  data.velocity.y = (boss.position.y - startY) / Math.max(delta, 1e-6);

  if (
    !moving &&
    data.state === "chargeA" &&
    data.oneShotRemaining <= 0 &&
    data.currentAction !== data.actions.idle
  ) {
    playLoopAction(data.actions.idle);
  }
}

function startRandomAttack(nextChase) {
  const data = boss.userData;
  data.nextChase = nextChase;
  data.stuckTimer = 0;
  data.escapeWaypoint = null;

  const pool = BOSS.attacks.filter((name) => name !== data.lastAttack);
  const choice = pool[Math.floor(Math.random() * pool.length)];
  data.lastAttack = choice;

  if (choice === "volley") {
    data.state = "chargeA";
    data.stateTimer = BOSS.chargeTime;
    playLoopAction(data.actions.idle);
  } else if (choice === "dash") {
    data.state = "telegraph";
    data.stateTimer = BOSS.dashTelegraph;
    playOneShot(boss, data.actions.attack);
    tintRed();
  } else if (choice === "spiral") {
    data.state = "spiral";
    data.stateTimer = BOSS.spiralDuration;
    data.spiralTimer = 0;
    data.spiralAngle = Math.random() * Math.PI * 2;
    playOneShot(boss, data.actions.volley || data.actions.attack);
  } else if (choice === "shockwave") {
    if (!isOutsideArena(boss.position.x, boss.position.y)) castForwardWave();
    playOneShot(boss, data.actions.attack);
    finishAttack();
  } else if (choice === "summon") {
    summonReinforcements();
    playOneShot(boss, data.actions.attack);
    finishAttack();
  }
}

function finishAttack() {
  const data = boss.userData;
  data.state = data.nextChase;
  data.stateTimer = chaseDelay(
    data.nextChase === "chaseA" ? BOSS.phaseAChase : BOSS.phaseBChase,
  );
}

function chaseDelay(base) {
  const data = boss.userData;
  let rageMul = 1;
  if (data.hpRage) {
    const hpFraction = Math.max(0, data.hp / data.maxHp);
    rageMul = Math.max(
      0,
      (hpFraction - BOSS.hpRageFloor) / (1 - BOSS.hpRageFloor),
    );
  }
  return (base / endlessAttackMul / getDoomMul()) * rageMul;
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

function pickEscapeWaypoint(collider, avoid) {
  const toPlayerX = player.position.x - boss.position.x;
  const toPlayerY = player.position.y - boss.position.y;
  const length = Math.hypot(toPlayerX, toPlayerY);
  if (length < 1e-6) return null;

  const sideX = (-toPlayerY / length) * ESCAPE_WAYPOINT_DISTANCE;
  const sideY = (toPlayerX / length) * ESCAPE_WAYPOINT_DISTANCE;
  const left = new THREE.Vector3(
    boss.position.x + sideX,
    boss.position.y + sideY,
    0,
  );
  const right = new THREE.Vector3(
    boss.position.x - sideX,
    boss.position.y - sideY,
    0,
  );

  const free = [];
  if (isMoveFree(collider, left.x, left.y, true)) free.push(left);
  if (isMoveFree(collider, right.x, right.y, true)) free.push(right);
  if (free.length === 0) return null;
  if (free.length === 1) return free[0];

  if (avoid) {
    const onLeft =
      (avoid.x - boss.position.x) * sideX +
      (avoid.y - boss.position.y) * sideY >
      0;
    return onLeft ? right : left;
  }
  return Math.random() < 0.5 ? left : right;
}

function updateEscapeState(collider) {
  const data = boss.userData;

  if (data.escapeWaypoint) {
    if (data.stuckTimer < STUCK_ESCAPE_SECONDS * 2) return;

    data.escapeWaypoint =
      pickEscapeWaypoint(collider, data.escapeWaypoint) ?? data.escapeWaypoint;
    data.stuckTimer = STUCK_ESCAPE_SECONDS;
    return;
  }

  if (data.stuckTimer < STUCK_ESCAPE_SECONDS) return;
  data.escapeWaypoint = pickEscapeWaypoint(collider, null);
  data.stuckTimer = data.escapeWaypoint ? STUCK_ESCAPE_SECONDS : 0;
}

function moveBoss(collider, dirX, dirY, speed, delta) {
  if (!collider) return 0;
  const startX = boss.position.x;
  const startY = boss.position.y;

  const stepLength = speed * delta;
  const subSteps = Math.max(1, Math.ceil(stepLength / MAX_MOVE_SUB_STEP));
  const subX = (dirX * stepLength) / subSteps;
  const subY = (dirY * stepLength) / subSteps;

  for (let i = 0; i < subSteps; i++) {
    const nx = boss.position.x + subX;
    const ny = boss.position.y + subY;

    if (isMoveFree(collider, nx, ny, true)) {
      boss.position.x = nx;
      boss.position.y = ny;
      continue;
    }
    if (isMoveFree(collider, nx, boss.position.y, true)) {
      boss.position.x = nx;
      continue;
    }
    if (isMoveFree(collider, boss.position.x, ny, true)) {
      boss.position.y = ny;
      continue;
    }
    break;
  }

  return Math.hypot(boss.position.x - startX, boss.position.y - startY);
}

function faceBoss(dirX, dirY) {
  const model = boss.children[0];
  if (model && (dirX !== 0 || dirY !== 0)) {
    model.rotation.y = Math.atan2(dirY, dirX) + BOSS_TYPE.yawOffset;
  }
}

function pushPlayerOut(bossCollider) {
  if (isInvulnerable() && !isShieldActive()) return false;
  const playerCollider = getCollider(player);
  if (!playerCollider) return false;

  const playerCenter = getHitCenter();
  const dx = playerCenter.x - boss.position.x;
  const dy = playerCenter.y - boss.position.y;
  const distance = Math.hypot(dx, dy);
  const reach = playerCollider.radius + bossCollider.radius;

  if (distance >= reach) return false;
  if (isInvulnerable()) return true;

  const ux = distance > 1e-6 ? dx / distance : 1;
  const uy = distance > 1e-6 ? dy / distance : 0;
  let remaining = reach - distance + 0.05;
  while (remaining > 0) {
    const step = Math.min(PUSH_STEP, remaining);
    const nx = player.position.x + ux * step;
    const ny = player.position.y + uy * step;
    if (!isMoveFree(playerCollider, nx, ny)) break;
    player.position.x = nx;
    player.position.y = ny;
    remaining -= step;
  }
  return true;
}

function fireOrbVolley() {
  if (!boss) return;
  playOneShot(
    boss,
    boss.userData.actions.volley || boss.userData.actions.attack,
  );

  const orbSpeedMul =
    boss.userData.orbSpeedMul * endlessAttackMul * getDoomMul();
  for (let i = 0; i < BOSS.orbCount; i++) {
    const angle = (i / BOSS.orbCount) * Math.PI * 2;
    spawnBossOrb(
      boss.position.x,
      boss.position.y,
      Math.cos(angle),
      Math.sin(angle),
      orbSpeedMul,
      boss,
    );
  }
}

function castForwardWave() {
  const dx = player.position.x - boss.position.x;
  const dy = player.position.y - boss.position.y;
  wave.dirAngle = Math.atan2(dy, dx);
  wave.originX = boss.position.x;
  wave.originY = boss.position.y;
  wave.radius = 1;
  wave.maxRadius = BOSS.waveMaxRadius;
  wave.speed = BOSS.waveSpeed * endlessAttackMul * getDoomMul();
  wave.hit = false;
  wave.active = true;

  ensureWaveMesh();
  const arc = (BOSS.waveArcDeg * Math.PI) / 180;
  wave.mesh.rotation.z = wave.dirAngle - arc / 2;
  wave.mesh.position.x = wave.originX;
  wave.mesh.position.y = wave.originY;
  wave.mesh.visible = true;
}

function updateBossWave(delta) {
  if (!wave.active) return;

  wave.radius += wave.speed * delta;
  const p = Math.min(wave.radius / wave.maxRadius, 1);
  wave.mesh.scale.setScalar(wave.radius);
  wave.mesh.material.opacity = 0.75 * (1 - p * p);

  if (!wave.hit) {
    const dx = player.position.x - wave.originX;
    const dy = player.position.y - wave.originY;
    const distance = Math.hypot(dx, dy);
    let diff = Math.atan2(dy, dx) - wave.dirAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const halfArc = (BOSS.waveArcDeg * Math.PI) / 360;
    const playerCollider = getCollider(player);
    const playerRadius = playerCollider ? playerCollider.radius : 0.5;
    if (
      Math.abs(diff) <= halfArc &&
      distance - playerRadius <= wave.radius &&
      distance + playerRadius >= wave.radius * WAVE_INNER
    ) {
      wave.hit = true;
      applyPlayerSlow(BOSS.waveSlowMul, BOSS.waveSlowDuration);
    }
  }

  if (wave.radius >= wave.maxRadius) hideBossWave();
}

function ensureWaveMesh() {
  if (wave.mesh) return;
  const arc = (BOSS.waveArcDeg * Math.PI) / 180;
  wave.mesh = new THREE.Mesh(
    new THREE.RingGeometry(WAVE_INNER, 1, 48, 1, 0, arc),
    new THREE.MeshBasicMaterial({
      color: BOSS.waveColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  wave.mesh.position.z = 0.1;
  wave.mesh.visible = false;
  sceneRef.add(wave.mesh);
}

function hideBossWave() {
  wave.active = false;
  if (wave.mesh) wave.mesh.visible = false;
}

function fireSpiralBurst() {
  const data = boss.userData;
  const speedMul =
    data.orbSpeedMul * endlessAttackMul * getDoomMul() * BOSS.spiralSpeedMul;
  for (let i = 0; i < BOSS.spiralOrbs; i++) {
    const angle = data.spiralAngle + (i / BOSS.spiralOrbs) * Math.PI * 2;
    spawnBossOrb(
      boss.position.x,
      boss.position.y,
      Math.cos(angle),
      Math.sin(angle),
      speedMul,
      boss,
    );
  }
  data.spiralAngle += (BOSS.spiralStepDeg * Math.PI) / 180;
}

function summonReinforcements() {
  if (getAliveCount() + BOSS.summonCount > ENEMY.maxAlive) return;
  for (let i = 0; i < BOSS.summonCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.random() * BOSS.summonRadius;
    const typeId =
      BOSS.summonTypes[Math.floor(Math.random() * BOSS.summonTypes.length)];
    spawnEnemy(typeId, {
      x: boss.position.x + Math.cos(angle) * radius,
      y: boss.position.y + Math.sin(angle) * radius,
    });
  }
}

function playOneShot(entity, action) {
  const data = entity.userData;
  if (!action) return;
  const from = data.currentAction;
  action.reset();
  action.setEffectiveWeight(1);
  action.play();
  if (from && from !== action) from.crossFadeTo(action, ANIM_FADE, false);
  data.currentAction = action;
  data.oneShotRemaining = Math.max(action.getClip().duration - ANIM_FADE, 0.05);
}

function playLoopAction(action) {
  if (!boss || !action) return;
  const data = boss.userData;
  const from = data.currentAction;
  action.reset();
  action.setEffectiveWeight(1);
  action.play();
  if (from && from !== action) from.crossFadeTo(action, 0.25, false);
  data.currentAction = action;
  data.oneShotRemaining = 0;
}

function resumeLoopAction() {
  if (!boss) return;
  const data = boss.userData;
  const target =
    data.state === "chaseA" || data.state === "chaseB" || data.state === "dash"
      ? data.actions.move
      : data.actions.idle;
  if (target && data.currentAction !== target) playLoopAction(target);
}

function cancelOneShot(entity) {
  entity.userData.oneShotRemaining = 0;
}

function tintRed() {
  const data = boss.userData;
  for (const entry of data.flashOriginals) {
    if (!entry.emissive) continue;
    entry.material.emissive.setHex(CHARGE_RED);
    if (entry.intensity !== null) entry.material.emissiveIntensity = 0.9;
  }
}

function flashBoss() {
  const data = boss.userData;
  data.flashTimer = ENEMY.hitFlashDuration;
  for (const entry of data.flashOriginals) {
    if (!entry.emissive) continue;
    entry.material.emissive.setHex(0xffffff);
    if (entry.intensity !== null) entry.material.emissiveIntensity = 1;
  }
}

function restoreBossMaterials() {
  if (!boss) return;
  for (const entry of boss.userData.flashOriginals) {
    if (!entry.emissive) continue;
    entry.material.emissive.copy(entry.emissive);
    if (entry.intensity !== null)
      entry.material.emissiveIntensity = entry.intensity;
  }
}

function updateBossSilhouette(delta) {
  if (!boss) return;
  const data = boss.userData;
  const target = isOutsideArena(boss.position.x, boss.position.y) ? 1 : 0;
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

function updateBossTrailTint(inTrail) {
  if (!boss) return;
  const data = boss.userData;
  if (data.flashTimer > 0 || data.state === "telegraph") return;
  if (!inTrail && !data.trailTinted) return;
  data.trailTinted = inTrail;
  for (const entry of data.flashOriginals) {
    if (!entry.emissive) continue;
    if (inTrail) {
      entry.material.emissive.setHex(TRAIL.tint);
      if (entry.intensity !== null) {
        entry.material.emissiveIntensity = TRAIL.bossTintIntensity;
      }
    } else {
      entry.material.emissive.copy(entry.emissive);
      if (entry.intensity !== null)
        entry.material.emissiveIntensity = entry.intensity;
    }
  }
}

export function isBossAlive() {
  return !!boss && !boss.userData.dying;
}

export function getBossInfo() {
  if (!boss || boss.userData.dying) return null;
  return {hp: boss.userData.hp, maxHp: boss.userData.maxHp};
}

export function setBossEndlessScaling(speedMul, attackMul) {
  endlessSpeedMul = speedMul;
  endlessAttackMul = attackMul;
}

function removeBoss() {
  if (!boss) return;
  const data = boss.userData;
  if (data.mixer) {
    data.mixer.stopAllAction();
    if (data.model) data.mixer.uncacheRoot(data.model);
    data.mixer = null;
  }
  disposeModel(boss, data.materials);
  removeFromEnemyList(boss);
  unregisterCollider(boss);
  if (boss.parent) boss.parent.remove(boss);
  boss = null;
}

export function resetBoss() {
  removeBoss();
  hideBossWave();
  endlessSpeedMul = 1;
  endlessAttackMul = 1;
}
