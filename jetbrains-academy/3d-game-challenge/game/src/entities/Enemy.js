import * as THREE from 'three';
import {
    cloneMaterials,
    cloneModel,
    enableShadows,
    loadGLTF,
    normalizeModel,
} from '../core/Assets.js';
import {
    getCollider,
    isMoveFree,
    isSpotFree,
    MAX_MOVE_SUB_STEP,
    registerCollider,
    unregisterCollider,
    wouldOverlap,
} from '../core/Collision.js';
import { ABILITY, ENEMY } from '../config/tuning.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import player, { getStats } from './Player.js';
import { getTrailSpeedFactor } from './Trail.js';
import { spawnHeart } from './Pickup.js';
import { spawnEnemyShot } from './Projectile.js';
import { playSfx } from '../systems/Audio.js';
import { addScore } from '../systems/Score.js';

// Enemy component (GDD 4B): loads the four common enemy models, lets Waves spawn them at the
// arena's 8 spawn points, and runs their per-frame AI. Each enemy is a Group carrying the ground
// position; the model child carries facing. Every behavior (chase / ranged / speeder / tank)
// shares one movement routine: collision-checked sub-steps that slide along houses and walls,
// plus the escape-detour system ported from the previous codebase (stuck clock, body-width
// line-of-sight probe, lateral waypoint) so nothing stays wedged behind a house forever.
//
// Damage/score/drop bookkeeping lives here too (damageEnemy), because the enemy owns its HP and
// the kill moment — Combat only reports what the projectiles hit.

// --- Steering tuning ---------------------------------------------------------
// Ported from the old 650-unit arena and divided by ~10 for this 60x40 one (their comment:
// values selected so a wedged enemy is visible as a bug for well under a second).
const STUCK_ESCAPE_SECONDS = 0.5;    // zero-progress seconds before the detour kicks in
const ESCAPE_WAYPOINT_DISTANCE = 5;  // lateral offset of the detour waypoint, world units
const ESCAPE_WAYPOINT_REACHED = 0.9; // arrival radius at the waypoint
const ESCAPE_PROBE_SPACING = 1.5;    // line-of-sight sample spacing (body-width probe)
const STUCK_EPSILON = 0.01;          // frame displacement below which nothing moved

// Knockback nudge step (same idea as the player's dash: small steps, stop at the wall).
const KNOCKBACK_STEP = 0.15;

// How long a cone of the attack clip re-triggers while an enemy is touching the player.
const CONTACT_ANIM_INTERVAL = 0.6;

// Seconds to fade between a one-shot clip and the looping move clip.
const ANIM_FADE = 0.15;

// --- Module state ------------------------------------------------------------

// Live enemies (Groups). Read by Projectile (hit detection), Minion (targeting) and Combat
// (contact + damage). Never mutate directly — use removeEnemy().
const enemies = [];

let sceneRef = null;
let ready = false;

// Per-type prepared data: { template, scale, groundOffset, radius, clips: {move, attack, hit,
// death} } — clips hold AnimationClip references (or null when the model lacks that clip).
const prepared = {};

// Wave-5 endless growth (GDD 6B), set by Waves: HP multiplier applies to new spawns, speed
// multiplier applies live to every enemy (existing ones speed up as the wave grows).
let endlessHpMul = 1;
let endlessSpeedMul = 1;

// --- Loading -----------------------------------------------------------------

