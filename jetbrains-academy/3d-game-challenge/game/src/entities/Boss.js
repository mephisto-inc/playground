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
import { BOSS, COLLISION, ENEMY, SPAWN_POINTS, TRAIL } from '../config/tuning.js';
import { BOSS_TYPE } from '../config/enemies.js';
import player, { applyPlayerSlow, damagePlayer, getHitCenter, getStats, isInvulnerable } from './Player.js';
import { addToEnemyList, getAliveCount, getDoomHpMul, getDoomMul, isOutsideArena, removeFromEnemyList, spawnEnemy } from './Enemy.js';
import { isInsideTrail } from './Trail.js';
import { spawnHeart, spawnPowerupDrop } from './Pickup.js';
import { spawnBossOrb } from './Projectile.js';
import { playSfxAt } from '../systems/Audio.js';
import { addScore } from '../systems/Score.js';
import { recordKill } from '../systems/Achievements.js';

// Boss component: the Arena Lord (Pigeon). One instance at most. Spawns at a random one of the
// 8 spawn points, chasing the player through short chase phases separated by a RANDOM attack
// picked from BOSS.attacks (never the same twice in a row, so the pattern cannot be memorized):
//
//   chaseA/chaseB — walks at the player for the phase's breather;
//   volley  — charge pause, then BOSS.orbCount orbs in a 360-degree circle;
//   shockwave — instant forward wave that slows the player (the surprise move, no damage);
//   spiral  — rotating two-arm stream of orbs for BOSS.spiralDuration seconds;
//   summon  — calls common enemies to its side;
//   dash    — red telegraph, then a fast charge dealing BOSS.dashDamage.
//
// The wave-5 boss (bossHpRage) shortens the chase breathers as its HP drops, down to none at
// BOSS.hpRageFloor (10%) HP.
//
// The boss lives in Enemy.js's shared enemy list (addToEnemyList) so player shots, minions and
// hit detection all see it, but it runs its own AI here — Enemy.updateEnemies skips it. Body
// contact pushes the player away and deals BOSS.contactDamage; the bigger hits come from orbs
// and the dash.

// Animation one-shot fades — same values/pattern as Enemy.js (the two modules stay independent
// because their state machines differ; the shared logic is a dozen lines, duplication is fine).
const ANIM_FADE = 0.15;

// Red charge tint for the dash telegraph ("red charging dash").
const CHARGE_RED = 0xcc1f1f;

// Push step when shoving the player out of the boss's hitbox (same idea as knockback steps).
const PUSH_STEP = 0.15;

// Forward shockwave (the 'shockwave' attack): same violet as the boss orbs. WAVE_INNER is the
// band's inner-radius fraction of the front — the visual mesh and the hit test share it.
const WAVE_COLOR = 0xc46bff;
const WAVE_INNER = 0.9;

let sceneRef = null;
let prepared = null; // { template, scale, groundOffset, radius, clips }
let boss = null;     // the live boss group, or null
let endlessSpeedMul = 1;
let endlessAttackMul = 1; // wave-5 escalation: scales orb speed and phase pacing (1 outside)

// The forward wave effect: one reusable arc mesh (created lazily on the first cast) plus its
// live state. `hit` makes the slow apply once per cast, however long the player stays inside.
const wave = {
    mesh: null,
    active: false,
    originX: 0,
    originY: 0,
    dirAngle: 0, // cast direction, locked when the wave spawns
    radius: 0,   // current front radius
    maxRadius: 0,
    speed: 0,    // expansion speed, world units per second
    hit: false,
};

// The near-black silhouette color (single shared instance; materials lerp toward it).
const SILHOUETTE_COLOR = new THREE.Color(ENEMY.silhouetteColor);

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

