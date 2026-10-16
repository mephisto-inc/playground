import * as THREE from 'three';
import {
    cloneMaterials,
    cloneModel,
    enableShadows,
    loadGLTF,
    normalizeModel,
} from '../core/Assets.js';
import {
    circlesTouch,
    getCollider,
    isMoveFree,
    isSpotFree,
    MAX_MOVE_SUB_STEP,
    registerCollider,
    unregisterCollider,
} from '../core/Collision.js';
import { ABILITY, BOSS, COLLISION, ENEMY, SPAWN_POINTS } from '../config/tuning.js';
import { BOSS_TYPE } from '../config/enemies.js';
import player, { damagePlayer, getHitCenter, isInvulnerable } from './Player.js';
import { addToEnemyList, removeFromEnemyList } from './Enemy.js';
import { getTrailSpeedFactor } from './Trail.js';
import { spawnHeart } from './Pickup.js';
import { spawnBossOrb } from './Projectile.js';
import { playSfx } from '../systems/Audio.js';
import { addScore } from '../systems/Score.js';

// Boss component (GDD 4B): the Arena Lord (Pigeon). One instance at most. Spawns at a random
// one of the 8 spawn points, chasing the player through a two-phase cycle:
//
//   chaseA -> chargeA (stands still 1.5 s) -> volley (24 orbs in a 360-degree circle)
//   chaseB -> telegraph (stands still, turns red 0.7 s) -> dash (fast, 2 physical damage)
//   ... and back to chaseA. The extra durations the GDD leaves open live in tuning.js (BOSS).
//
// The boss lives in Enemy.js's shared enemy list (addToEnemyList) so player shots, minions and
// hit detection all see it, but it runs its own AI here — Enemy.updateEnemies skips it. Body
// contact pushes the player away (GDD 3C) and now deals BOSS.contactDamage (round 5); the bigger
// hits come from orbs and the dash.

// Animation one-shot fades — same values/pattern as Enemy.js (the two modules stay independent
// because their state machines differ; the shared logic is a dozen lines, duplication is fine).
const ANIM_FADE = 0.15;

// Red charge tint for the dash telegraph (GDD 4B: "red charging dash").
const CHARGE_RED = 0xcc1f1f;

// Push step when shoving the player out of the boss's hitbox (same idea as knockback steps).
const PUSH_STEP = 0.15;

let sceneRef = null;
let prepared = null; // { template, scale, groundOffset, radius, clips }
let boss = null;     // the live boss group, or null
let endlessSpeedMul = 1;

// --- Loading ---------------------------------------------------------------

// Loads and prepares the boss model. Awaited by main.js alongside initEnemies.
export async function initBoss(scene) {
    sceneRef = scene;
    const gltf = await loadGLTF(BOSS_TYPE.model);
    const template = gltf.scene;
    enableShadows(template);

    const probe = cloneModel(template);
    const shape = normalizeModel(probe, { targetHeight: BOSS_TYPE.targetHeight });

    // Clip lookup: the exported animations prefix every name with "CharacterArmature|", so the
    // comparison strips everything up to the last '|' before matching (exact, then lowercase,
    // then substring — same tolerance as Enemy.js).
    const findClip = (name) => {
        if (!name) return null;
        const base = (clipName) => {
            const bar = clipName.lastIndexOf('|');
            return bar >= 0 ? clipName.slice(bar + 1) : clipName;
        };
        const lower = name.toLowerCase();
        return gltf.animations.find((clip) => clip.name === name || base(clip.name) === name)
            || gltf.animations.find((clip) => base(clip.name).toLowerCase() === lower)
            || gltf.animations.find((clip) => {
                const clipName = base(clip.name).toLowerCase();
                return clipName.includes(lower) || lower.includes(clipName);
            })
            || null;
    };
    const clips = {
        move: findClip(BOSS_TYPE.moveClip),
        idle: findClip(BOSS_TYPE.idleClip),
        attack: findClip(BOSS_TYPE.attackClip),
        volley: findClip(BOSS_TYPE.volleyClip),
        hit: findClip(BOSS_TYPE.hitClip),
        death: findClip(BOSS_TYPE.deathClip),
    };
    const missing = Object.entries(clips).filter(([, clip]) => !clip).map(([key]) => key);
    if (missing.length > 0) {
        console.warn(
            `Boss: no clip for [${missing.join(', ')}].`,
            'Available:', gltf.animations.map((clip) => clip.name),
        );
    }

    prepared = {
        template,
        scale: shape.scale,
        groundOffset: shape.groundOffset,
        radius: shape.radius * COLLISION.bossRadiusMul, // hit radius at final scale
        clips,
    };
}