// Loads and prepares all four enemy types. Awaited by main.js before the game starts.
export async function initEnemies(scene) {
    sceneRef = scene;

    const entries = Object.values(ENEMY_TYPES);
    const gltfs = await Promise.all(entries.map((type) => loadGLTF(type.model)));

    entries.forEach((type, index) => {
        const gltf = gltfs[index];
        const template = gltf.scene;
        enableShadows(template);

        // Measure on a throwaway clone: normalizeModel() scales it to the type's target height
        // and reports the collision radius and ground offset every future clone must reproduce.
        const probe = cloneModel(template);
        const shape = normalizeModel(probe, { targetHeight: type.targetHeight });

        // Resolve the GDD's clip names against what the file actually ships. findClip tolerates
        // case and slight renames; a missing clip degrades to no animation for that action, and
        // the warning below lists the real names for easy fixing.
        const clips = {
            move: findClip(gltf.animations, type.moveClip),
            attack: findClip(gltf.animations, type.attackClip),
            hit: findClip(gltf.animations, type.hitClip),
            death: findClip(gltf.animations, type.deathClip),
        };
        const missing = Object.entries(clips).filter(([, clip]) => !clip).map(([key]) => key);
        if (missing.length > 0) {
            console.warn(
                `Enemy "${type.id}": no clip for [${missing.join(', ')}].`,
                'Available:', gltf.animations.map((clip) => clip.name),
            );
        }

        prepared[type.id] = {
            template,
            scale: shape.scale,             // scale normalizeModel() derived for the target height
            groundOffset: shape.groundOffset, // z-lift so the lowest vertex rests on the floor
            radius: shape.radius,           // collision radius at final scale
            clips,
        };
    });

    ready = true;
}

// Finds a clip by exact name first, then case-insensitively, then by loose substring match —
// the GDD's names ("HitRecieve" is even misspelled in the model) rarely match byte-for-byte.
function findClip(animations, name) {
    if (!name || animations.length === 0) return null;
    const exact = animations.find((clip) => clip.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    const caseInsensitive = animations.find((clip) => clip.name.toLowerCase() === lower);
    if (caseInsensitive) return caseInsensitive;
    return animations.find((clip) => {
        const clipName = clip.name.toLowerCase();
        return clipName.includes(lower) || lower.includes(clipName);
    }) || null;
}

// The collision radius one type will spawn with (Waves uses it to test spawn points).
export function getEnemyRadius(typeId) {
    return prepared[typeId] ? prepared[typeId].radius : 1;
}

// --- Spawning ------------------------------------------------------------------

// Waves' endless-growth hook (GDD 6B): HP multiplier for future spawns, speed multiplier for
// everyone including enemies already on the field. Called every frame in wave 5.
export function setEndlessScaling(hpMul, speedMul) {
    endlessHpMul = hpMul;
    endlessSpeedMul = speedMul;
}

// Spawns one enemy of `typeId` at `position` (a ground point). Returns the enemy or null when it
// cannot be placed (type unknown, not loaded yet, or the spot is occupied — Waves retries later).
export function spawnEnemy(typeId, position) {
    if (!ready || !sceneRef) return null;
    const type = ENEMY_TYPES[typeId];
    const typePrepared = prepared[typeId];
    if (!type || !typePrepared) return null;

    if (!isSpotFree(position.x, position.y, typePrepared.radius)) return null;

    // Build the model at exactly the transform the probe was measured with (see initEnemies).
    const model = cloneModel(typePrepared.template);
    model.rotation.x = Math.PI / 2; // lay the Y-up model onto the Z-up ground
    model.scale.setScalar(typePrepared.scale);
    model.position.z += typePrepared.groundOffset;

    // Per-instance materials so the white hit flash never bleeds into siblings; remember each
    // material's original emissive so the flash can be undone exactly.
    const materials = cloneMaterials(model);
    const flashOriginals = materials.map((material) => ({
        material,
        emissive: material.emissive ? material.emissive.clone() : null,
        intensity: material.emissiveIntensity !== undefined ? material.emissiveIntensity : null,
    }));

    const group = new THREE.Group();
    group.position.set(position.x, position.y, 0); // ground position; the model child floats
    group.add(model);
    sceneRef.add(group);

    // Animation: one mixer per clone; the move clip loops, the other three are one-shots played
    // by playOneShot(). A model missing a clip simply has fewer actions.
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
    data.maxHp = type.hp * endlessHpMul; // wave-5 growth bakes into the spawn (GDD 6B)
    data.hp = data.maxHp;
    data.collider = registerCollider(group, group.position, typePrepared.radius);
    data.touchingPlayer = false;
    data.stuckTimer = 0;
    data.escapeWaypoint = null;
    data.dying = false;
    data.dyingTimer = 0;
    data.stunTimer = 0;
    data.flashTimer = 0;
    data.flashOriginals = flashOriginals;
    data.mixer = mixer;
    data.actions = actions;
    data.currentAction = actions.move;
    data.oneShotRemaining = 0;
    data.contactAnimTimer = 0;
    data.velocity = { x: 0, y: 0 };
    data.travelClock = 0; // own per-enemy clock driving the Speeders' zig-zag phase
    // Tank behavior: its body stops shots dead (GDD 4B), read by Projectile.js.
    data.blocksShots = type.behavior === 'tank';
    // Ranged behavior: desynchronized first shot so a group does not fire in lockstep.
    data.fireTimer = Math.random() * ENEMY.rangedFireInterval;
    // Speeder behavior: phase clock for the dash-on/dash-off zig-zag.
    data.speederTimer = Math.random() * (ENEMY.speederDashOn + ENEMY.speederDashOff);

    enemies.push(group);
    return group;
}

// --- Damage, stun, knockback ---------------------------------------------------

// Applies damage to one enemy. Returns true when this damage killed it, false otherwise (also
// false for unknown/already-dying enemies, so callers can avoid double kill credit).
// Options: { knockback: distance, knockbackX, knockbackY } for the push direction.
export function damageEnemy(enemy, amount, options = {}) {
    if (!enemy || enemy.userData.dying) return false;

    enemy.userData.hp -= amount;
    flashEnemy(enemy);
    playSfx('hit'); // GDD 8C: sfx_hit is "enemy gets hit"

    if (options.knockback > 0) {
        knockbackEnemy(enemy, options.knockbackX || 0, options.knockbackY || 0, options.knockback);
    }

    if (enemy.userData.hp <= 0) {
        killEnemy(enemy);
        return true;
    }

    playOneShot(enemy, enemy.userData.actions.hit);
    return false;
}

// Pushes an enemy away, one collision-checked step at a time (never through a wall). Tanks
// ignore knockback entirely (GDD 4B: it is immune to being pushed).
export function knockbackEnemy(enemy, dirX, dirY, distance) {
    if (!enemy || enemy.userData.dying) return;
    if (enemy.userData.typeConfig.behavior === 'tank') return;
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
        if (!isMoveFree(collider, nx, ny)) break; // a wall absorbs the rest of the push
        enemy.position.x = nx;
        enemy.position.y = ny;
        remaining -= step;
    }
}