// Spawns the boss with `hp` HP (the wave's boss HP; Waves applies the endless growth multiplier
// before calling, and this rounds the result UP so health stays whole). `speedMul` and
// `orbSpeedMul` come from the wave definition; `knockbackImmune` marks the wave-5 boss, which
// ignores the push shockwave's shove (the push still damages it); `hpRage` (wave 5 only) makes
// the chase breathers between attacks shrink with the boss's HP. Picks a random free one of the
// 8 spawn points; returns the boss, or null when every spawn point is occupied (Waves retries on
// a later frame).
export function spawnBoss(hp, speedMul = BOSS.speedMul, orbSpeedMul = 1, knockbackImmune = false, hpRage = false) {
    if (!prepared || !sceneRef || boss) return null;
    hideBossWave(); // no stale wave from a previous boss

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
        color: material.color ? material.color.clone() : null, // for the outside silhouette blend
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
    data.maxHp = Math.ceil(hp * getDoomHpMul()); // doom HP tripling compounds; integer health
    data.hp = data.maxHp;
    data.speedMul = speedMul;       // per-wave chase speed (read in the chaseA/chaseB branch)
    data.orbSpeedMul = orbSpeedMul; // per-wave orb speed (passed to spawnBossOrb in the volley)
    data.knockbackImmune = knockbackImmune; // wave-5 boss: never shoved (Combat skips the shove)
    data.hpRage = hpRage; // wave-5 boss: chase breathers shrink as its HP drops
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
    // Phase cycle state: starts chasing; the charge pause between chases comes first.
    data.state = 'chaseA';
    data.stateTimer = BOSS.phaseAChase;
    data.lastAttack = null;    // last attack chosen (the random pick never repeats it)
    data.nextChase = 'chaseB'; // chase the current attack hands control back to
    data.spiralAngle = 0;      // spiral storm: current firing angle
    data.spiralTimer = 0;      // spiral storm: seconds until the next burst
    data.dashDirection = { x: 0, y: 0 };
    data.dashHit = false;
    // Silhouette blend while outside the arena (see Enemy.updateSilhouette's twin below).
    data.silhouette = 0;
    data.silhouetteDirty = false;
    // Dasher-trail damage tick clock (staggered like the common enemies').
    data.trailTickTimer = Math.random() * TRAIL.tickInterval;
    data.trailTinted = false; // whether the cyan trail tint is currently applied
    // Kill attribution: which system last damaged the boss ('shot', 'reflect', ...).
    data.lastHitSource = 'shot';

    boss = group;
    addToEnemyList(group); // targeting + projectile hit detection see the boss
    // Panned spawn sting: the boss may appear far off to one side of the view.
    playSfxAt('boss_spawn', group.position.x, group.position.y, player.position.x, player.position.y);
    return group;
}

// Random free spawn point among the SPAWN_POINTS (bosses use the same 8 points as enemies).
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
// damageEnemy's:
//   { knockback, knockbackX, knockbackY } — push direction and distance (the push shockwave)
//   { silent }                            — skip the flash and sound (trail damage ticks)
//   { source }                            — kill attribution ('shot', 'trail', ...)
export function damageBoss(amount, options = {}) {
    if (!boss || boss.userData.dying) return false;

    const data = boss.userData;
    data.hp -= amount;
    data.lastHitSource = options.source || 'shot';
    if (!options.silent) {
        flashBoss();
        // Panned hit sound, like the common enemies' (the boss is big and often off-centre).
        playSfxAt('hit', boss.position.x, boss.position.y, player.position.x, player.position.y);
    }

    if (options.knockback > 0) {
        knockbackBoss(options.knockbackX || 0, options.knockbackY || 0, options.knockback);
    }

    if (data.hp <= 0) {
        killBoss();
        return true;
    }
    if (!options.silent) playOneShot(boss, data.actions.hit);
    return false;
}

// Pushes the boss away, collision-checked step by step (the push shockwave uses this — the
// boss only ever gets knocked back, never stunned or killed by it). The wave-5 boss is
// knockback-immune: it is never shoved at all. Boundary walls are ignored on purpose: a shove
// can carry the boss out of the arena (it walks back in as a silhouette).
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

// The kill moment: Death clip, score, the guaranteed heart drops, then a lingering corpse
// removed in updateBoss().
function killBoss() {
    const data = boss.userData;
    data.dying = true;
    data.touchingPlayer = false;
    data.velocity.x = 0;
    data.velocity.y = 0;
    hideBossWave(); // an in-flight wave dies with its caster
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

    addScore(BOSS_TYPE.score); // points from the config

    // Achievements: boss kills count toward lifetime totals (Arena Champion) and the kill-source
    // attribution rides along (trail, reflect, ...).
    recordKill(data.lastHitSource, true);

    // Guaranteed heart drops: an inclusive random count in [heartDropsMin, heartDropsMax],
    // scattered slightly around the body.
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

    // Bonus drop: a chance of a purple power-up card that opens a free draft when collected.
    if (Math.random() < BOSS.powerupDropChance) {
        spawnPowerupDrop(boss.position.x, boss.position.y);
    }
}