// --- Spawning ----------------------------------------------------------------

// Spawns the boss with `hp` HP (250 in wave 3, 400 in wave 5 — Waves applies the endless growth
// multiplier before calling and this rounds the result UP so health stays whole). `speedMul` and
// `orbSpeedMul` come from the wave definition (round 5: wave 5 runs 10% faster in movement and
// orb speed than wave 3). Picks a random free one of the 8 spawn points; returns the boss, or
// null when every spawn point is occupied (Waves retries on a later frame).
export function spawnBoss(hp, speedMul = BOSS.speedMul, orbSpeedMul = 1) {
    if (!prepared || !sceneRef || boss) return null;

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
        intensity: material.emissiveIntensity !== undefined ? material.emissiveIntensity : null,
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
    data.isBoss = true; // Enemy.updateEnemies and getAliveCount() honor this flag
    data.maxHp = Math.ceil(hp); // integer health even after wave-5 growth multipliers
    data.hp = data.maxHp;
    data.speedMul = speedMul;       // per-wave chase speed (read in the chaseA/chaseB branch)
    data.orbSpeedMul = orbSpeedMul; // per-wave orb speed (passed to spawnBossOrb in the volley)
    data.collider = registerCollider(group, group.position, prepared.radius);
    data.dying = false;
    data.dyingTimer = 0;
    data.flashTimer = 0;
    data.flashOriginals = flashOriginals;
    data.mixer = mixer;
    data.actions = actions;
    data.currentAction = actions.move || actions.idle;
    data.oneShotRemaining = 0;
    data.touchingPlayer = false; // contact damage is applied in updateBoss, not by Combat
    data.velocity = { x: 0, y: 0 };
    // Phase cycle state: starts chasing, per the GDD's "Phase A: pauses 1.5 s, then fires".
    data.state = 'chaseA';
    data.stateTimer = BOSS.phaseAChase;
    data.dashDirection = { x: 0, y: 0 };
    data.dashHit = false;
    data.tintedRed = false;

    boss = group;
    addToEnemyList(group); // targeting + projectile hit detection see the boss
    playSfx('boss_spawn'); // GDD 8C: plays when any boss appears
    return group;
}

// Random free spawn point among the SPAWN_POINTS (GDD 4B: bosses use the same 8 points).
function pickSpawnPoint() {
    const candidates = SPAWN_POINTS.map((point) => point);
    // Fisher-Yates shuffle: try spawn points in random order, take the first free one.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const point of candidates) {
        if (isSpotFree(point.x, point.y, prepared.radius)) return point;
    }
    return null;
}

// --- Damage / knockback / death ----------------------------------------------

// Applies damage to the boss. Returns true when this damage killed it. Options mirror
// damageEnemy's: { knockback, knockbackX, knockbackY } (the parry shockwave knocks it back).
export function damageBoss(amount, options = {}) {
    if (!boss || boss.userData.dying) return false;

    const data = boss.userData;
    data.hp -= amount;
    flashBoss();
    playSfx('hit');

    if (options.knockback > 0) {
        knockbackBoss(options.knockbackX || 0, options.knockbackY || 0, options.knockback);
    }

    if (data.hp <= 0) {
        killBoss();
        return true;
    }
    playOneShot(boss, data.actions.hit);
    return false;
}

// Pushes the boss away, collision-checked step by step (the parry shockwave uses this — GDD 4A:
// "The Boss only gets knockback").
export function knockbackBoss(dirX, dirY, distance) {
    if (!boss || boss.userData.dying) return;
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
        if (!isMoveFree(collider, nx, ny)) break;
        boss.position.x = nx;
        boss.position.y = ny;
        remaining -= step;
    }
}