// Stuns an enemy for `duration` seconds (Parry shockwave, GDD 4A): it stops moving and firing
// but stays on the field and keeps animating its idle pose.
export function stunEnemy(enemy, duration) {
    if (!enemy || enemy.userData.dying) return;
    enemy.userData.stunTimer = Math.max(enemy.userData.stunTimer, duration);
}

// The kill moment: stop interacting with anything, start the Death clip, credit the score and
// roll the health drop. The corpse lingers for the clip (or ENEMY.deathLinger) before removal.
function killEnemy(enemy) {
    const data = enemy.userData;
    data.dying = true;
    data.touchingPlayer = false; // a dead body can never damage the player
    data.velocity.x = 0;
    data.velocity.y = 0;
    // Unregister the collider immediately: bullets, spawn checks and contact tests must all skip
    // a corpse (an unregistered dead enemy also cannot "kill from beyond the grave"). The
    // userData reference is nulled too, because Projectile.js checks it directly.
    unregisterCollider(enemy);
    data.collider = null;

    const deathAction = data.actions.death;
    if (deathAction) {
        deathAction.reset();
        deathAction.setEffectiveWeight(1);
        deathAction.play();
        data.currentAction = deathAction;
        const clipDuration = deathAction.getClip().duration;
        // Cap the corpse's stay so a long Death clip does not clog the field.
        data.dyingTimer = Math.min(Math.max(clipDuration, ENEMY.deathLinger), 1.8);
    } else {
        data.dyingTimer = ENEMY.deathLinger;
    }

    // GDD 6C: kills pay points (value per type from the config).
    addScore(data.typeConfig.score);

    // GDD 4B: drop chance from the player's stats (the Bloodthirst card raises it to 10%).
    if (Math.random() < getStats().dropChance) {
        spawnHeart(enemy.position.x, enemy.position.y);
    }
}