// --- Per-frame AI --------------------------------------------------------------

// Advances the boss by one frame (movement, phase cycle, contact push, animations). Called from
// Combat.update() only while WAVE_PLAYING. No-op without a live boss.
export function updateBoss(delta) {
    if (!boss) return;
    const data = boss.userData;
    const collider = data.collider;

    // The forward wave keeps expanding independently of the boss's own state machine.
    updateBossWave(delta);

    data.mixer.update(delta);

    // Hit-flash restoration.
    if (data.flashTimer > 0) {
        data.flashTimer -= delta;
        if (data.flashTimer <= 0) restoreBossMaterials();
    }

    // Silhouette blend (outside the arena = near-black). Runs for the corpse too.
    updateBossSilhouette(delta);

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

    // Dasher trail: silent damage ticks (same formula as common enemies, Trail Master included,
    // Critical Hit rolling like a shot) while standing on one, plus the faint cyan tint.
    const inTrail = isInsideTrail(boss.position.x, boss.position.y);
    if (inTrail) {
        data.trailTickTimer -= delta;
        if (data.trailTickTimer <= 0) {
            data.trailTickTimer = TRAIL.tickInterval;
            const stats = getStats();
            let damage = (TRAIL.damageBase + stats.hearts * TRAIL.damagePerHeart)
                * stats.trailDamageMul;
            if (stats.critChance > 0 && Math.random() < stats.critChance) damage *= 2;
            damageBoss(
                damage,
                {silent: true, source: 'trail'},
            );
            if (data.dying) return; // the tick killed it; the corpse block above takes over
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

    if (data.state === 'chaseA' || data.state === 'chaseB') {
        // Chase: walk toward the player. The per-wave speed multiplier rides in data.speedMul.
        const speed = ENEMY.baseSpeed * data.speedMul * endlessSpeedMul;
        moveBoss(collider, dirToPlayerX, dirToPlayerY, speed, delta);
        faceBoss(dirToPlayerX, dirToPlayerY);
        moving = true;

        if (data.stateTimer <= 0) {
            // The breather is over: hand the boss to a random attack. Attacks alternate the two
            // chase phases, so the long and short breathers keep alternating too.
            startRandomAttack(data.state === 'chaseA' ? 'chaseB' : 'chaseA');
        }
    } else if (data.state === 'chargeA') {
        // Standing still, charging the orb circle: face the player so the circle looks deliberate.
        faceBoss(dirToPlayerX, dirToPlayerY);
        if (data.stateTimer <= 0) {
            // While outside the arena the volley is skipped (a silhouette is harmless) but the
            // phase cycle continues.
            if (!isOutsideArena(boss.position.x, boss.position.y)) fireOrbVolley();
            finishAttack();
        }
    } else if (data.state === 'spiral') {
        // Spiral storm: stationary, spitting a rotating stream of orbs for its duration.
        faceBoss(dirToPlayerX, dirToPlayerY);
        data.spiralTimer -= delta;
        if (data.spiralTimer <= 0) {
            data.spiralTimer = BOSS.spiralInterval;
            if (!isOutsideArena(boss.position.x, boss.position.y)) fireSpiralBurst();
        }
        if (data.stateTimer <= 0) finishAttack();
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

        // Dash contact: BOSS.dashDamage physical damage, once per dash. During the player's
        // i-frames the dash ghosts through instead. Tested against the player's VISUAL centre, so
        // a dash that visibly clips the leaning frog registers.
        const playerCollider = getCollider(player);
        const playerCenter = getHitCenter();
        if (!data.dashHit && playerCollider && collider &&
            circlesTouch(
                boss.position.x, boss.position.y, collider.radius,
                playerCenter.x, playerCenter.y, playerCollider.radius,
            )) {
            if (!isInvulnerable()) {
                data.dashHit = true;
                // The doom multiplier compounds the dash hit, like every other enemy hit.
                damagePlayer(BOSS.dashDamage * getDoomMul(), 'physical');
                finishAttack(); // the impact ends the dash early
            }
        }

        const blocked = travelled <= 1e-6;
        if (data.stateTimer <= 0 || blocked) {
            if (data.state === 'dash') { // not already ended by the hit above
                finishAttack();
            }
        }
    }

    // Body contact: pushes the player away and hurts for BOSS.contactDamage scaled by the doom
    // multiplier (the push alone felt toothless — the boss is a walking hazard). The push helper
    // returns whether it actually touched; i-frames are honored inside it (no push and no damage
    // while ghosting), and it is skipped entirely while dashing (the dash has its own hit
    // response).
    if (data.state !== 'dash' && collider) {
        if (pushPlayerOut(collider)) {
            damagePlayer(BOSS.contactDamage * getDoomMul(), 'physical');
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

// --- Attack selection ---------------------------------------------------------

// Picks the next attack at random from BOSS.attacks (never repeating the previous one, so the
// pattern stays unreadable) and starts it. `nextChase` is the chase phase the attack hands
// control back to once it finishes.
function startRandomAttack(nextChase) {
    const data = boss.userData;
    data.nextChase = nextChase;

    const pool = BOSS.attacks.filter((name) => name !== data.lastAttack);
    const choice = pool[Math.floor(Math.random() * pool.length)];
    data.lastAttack = choice;

    if (choice === 'volley') {
        // Charge pause, then the 360-degree orb circle.
        data.state = 'chargeA';
        data.stateTimer = BOSS.chargeTime;
        playLoopAction(data.actions.idle);
    } else if (choice === 'dash') {
        // Red charge-up, then the straight charge.
        data.state = 'telegraph';
        data.stateTimer = BOSS.dashTelegraph;
        playOneShot(boss, data.actions.attack);
        tintRed();
    } else if (choice === 'spiral') {
        // Rotating orb stream for a fixed duration.
        data.state = 'spiral';
        data.stateTimer = BOSS.spiralDuration;
        data.spiralTimer = 0; // the first burst fires immediately
        data.spiralAngle = Math.random() * Math.PI * 2; // random start: no two storms alike
        playOneShot(boss, data.actions.volley || data.actions.attack);
    } else if (choice === 'shockwave') {
        // Instant forward wave: no telegraph, the surprise move. It slows, never damages.
        if (!isOutsideArena(boss.position.x, boss.position.y)) castForwardWave();
        playOneShot(boss, data.actions.attack);
        finishAttack();
    } else if (choice === 'summon') {
        // Calls reinforcements around itself (skipped near the arena's enemy cap).
        summonReinforcements();
        playOneShot(boss, data.actions.attack);
        finishAttack();
    }
}

// Ends the current attack: returns to the stored chase phase with its (rage-scaled) breather.
function finishAttack() {
    const data = boss.userData;
    data.state = data.nextChase;
    data.stateTimer = chaseDelay(
        data.nextChase === 'chaseA' ? BOSS.phaseAChase : BOSS.phaseBChase,
    );
}

// Breather length before the next attack. The wave-5 attack escalation (endlessAttackMul) and
// the doom multiplier (which doubles attack pacing per tier) always shorten it; the wave-5 HP
// rage (bossHpRage) shrinks it linearly with the boss's HP and erases it entirely at
// BOSS.hpRageFloor (10%) HP — from there the boss attacks back to back.
function chaseDelay(base) {
    const data = boss.userData;
    let rageMul = 1;
    if (data.hpRage) {
        const hpFraction = Math.max(0, data.hp / data.maxHp);
        rageMul = Math.max(0, (hpFraction - BOSS.hpRageFloor) / (1 - BOSS.hpRageFloor));
    }
    return (base / endlessAttackMul / getDoomMul()) * rageMul;
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
        // Boundary walls are ignored (last argument): the boss may spawn outside and walk in,
        // and a shove can carry it back out.
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
// cancelled by anything solid behind the player ("unless their back is against an obstacle") —
// isMoveFree stops at walls, and the push is skipped entirely during i-frames. Returns true when
// the bodies were actually overlapping (the caller applies the contact damage on that signal);
// false when there was no contact or the player is invulnerable. The overlap is measured to the
// player's VISUAL centre (the lean shifts his body), while the push itself still moves the feet
// position.
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

// Fires the orb circle (BOSS.orbCount orbs evenly spaced around 360 degrees). The volley clip
// plays as the one-shot; the attack clip is only the fallback when the volley clip is missing.
// The one-shot timer resumes the walk loop by itself once the clip ends. The boss object is
// passed as each orb's sender so parries can reflect orbs back into it.
function fireOrbVolley() {
    if (!boss) return;
    playOneShot(boss, boss.userData.actions.volley || boss.userData.actions.attack);
    // Wave-5 attack escalation rides on top of the per-wave orb speed; the doom multiplier
    // compounds the volley speed up further.
    const orbSpeedMul = boss.userData.orbSpeedMul * endlessAttackMul * getDoomMul();
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

// Casts the forward wave (the 'shockwave' attack): an arc band that expands away from the boss
// in the player's direction at cast time. Direction is locked on cast, so sidestepping behind
// the boss is the counterplay. The expansion speed rides the wave-5 escalation and the doom
// multiplier, like every other boss attack's speed.
function castForwardWave() {
    const dx = player.position.x - boss.position.x;
    const dy = player.position.y - boss.position.y;
    wave.dirAngle = Math.atan2(dy, dx);
    wave.originX = boss.position.x;
    wave.originY = boss.position.y;
    wave.radius = 1; // starts at the boss's feet
    wave.maxRadius = BOSS.waveMaxRadius;
    wave.speed = BOSS.waveSpeed * endlessAttackMul * getDoomMul();
    wave.hit = false;
    wave.active = true;

    ensureWaveMesh();
    const arc = (BOSS.waveArcDeg * Math.PI) / 180;
    wave.mesh.rotation.z = wave.dirAngle - arc / 2; // center the arc on the cast direction
    wave.mesh.position.x = wave.originX;
    wave.mesh.position.y = wave.originY;
    wave.mesh.visible = true;
}

// Advances the wave: expands the front, tests the player once per cast, fades out at the end.
function updateBossWave(delta) {
    if (!wave.active) return;

    wave.radius += wave.speed * delta;
    const p = Math.min(wave.radius / wave.maxRadius, 1);
    wave.mesh.scale.setScalar(wave.radius);
    wave.mesh.material.opacity = 0.75 * (1 - p * p); // fades as it travels outward

    if (!wave.hit) {
        // Hit test: the player must be inside the arc's width and his body must overlap the
        // expanding band. The slow applies even during i-frames — it is force, not a hit.
        // TODO: the wave passes through houses (like the push AoE); add line-of-sight if it
        //   ever feels unfair to be slowed through a wall.
        const dx = player.position.x - wave.originX;
        const dy = player.position.y - wave.originY;
        const distance = Math.hypot(dx, dy);
        let diff = Math.atan2(dy, dx) - wave.dirAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // normalize to [-PI, PI]
        const halfArc = (BOSS.waveArcDeg * Math.PI) / 360;
        const playerCollider = getCollider(player);
        const playerRadius = playerCollider ? playerCollider.radius : 0.5;
        if (Math.abs(diff) <= halfArc
            && distance - playerRadius <= wave.radius
            && distance + playerRadius >= wave.radius * WAVE_INNER) {
            wave.hit = true;
            applyPlayerSlow(BOSS.waveSlowMul, BOSS.waveSlowDuration);
        }
    }

    if (wave.radius >= wave.maxRadius) hideBossWave();
}

// Builds the wave's arc mesh once (flat in the XY ground plane, like the other ground fx) and
// adds it to the scene. Theta start is 0; rotation.z aims the arc at cast time.
function ensureWaveMesh() {
    if (wave.mesh) return;
    const arc = (BOSS.waveArcDeg * Math.PI) / 180;
    wave.mesh = new THREE.Mesh(
        new THREE.RingGeometry(WAVE_INNER, 1, 48, 1, 0, arc),
        new THREE.MeshBasicMaterial({
            color: WAVE_COLOR,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
    );
    wave.mesh.position.z = 0.1; // same stacking height as the other flat fx
    wave.mesh.visible = false;
    sceneRef.add(wave.mesh);
}

// Deactivates the wave (front reached its range, boss died, or a fresh spawn).
function hideBossWave() {
    wave.active = false;
    if (wave.mesh) wave.mesh.visible = false;
}

// One spiral burst: BOSS.spiralOrbs orbs evenly spread around the current spiral angle, then the
// angle rotates by BOSS.spiralStepDeg so the stream traces a spiral. With the default two arms
// this reads as a rotating cross of orbs.
function fireSpiralBurst() {
    const data = boss.userData;
    const speedMul = data.orbSpeedMul * endlessAttackMul * getDoomMul() * BOSS.spiralSpeedMul;
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

// Calls BOSS.summonCount common enemies to ring the boss. Enemy.spawnEnemy already applies the
// wave-5 HP growth to new spawns, and occupied spots simply fail; skipped near the arena's alive
// cap so a summon can never flood the field.
function summonReinforcements() {
    if (getAliveCount() + BOSS.summonCount > ENEMY.maxAlive) return;
    for (let i = 0; i < BOSS.summonCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.random() * BOSS.summonRadius;
        const typeId = BOSS.summonTypes[Math.floor(Math.random() * BOSS.summonTypes.length)];
        spawnEnemy(typeId, {
            x: boss.position.x + Math.cos(angle) * radius,
            y: boss.position.y + Math.sin(angle) * radius,
        });
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
    for (const entry of boss.userData.flashOriginals) {
        if (!entry.emissive) continue;
        entry.material.emissive.copy(entry.emissive);
        if (entry.intensity !== null) entry.material.emissiveIntensity = entry.intensity;
    }
}

// --- Outside-arena and trail tints -------------------------------------------------

// Blends every material's color between its original and the near-black silhouette while the
// boss is outside the arena (see Enemy.updateSilhouette — same rules, same blend time). Once
// fully back inside the original colors are restored exactly.
function updateBossSilhouette(delta) {
    if (!boss) return;
    const data = boss.userData;
    const target = isOutsideArena(boss.position.x, boss.position.y) ? 1 : 0;
    if (data.silhouette === target && !data.silhouetteDirty) return;

    const step = delta / ENEMY.silhouetteBlend;
    data.silhouette = target > data.silhouette
        ? Math.min(target, data.silhouette + step)
        : Math.max(target, data.silhouette - step);

    for (const entry of data.flashOriginals) {
        if (!entry.color) continue;
        entry.material.color.copy(entry.color).lerp(SILHOUETTE_COLOR, data.silhouette);
    }
    data.silhouetteDirty = data.silhouette > 0;
}

// Applies (or clears) the faint cyan Dasher-trail tint while the boss stands on a trail. The
// white hit flash and the red dash telegraph both have priority (they own the emissive channel
// during their windows); this function steps aside until they end.
function updateBossTrailTint(inTrail) {
    if (!boss) return;
    const data = boss.userData;
    if (data.flashTimer > 0 || data.state === 'telegraph') return;
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
            if (entry.intensity !== null) entry.material.emissiveIntensity = entry.intensity;
        }
    }
}

// --- Queries / removal / reset -------------------------------------------------------

// True while a boss exists and is not dying (Waves uses this to end wave 3, drive the wave-5
// respawn counter and report the music stage).
export function isBossAlive() {
    return !!boss && !boss.userData.dying;
}

// HUD data for the boss health bar: { hp, maxHp } or null without a live boss. Dying bosses
// report null so the bar disappears the moment the kill lands.
export function getBossInfo() {
    if (!boss || boss.userData.dying) return null;
    return { hp: boss.userData.hp, maxHp: boss.userData.maxHp };
}

// Wave-5 endless growth hook: speed applies live to the dashing/walking speeds, attack scales
// orb speed and the chase phases between volleys/dashes.
export function setBossEndlessScaling(speedMul, attackMul) {
    endlessSpeedMul = speedMul;
    endlessAttackMul = attackMul;
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
    hideBossWave();
    endlessSpeedMul = 1;
    endlessAttackMul = 1;
}