// The kill moment: Death clip, score, the guaranteed 1-2 heart drops (GDD 4B), then a lingering
// corpse removed in updateBoss().
function killBoss() {
    const data = boss.userData;
    data.dying = true;
    data.touchingPlayer = false;
    data.velocity.x = 0;
    data.velocity.y = 0;
    unregisterCollider(boss); // probes, bullets and spawn checks all stop seeing the corpse
    data.collider = null;     // Projectile.js reads this reference directly

    const deathAction = data.actions.death;
    if (deathAction) {
        cancelOneShot(boss);
        deathAction.reset();
        deathAction.setEffectiveWeight(1);
        deathAction.play();
        data.currentAction = deathAction;
        data.dyingTimer = Math.min(Math.max(deathAction.getClip().duration, 2.0), 3.0);
    } else {
        data.dyingTimer = 2.5;
    }

    addScore(BOSS_TYPE.score); // 1,000 points (GDD 6C)

    // 100% chance to drop 1-2 hearts, scattered slightly around the body (GDD 4B).
    const drops = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < drops; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.6 + Math.random() * 1.2;
        spawnHeart(
            boss.position.x + Math.cos(angle) * radius,
            boss.position.y + Math.sin(angle) * radius,
        );
    }
}

// --- Per-frame AI --------------------------------------------------------------

// Advances the boss by one frame (movement, phase cycle, contact push, animations). Called from
// Combat.update() only while WAVE_PLAYING. No-op without a live boss.
export function updateBoss(delta) {
    if (!boss) return;
    const data = boss.userData;
    const collider = data.collider;

    data.mixer.update(delta);

    // Hit-flash restoration.
    if (data.flashTimer > 0) {
        data.flashTimer -= delta;
        if (data.flashTimer <= 0) restoreBossMaterials();
    }

    // Death: play out the corpse, then remove it.
    if (data.dying) {
        data.dyingTimer -= delta;
        if (data.dyingTimer <= 0) removeBoss();
        return;
    }

    // One-shot clips blend back into the looping move/idle action when they finish.
    if (data.oneShotRemaining > 0) {
        data.oneShotRemaining -= delta;
        if (data.oneShotRemaining <= 0) resumeLoopAction();
    }

    const toPlayerX = player.position.x - boss.position.x;
    const toPlayerY = player.position.y - boss.position.y;
    const playerDistance = Math.max(Math.hypot(toPlayerX, toPlayerY), 1e-6);
    const dirToPlayerX = toPlayerX / playerDistance;
    const dirToPlayerY = toPlayerY / playerDistance;

    data.stateTimer -= delta;
    const startX = boss.position.x;
    const startY = boss.position.y;
    let moving = false;

    if (data.state === 'chaseA' || data.state === 'chaseB') {
        // Chase: walk toward the player, slowed 25% inside a Dasher trail (GDD 4A). The per-wave
        // speed multiplier rides in data.speedMul (round 5: wave 5 is 10% faster than wave 3).
        const trailFactor = getTrailSpeedFactor(boss.position.x, boss.position.y, ABILITY.trailSlowBoss);
        const speed = ENEMY.baseSpeed * data.speedMul * endlessSpeedMul * trailFactor;
        moveBoss(collider, dirToPlayerX, dirToPlayerY, speed, delta);
        faceBoss(dirToPlayerX, dirToPlayerY);
        moving = true;

        if (data.stateTimer <= 0) {
            if (data.state === 'chaseA') {
                // Phase A: pause, then the orb volley (the 1.5 s charge is driven by stateTimer).
                data.state = 'chargeA';
                data.stateTimer = BOSS.chargeTime;
                playLoopAction(data.actions.idle);
            } else {
                // Phase B: telegraph the dash.
                data.state = 'telegraph';
                data.stateTimer = BOSS.dashTelegraph;
                playOneShot(boss, data.actions.attack);
                tintRed();
            }
        }
    } else if (data.state === 'chargeA') {
        // Standing still, charging the volley: face the player so the circle looks deliberate.
        faceBoss(dirToPlayerX, dirToPlayerY);
        if (data.stateTimer <= 0) {
            // The volley starts a one-shot (Bite_Front); its timer blends back to the walk loop
            // by itself, so no resumeLoopAction() here — that would cut the bite short.
            fireOrbVolley();
            data.state = 'chaseB';
            data.stateTimer = BOSS.phaseBChase;
        }
    } else if (data.state === 'telegraph') {
        // Red and stationary, tracking the player until the dash locks in.
        faceBoss(dirToPlayerX, dirToPlayerY);
        if (data.stateTimer <= 0) {
            data.state = 'dash';
            data.stateTimer = BOSS.dashDuration;
            data.dashDirection.x = dirToPlayerX;
            data.dashDirection.y = dirToPlayerY;
            data.dashHit = false;
            restoreBossMaterials(); // red tint off; the dash itself is the dangerous part
        }
    } else if (data.state === 'dash') {
        // Fast straight dash. Ends on a wall hit or after dashDuration seconds.
        const speed = BOSS.dashSpeed * endlessSpeedMul;
        const travelled = moveBoss(
            collider, data.dashDirection.x, data.dashDirection.y, speed, delta,
        );
        moving = true;
        faceBoss(data.dashDirection.x, data.dashDirection.y);

        // Dash contact: 2 physical damage, once per dash. During the player's i-frames the dash
        // ghosts through instead (GDD 3C). Tested against the player's VISUAL centre, so a dash
        // that visibly clips the leaning frog registers (round 6).
        const playerCollider = getCollider(player);
        const playerCenter = getHitCenter();
        if (!data.dashHit && playerCollider && collider &&
            circlesTouch(
                boss.position.x, boss.position.y, collider.radius,
                playerCenter.x, playerCenter.y, playerCollider.radius,
            )) {
            if (!isInvulnerable()) {
                data.dashHit = true;
                damagePlayer(BOSS.dashDamage, 'physical');
                data.state = 'chaseA'; // the impact ends the dash early
                data.stateTimer = BOSS.phaseAChase;
            }
        }

        const blocked = travelled <= 1e-6;
        if (data.stateTimer <= 0 || blocked) {
            if (data.state === 'dash') { // not already ended by the hit above
                data.state = 'chaseA';
                data.stateTimer = BOSS.phaseAChase;
            }
        }
    }

    // Body contact: pushes the player away (GDD 3C) and hurts for contactDamage (round 5: the
    // push alone felt toothless — the boss is a walking hazard). The push helper returns whether
    // it actually touched; i-frames are honored inside it (no push and no damage while ghosting),
    // and it is skipped entirely while dashing (the dash has its own 2-damage hit response).
    if (data.state !== 'dash' && collider) {
        if (pushPlayerOut(collider)) {
            damagePlayer(BOSS.contactDamage, 'physical');
        }
    }

    // Velocity for aiming lead (minions/auto-shooter aim at the boss like at any target).
    data.velocity.x = (boss.position.x - startX) / Math.max(delta, 1e-6);
    data.velocity.y = (boss.position.y - startY) / Math.max(delta, 1e-6);

    // Idle pose when completely still and not mid-animation (chargeA uses the idle loop).
    if (!moving && data.state === 'chargeA' && data.oneShotRemaining <= 0
        && data.currentAction !== data.actions.idle) {
        playLoopAction(data.actions.idle);
    }
}