// --- Hit flash -----------------------------------------------------------------

// White flash after taking damage (GDD 3C). Uses the material's emissive channel so the model's
// diffuse texture/color stays intact underneath; materials without an emissive channel (rare
// here — all four models load as MeshStandardMaterial) simply skip the flash.
function flashEnemy(enemy) {
    const data = enemy.userData;
    data.flashTimer = ENEMY.hitFlashDuration;
    for (const entry of data.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.setHex(0xffffff);
        if (entry.intensity !== null) entry.material.emissiveIntensity = 1;
    }
}

// Restores every material's original emissive once the flash window has passed.
function restoreFlash(enemy) {
    for (const entry of enemy.userData.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.copy(entry.emissive);
        if (entry.intensity !== null) entry.material.emissiveIntensity = entry.intensity;
    }
}

// --- Animation helpers -----------------------------------------------------------

// Blends from the current action into a one-shot clip and schedules the return to the move loop
// (handled in updateEnemies via oneShotRemaining). No-op when the clip does not exist.
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

// --- Per-frame update --------------------------------------------------------------

// Advances every enemy by one frame. Called from Combat.update() only while WAVE_PLAYING.
export function updateEnemies(delta) {
    if (!ready) return;

    const playerCollider = getCollider(player);

    // Backwards iteration so dying enemies can be removed in place.
    for (let index = enemies.length - 1; index >= 0; index--) {
        const enemy = enemies[index];
        const data = enemy.userData;

        // The Boss lives in this array so that targeting (player auto-shooter, minions) and hit
        // detection see it, but it runs its own AI in Boss.js — skip it here entirely.
        if (data.isBoss) continue;

        const collider = data.collider;

        // --- Timers that run for every enemy, dead or alive ---
        data.mixer.update(delta);

        if (data.flashTimer > 0) {
            data.flashTimer -= delta;
            if (data.flashTimer <= 0) restoreFlash(enemy);
        }

        // Dying: the corpse just counts down to removal (its Death clip is playing).
        if (data.dying) {
            data.dyingTimer -= delta;
            if (data.dyingTimer <= 0) removeEnemy(enemy);
            continue;
        }

        // One-shot finished: blend back into the looping move clip.
        if (data.oneShotRemaining > 0) {
            data.oneShotRemaining -= delta;
            if (data.oneShotRemaining <= 0 && data.actions.move && data.currentAction !== data.actions.move) {
                const move = data.actions.move;
                move.reset();
                move.setEffectiveWeight(1);
                move.play();
                data.currentAction.crossFadeTo(move, ANIM_FADE, false);
                data.currentAction = move;
            }
        }

        // Stunned: no movement, no firing, no contact damage — only the idle animation.
        if (data.stunTimer > 0) {
            data.stunTimer -= delta;
            data.touchingPlayer = false;
            data.velocity.x = 0;
            data.velocity.y = 0;
            continue;
        }

        // --- Movement: pick this behavior's target direction ---
        const toPlayerX = player.position.x - enemy.position.x;
        const toPlayerY = player.position.y - enemy.position.y;
        const playerDistance = Math.hypot(toPlayerX, toPlayerY);
        const behavior = data.typeConfig.behavior;

        let dirX = 0;
        let dirY = 0;

        if (behavior === 'chase' || behavior === 'tank') {
            // Straight pursuit (the shared steering below handles obstacles).
            if (playerDistance > 1e-6) {
                dirX = toPlayerX / playerDistance;
                dirY = toPlayerY / playerDistance;
            }
        } else if (behavior === 'ranged') {
            // Hold the standoff ring: close in when too far, back off when too close, and strafe
            // sideways inside the band so shots stay dodgeable rather than point-blank.
            const inner = ENEMY.rangedStandoff - ENEMY.rangedBand;
            const outer = ENEMY.rangedStandoff + ENEMY.rangedBand;
            if (playerDistance > outer) {
                dirX = toPlayerX / playerDistance;
                dirY = toPlayerY / playerDistance;
            } else if (playerDistance < inner && playerDistance > 1e-6) {
                dirX = -toPlayerX / playerDistance;
                dirY = -toPlayerY / playerDistance;
            } else if (playerDistance > 1e-6) {
                // In the band: strafe perpendicular (a fixed side per enemy, so it orbits rather
                // than jitters left/right every frame).
                const side = data.orbitSide || (data.orbitSide = Math.random() < 0.5 ? 1 : -1);
                dirX = (-toPlayerY / playerDistance) * side * 0.5;
                dirY = (toPlayerX / playerDistance) * side * 0.5;
            }
        } else if (behavior === 'speeder') {
            // Alternate short dash bursts and rests; during a dash the heading zig-zags around
            // the line to the player, so the path reads as erratic (GDD 4B: "rapid, zig-zag").
            data.speederTimer -= delta;
            const cycle = ENEMY.speederDashOn + ENEMY.speederDashOff;
            if (data.speederTimer <= 0) data.speederTimer += cycle;
            const dashing = data.speederTimer > ENEMY.speederDashOff;
            if (dashing && playerDistance > 1e-6) {
                const zigzag = Math.sin(data.travelClock * ENEMY.speederZigzagHz * Math.PI * 2)
                    * (ENEMY.speederZigzagDeg * Math.PI) / 180;
                const baseAngle = Math.atan2(toPlayerY, toPlayerX) + zigzag;
                dirX = Math.cos(baseAngle);
                dirY = Math.sin(baseAngle);
            }
        }

        // --- Escape detour (shared by every moving behavior) ---
        // While following a detour waypoint, that waypoint replaces the behavior's direction.
        if (collider && data.escapeWaypoint) {
            const arrived =
                enemy.position.distanceTo(data.escapeWaypoint) <= ESCAPE_WAYPOINT_REACHED;
            if (arrived || hasLineOfSight(collider, enemy.position, player.position)) {
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

        // --- Move (collision-checked sub-steps + slide) ---
        const moving = dirX !== 0 || dirY !== 0;
        const startX = enemy.position.x;
        const startY = enemy.position.y;

        if (collider && moving) {
            // Effective speed: base x type x endless growth, slowed inside a Dasher trail.
            const trailFactor = getTrailSpeedFactor(
                enemy.position.x, enemy.position.y, ABILITY.trailSlowCommon,
            );
            const speed = ENEMY.baseSpeed * data.typeConfig.speedMul * endlessSpeedMul * trailFactor;

            const stepLength = speed * delta;
            const subSteps = Math.max(1, Math.ceil(stepLength / MAX_MOVE_SUB_STEP));
            const subX = (dirX * stepLength) / subSteps;
            const subY = (dirY * stepLength) / subSteps;

            for (let i = 0; i < subSteps; i++) {
                const nx = enemy.position.x + subX;
                const ny = enemy.position.y + subY;
                if (isMoveFree(collider, nx, ny)) {
                    enemy.position.x = nx;
                    enemy.position.y = ny;
                    continue;
                }
                // Direct step blocked: retry as its two axis halves (the slide). Both sub-steps
                // point toward the target, so a free half always makes lateral progress.
                if (isMoveFree(collider, nx, enemy.position.y)) {
                    enemy.position.x = nx;
                    continue;
                }
                if (isMoveFree(collider, enemy.position.x, ny)) {
                    enemy.position.y = ny;
                    continue;
                }
                break; // wedged: hold position; the stuck clock below notices
            }

            // Stuck clock: any real displacement resets it; a wedged frame grows it and the
            // escape state below eventually picks a lateral waypoint (see the old steering).
            const moved =
                Math.hypot(enemy.position.x - startX, enemy.position.y - startY) > STUCK_EPSILON;
            if (moved) {
                data.stuckTimer = 0;
            } else {
                data.stuckTimer += delta;
                updateEscapeState(collider, enemy);
            }
        }

        // Ground velocity this frame: recorded for aiming lead (player auto-shooter + minions).
        data.velocity.x = (enemy.position.x - startX) / Math.max(delta, 1e-6);
        data.velocity.y = (enemy.position.y - startY) / Math.max(delta, 1e-6);
        data.travelClock += delta;

        // --- Facing: always turns toward the intended direction, even when wedged ---
        const model = enemy.userData.model || (enemy.userData.model = enemy.children[0]);
        if (model && moving) {
            model.rotation.y = Math.atan2(dirY, dirX) + data.typeConfig.yawOffset;
        }

        // --- Contact with the player (polled by Combat for damage) ---
        data.touchingPlayer = !!collider && !!playerCollider &&
            wouldOverlap(collider, enemy.position.x, enemy.position.y, playerCollider);

        // The contact attack animation re-triggers while pushing into the hero.
        data.contactAnimTimer -= delta;
        if (data.touchingPlayer && data.contactAnimTimer <= 0 && data.actions.attack) {
            data.contactAnimTimer = CONTACT_ANIM_INTERVAL;
            playOneShot(enemy, data.actions.attack);
        }

        // --- Ranged behavior: fire at the player (GDD 4B) ---
        if (behavior === 'ranged') {
            data.fireTimer -= delta;
            if (data.fireTimer <= 0) {
                data.fireTimer = ENEMY.rangedFireInterval;
                const inRange = playerDistance <= ENEMY.rangedStandoff * 1.6;
                if (inRange && collider && hasLineOfSight(collider, enemy.position, player.position)) {
                    const length = Math.max(playerDistance, 1e-6);
                    spawnEnemyShot(enemy.position.x, enemy.position.y, toPlayerX / length, toPlayerY / length);
                    // A short attack animation plays with the shot (same clip as contact attack).
                    if (data.currentAction !== data.actions.attack) {
                        playOneShot(enemy, data.actions.attack);
                    }
                }
            }
        }
    }
}

// --- Detour helpers (ported from the old steering) --------------------------------

// True when a straight line from `from` to `to` stays clear for the enemy's own circle: the line
// is sampled every ESCAPE_PROBE_SPACING units and every sample must pass isMoveFree, so the
// probe can never approve a gap the enemy does not fit through. Characters are not obstacles
// (isMoveFree ignores them), which is correct — they pass through each other.
function hasLineOfSight(collider, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / ESCAPE_PROBE_SPACING));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (!isMoveFree(collider, from.x + dx * t, from.y + dy * t)) return false;
    }
    return true;
}

// Picks a sideways waypoint for a wedged enemy: the two points ESCAPE_WAYPOINT_DISTANCE left and
// right of it along the line to the player, keeping only the ones that are fully free. `avoid`
// marks the side the enemy is already wedged against (compared by half-plane); with both sides
// free it flips there. Otherwise the side is random, so several enemies at one spot fan out.
function pickEscapeWaypoint(collider, enemy, avoid) {
    const toPlayerX = player.position.x - enemy.position.x;
    const toPlayerY = player.position.y - enemy.position.y;
    const length = Math.hypot(toPlayerX, toPlayerY);
    if (length < 1e-6) return null; // standing on the player — nothing to detour around

    const sideX = (-toPlayerY / length) * ESCAPE_WAYPOINT_DISTANCE;
    const sideY = (toPlayerX / length) * ESCAPE_WAYPOINT_DISTANCE;
    const left = new THREE.Vector3(enemy.position.x + sideX, enemy.position.y + sideY, 0);
    const right = new THREE.Vector3(enemy.position.x - sideX, enemy.position.y - sideY, 0);

    const free = [];
    if (isMoveFree(collider, left.x, left.y)) free.push(left);
    if (isMoveFree(collider, right.x, right.y)) free.push(right);
    if (free.length === 0) return null;
    if (free.length === 1) return free[0];

    if (avoid) {
        const onLeft = (avoid.x - enemy.position.x) * sideX + (avoid.y - enemy.position.y) * sideY > 0;
        return onLeft ? right : left;
    }
    return Math.random() < 0.5 ? left : right;
}