// Moves the boss along (dirX, dirY) at `speed`, sub-stepped with the usual slide (so the boss
// cannot tunnel through a house corner). Returns the distance actually travelled this frame.
// TODO: no escape detour for the boss — its size makes it rarely wedge (it shoves along walls);
//   add the Enemy.js waypoint system only if playtesting shows it stuck behind the central hut.
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
        if (isMoveFree(collider, nx, ny)) {
            boss.position.x = nx;
            boss.position.y = ny;
            continue;
        }
        if (isMoveFree(collider, nx, boss.position.y)) {
            boss.position.x = nx;
            continue;
        }
        if (isMoveFree(collider, boss.position.x, ny)) {
            boss.position.y = ny;
            continue;
        }
        break; // fully blocked: the caller sees the shrunken travel distance
    }

    return Math.hypot(boss.position.x - startX, boss.position.y - startY);
}

// Turns the model toward (dirX, dirY) with the config's yaw offset.
function faceBoss(dirX, dirY) {
    const model = boss.children[0];
    if (model && (dirX !== 0 || dirY !== 0)) {
        model.rotation.y = Math.atan2(dirY, dirX) + BOSS_TYPE.yawOffset;
    }
}

// Shoves the player out of the boss's body: a short push directly away from the boss centre,
// cancelled by anything solid behind the player ("unless their back is against an obstacle",
// GDD 3C) — isMoveFree stops at walls, and the push is skipped entirely during i-frames.
// Returns true when the bodies were actually overlapping (round 5: the caller applies the
// contact damage on that signal); false when there was no contact or the player is invulnerable.
// Round 6: the overlap is measured to the player's VISUAL centre (the lean shifts his body),
// while the push itself still moves the feet position.
function pushPlayerOut(bossCollider) {
    if (isInvulnerable()) return false; // ghosting
    const playerCollider = getCollider(player);
    if (!playerCollider) return false;

    const playerCenter = getHitCenter();
    const dx = playerCenter.x - boss.position.x;
    const dy = playerCenter.y - boss.position.y;
    const distance = Math.hypot(dx, dy);
    const reach = playerCollider.radius + bossCollider.radius;

    if (distance >= reach) return false; // not touching

    const ux = distance > 1e-6 ? dx / distance : 1;
    const uy = distance > 1e-6 ? dy / distance : 0;
    let remaining = reach - distance + 0.05; // push just past the overlap
    while (remaining > 0) {
        const step = Math.min(PUSH_STEP, remaining);
        const nx = player.position.x + ux * step;
        const ny = player.position.y + uy * step;
        if (!isMoveFree(playerCollider, nx, ny)) break; // obstacle behind: the push stops
        player.position.x = nx;
        player.position.y = ny;
        remaining -= step;
    }
    return true;
}