// Decides what a zero-progress frame means. After STUCK_ESCAPE_SECONDS the enemy abandons the
// direct line for a lateral waypoint; while detouring it flips sides after twice that window if
// the corridor is blocked too. The clock is set (not left alone) so the next decision lands a
// full window later, and a failed pick retries later instead of re-rolling every frame.
function updateEscapeState(collider, enemy) {
    const data = enemy.userData;

    if (data.escapeWaypoint) {
        if (data.stuckTimer < STUCK_ESCAPE_SECONDS * 2) return;
        data.escapeWaypoint = pickEscapeWaypoint(collider, enemy, data.escapeWaypoint) ??
            data.escapeWaypoint; // both sides unusable: keep the old waypoint, it beats the wall
        data.stuckTimer = STUCK_ESCAPE_SECONDS;
        return;
    }

    if (data.stuckTimer < STUCK_ESCAPE_SECONDS) return;
    data.escapeWaypoint = pickEscapeWaypoint(collider, enemy, null);
    data.stuckTimer = data.escapeWaypoint ? STUCK_ESCAPE_SECONDS : 0;
}

// --- Queries / removal / reset -----------------------------------------------------

// The live enemy array. Read-only for callers; use damageEnemy/removeEnemy so colliders and
// scene nodes stay in sync. Returned by reference so per-frame loops do not allocate.
export function getEnemies() {
    return enemies;
}

// How many enemies are alive (excluding corpses playing their Death clip, and excluding the
// Boss — the 35-enemy cap counts common enemies only). Waves uses this against ENEMY.maxAlive.
export function getAliveCount() {
    let count = 0;
    for (const enemy of enemies) {
        if (!enemy.userData.dying && !enemy.userData.isBoss) count++;
    }
    return count;
}

// Adds an externally-managed enemy (the Boss) to the shared list so targeting systems see it.
// The caller keeps ownership of its collider and AI; this only maintains the array.
export function addToEnemyList(enemy) {
    if (!enemies.includes(enemy)) enemies.push(enemy);
}

// Removes an externally-managed enemy from the shared list (its owner handles collider/scene).
export function removeFromEnemyList(enemy) {
    const index = enemies.indexOf(enemy);
    if (index !== -1) enemies.splice(index, 1);
}

// Removes one enemy: drops it from the array, unregisters its collider and detaches its node.
// Returns true when it removed something (callers use that to avoid double kill credit).
export function removeEnemy(enemy) {
    const index = enemies.indexOf(enemy);
    if (index === -1) return false;

    enemies.splice(index, 1);
    unregisterCollider(enemy);

    // No dispose(): every clone shares geometry and materials with the loaded template, so
    // disposing here would break the template and every surviving sibling.
    if (enemy.parent) enemy.parent.remove(enemy);
    return true;
}

// Wipes the field for a new run (Run.resetWorld). Removal goes through the same bookkeeping as
// a kill, so colliders unregister and nodes detach correctly.
export function resetEnemies() {
    for (const enemy of enemies.slice()) removeEnemy(enemy);
    endlessHpMul = 1;
    endlessSpeedMul = 1;
}