// Fires the orb circle (GDD 4B: "fires 8 orbs in a 360-degree circle"; round 5 tripled it to
// 24, so the ring is tighter and dodging needs real movement). The Bite_Front clip plays as the
// one-shot; the attack (Jump) clip is only the fallback when the volley clip is missing. The
// one-shot timer resumes the walk loop by itself once the clip ends. The boss object is passed
// as each orb's sender so parries can reflect orbs back into it.
function fireOrbVolley() {
    if (!boss) return;
    playOneShot(boss, boss.userData.actions.volley || boss.userData.actions.attack);
    for (let i = 0; i < BOSS.orbCount; i++) {
        const angle = (i / BOSS.orbCount) * Math.PI * 2;
        spawnBossOrb(
            boss.position.x,
            boss.position.y,
            Math.cos(angle),
            Math.sin(angle),
            boss.userData.orbSpeedMul,
            boss,
        );
    }
}

// --- Animation helpers (mirrors Enemy.js) ---------------------------------------

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

// Switches to a looping action (move/idle) without a one-shot timer.
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

// Returns to the loop clip the current state calls for (move while chasing, idle otherwise).
function resumeLoopAction() {
    if (!boss) return;
    const data = boss.userData;
    const target = data.state === 'chaseA' || data.state === 'chaseB' || data.state === 'dash'
        ? data.actions.move
        : data.actions.idle;
    if (target && data.currentAction !== target) playLoopAction(target);
}

// Stops the running one-shot timer (used when death interrupts a hit/attack clip).
function cancelOneShot(entity) {
    entity.userData.oneShotRemaining = 0;
}

// --- Material tints ---------------------------------------------------------------

// Paints the boss red for the dash telegraph.
function tintRed() {
    const data = boss.userData;
    data.tintedRed = true;
    for (const entry of data.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.setHex(CHARGE_RED);
        if (entry.intensity !== null) entry.material.emissiveIntensity = 0.9;
    }
}

// White hit flash.
function flashBoss() {
    const data = boss.userData;
    data.flashTimer = ENEMY.hitFlashDuration;
    for (const entry of data.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.setHex(0xffffff);
        if (entry.intensity !== null) entry.material.emissiveIntensity = 1;
    }
}

// Restores every material's original emissive (ends both the hit flash and the red tint).
function restoreBossMaterials() {
    if (!boss) return;
    boss.userData.tintedRed = false;
    for (const entry of boss.userData.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.copy(entry.emissive);
        if (entry.intensity !== null) entry.material.emissiveIntensity = entry.intensity;
    }
}

// --- Queries / removal / reset -------------------------------------------------------

// True while a boss exists and is not dying (Waves uses this to end wave 3, drive the wave-5
// respawn counter and report the music stage).
export function isBossAlive() {
    return !!boss && !boss.userData.dying;
}

// The live boss group, or null (targeting helpers / HUD).
export function getBoss() {
    return boss;
}

// HUD data for the boss health bar: { hp, maxHp } or null without a live boss. Dying bosses
// report null so the bar disappears the moment the kill lands.
export function getBossInfo() {
    if (!boss || boss.userData.dying) return null;
    return { hp: boss.userData.hp, maxHp: boss.userData.maxHp };
}

// Wave-5 endless growth hook (speed applies live to the dashing/walking speeds).
export function setBossEndlessScaling(speedMul) {
    endlessSpeedMul = speedMul;
}

// Detaches the boss (kill-complete, or a fresh run through resetBoss).
function removeBoss() {
    if (!boss) return;
    removeFromEnemyList(boss);
    unregisterCollider(boss);
    if (boss.parent) boss.parent.remove(boss);
    boss = null;
}

// Wipes the boss for a new run (Run.resetWorld calls this before resetEnemies()).
export function resetBoss() {
    removeBoss();
    endlessSpeedMul = 1;
}
