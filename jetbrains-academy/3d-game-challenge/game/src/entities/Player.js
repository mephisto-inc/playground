import * as THREE from 'three';
import { cloneMaterials, enableShadows, loadGLTF, normalizeModel } from '../core/Assets.js';
import { isMoveFree, registerCollider, MAX_MOVE_SUB_STEP } from '../core/Collision.js';
import { getMoveTarget } from '../core/Input.js';
import { ABILITY, COLLISION, ENEMY, PICKUP, PLAYER } from '../config/tuning.js';
import { getClass } from '../config/classes.js';
import { clearMinions, createMinions, updateMinions } from './Minion.js';
import { spawnTrail } from './Trail.js';
import { sweepPickups } from './Pickup.js';
import { addPierceToPlayerShots } from './Projectile.js';
import { playSfx } from '../systems/Audio.js';
import {
    recordCardCollected,
    recordClassPlayed,
    recordCloseCall,
    recordDash,
    recordShieldBlock,
    unlockAchievement,
} from '../systems/Achievements.js';

// Player component: owns Tode the Frog — the model, the pointer-steered hop, the heart/HP
// stats every power-up mutates, i-frames and hit flash, and the class ability (Pusher shield,
// Dasher dash, Anchor minions).
//
// The player group carries only the ground position; the model child carries facing and the
// hop's frog-lean. Movement is a sequence of short hops toward the pointer (Input.js provides
// the target), never a continuous glide.

// --- Model notes -------------------------------------------------------------
// tode.glb: glTF 2.0, one static mesh (no skin, no animations), local forward +Z, feet at the
// model's local bottom. Rotation.x = +PI/2 lays it onto this Z-up ground.
const MODEL_YAW_OFFSET = Math.PI / 2;
// The hop's lean: a quick nose-up snap, a roll to nose-down by the apex, held until touchdown.
const LEAN_SNAP_UP_FRACTION = 0.1;
const LEAN_ROLL_END_FRACTION = 0.45;

// The player group, at the arena centre. Exported as the default: other systems read
// player.position directly (enemy steering, camera follow, spawn placement).
const player = new THREE.Group();
export default player;

let sceneRef = null;
let model = null;          // the loaded mesh (rotation/opacity are applied to it)
let modelMaterials = [];   // cloned per-instance materials (i-frame opacity flash)
let modelGroundZ = 0;      // the model's resting height (ground offset from normalizeModel)
let playerCollider = registerCollider(player, player.position, 0.6); // placeholder until measured

// The load promise; main.js awaits it before starting.
export const playerReady = load();

async function load() {
    const gltf = await loadGLTF('/assets/tode.glb');
    const template = gltf.scene;
    enableShadows(template);

    model = template;
    normalizeModel(model, { targetHeight: PLAYER.targetHeight });
    modelGroundZ = model.position.z; // remember the resting height for resets

    // Per-instance materials so the i-frame opacity fade never touches other clones (there are
    // none today, but this also sets up transparent rendering for the flash).
    modelMaterials = cloneMaterials(model);
    for (const material of modelMaterials) material.transparent = true;

    player.add(model);
    player.visible = false; // starts hidden behind the main menu
    // COLLISION.playerRadiusMul grows/shrinks the measured hit circle without touching the model.
    playerCollider = registerCollider(player, player.position, measureRadius(model) * COLLISION.playerRadiusMul);
    return model;
}

// Measures a normalized model's ground-plane radius (in its own frame) for the collider.
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

// --- Visual hit centre -------------------------------------------------------

// The ground-plane centre of the model's current world bounds. While Tode leans through a hop,
// the visible body shifts ahead of his feet, so hostile-bullet hits, reflected shots and body
// contact all test against this point (via getHitCenter()) instead of player.position — they
// register where the frog visibly is. Recomputed once per live frame in updatePlayer().
const hitCenter = new THREE.Vector2();
const hitCenterBox = new THREE.Box3();
const hitCenterPoint = new THREE.Vector3();

function updateHitCenter() {
    if (model) {
        // Refresh world matrices so the box reads this frame's lean and yaw, not last frame's.
        player.updateMatrixWorld(true);
        hitCenterBox.setFromObject(model);
        hitCenterBox.getCenter(hitCenterPoint);
        // An empty box (no meshes) would give Infinity/NaN coordinates; fall through instead.
        if (Number.isFinite(hitCenterPoint.x) && Number.isFinite(hitCenterPoint.y)) {
            hitCenter.set(hitCenterPoint.x, hitCenterPoint.y);
            return;
        }
    }
    hitCenter.set(player.position.x, player.position.y);
}

// --- Live run state ----------------------------------------------------------

// stats: every number a power-up can change. Reset by configureClass() on each new run.
//   hearts/maxHearts — HP and its cap (class start; Titan Heart raises the cap to 7 max)
//   speedMul         — multiplies PLAYER.baseSpeed for hop speed
//   fireCooldown     — seconds between auto-shots
//   damage           — damage per shot
//   projectiles      — shots per volley
//   pierce           — extra bodies a shot passes through
//   range            — auto-shooter targeting range
//   iFrames          — invulnerability after a hit, in seconds
//   magnetRadius     — health-pickup attraction radius
//   dropChance       — enemy health-drop probability
//   critChance       — chance a damage roll (shots, shockwave, trail ticks) deals double damage
//   thornsDamage     — damage dealt back to an enemy that touches the hero
//   berserkPerMissingHeart — bonus shot damage per missing heart
//   shotKnockback    — world units a shot shoves a common enemy it hits
//   slowOnHitMul     — speed multiplier a shot applies to the enemy it hits (0 = no slow)
//   slowOnHitDuration — seconds that slow lasts
//   bulletRadiusMul  — multiplier on the friendly shots' size (visual sphere + hit radius)
//   dodgeChance      — chance to ignore an incoming hit entirely
//   trailDurationAdd — extra seconds of Dasher trail life
//   trailWidthMul    — multiplier on the Dasher trail width
//   trailDamageMul   — multiplier on the Dasher trail's tick damage
let stats = makeBaseStats();
let classId = 'pusher';
let collectedCards = []; // card ids in pickup order (HUD badges + game-over recap)
let dead = false;
let iframes = 0;         // remaining invulnerability seconds
let deathAnimTime = 0;   // progress through the defeat animation

// Pending pickups swept up by the last dash(es), drained once per frame by Combat (which owns
// healing and the bonus-draft hand-off). See consumeDashPickups().
let dashPickupQueue = { hearts: 0, powerups: 0 };

// Ability state (only one class is active per run, so one set of timers is enough).
let cooldownRemaining = 0;
let shieldRemaining = 0;      // Pusher shield window
let pushSucceeded = false;    // did this push block/reflect anything?
let pushBurstPending = false; // shockwave owed to Combat (see consumePushBurst)

// Boss-wave slow: hop-speed multiplier (1 = normal) and its remaining seconds. The strongest
// active slow wins and timers never shorten, mirroring Enemy.applySlow.
let slowFactor = 1;
let slowTimer = 0;

// Dash shadow clones: { mesh/clone, life } — cosmetic afterimages fading along the dash path.
const dashClones = [];

// The hop in flight: start/target ground points, the direction, progress 0..1 and the yaw.
const move = {
    direction: new THREE.Vector3(),
    start: new THREE.Vector3(),
    target: new THREE.Vector3(),
    progress: 1, // 1 = standing
    yaw: 0,
};

// Base stats at "fresh run, no cards": values from tuning.js.
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
        // Card-only stats: zero/neutral until a matching card is picked.
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

// Called once from main.js; stores the scene (dash clones and minions attach to it).
export function initPlayer(scene) {
    sceneRef = scene;
    scene.add(player);
}

// Prepares a fresh run for the chosen class: resets stats/hearts/cards/timers and spawns the
// Anchor minions when that class is picked. Called by Run.beginRun().
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
    dashPickupQueue = { hearts: 0, powerups: 0 };
    clearDashClones();
    clearMinions();

    // Achievements: World Tour counts the classes a save has ever started a run with.
    recordClassPlayed(classId);

    resetPlayer();
    if (definition.ability.minionCount) {
        // The Minion module reads its orbit/damage numbers from the class's ability block.
        createMinions(sceneRef, definition.ability);
    }
}

// The active class's ability block (config/classes.js). Combat, Projectile, Enemy, Boss and the
// minions read their numbers through this, so each class retunes its ability in one place.
export function getAbilityValues() {
    return getClass(classId).ability;
}

// The active class's id ('pusher' | 'dasher' | 'anchor'). The draft reads this to exclude
// class-restricted cards from other classes' pools.
export function getActiveClassId() {
    return classId;
}

// --- Power-up application ----------------------------------------------------

// Applies a draft card's effect descriptor to the live stats. The card data is declarative
// (config/powerups.js), so this is the single place that interprets every descriptor field.
export function applyCard(card) {
    collectedCards.push(card.id);
    const effect = card.effect;

    if (effect.fireRateMul) stats.fireCooldown /= effect.fireRateMul;
    if (effect.projectilesAdd) stats.projectiles += effect.projectilesAdd;
    if (effect.pierceAdd) {
        stats.pierce += effect.pierceAdd;
        // Live shots become more penetrating too, so the upgrade is felt immediately.
        addPierceToPlayerShots(effect.pierceAdd);
    }
    if (effect.speedAdd) stats.speedMul += effect.speedAdd;
    if (effect.damageAdd) stats.damage += effect.damageAdd;
    if (effect.rangeMul) stats.range *= effect.rangeMul;
    if (effect.maxHeartsAdd) {
        // Clamped at both ends: Reckless may push the cap down, but never below 1 heart.
        stats.maxHearts = Math.max(1, Math.min(
            PLAYER.maxHearts,
            stats.maxHearts + effect.maxHeartsAdd,
        ));
        stats.hearts = Math.min(stats.hearts, stats.maxHearts); // a lowered cap trims current HP
        // "Full Hearts" achievement: reaching the global 7-heart cap.
        if (stats.maxHearts >= PLAYER.maxHearts) unlockAchievement('fullHearts');
    }
    if (effect.heal) healPlayer(effect.heal);
    if (effect.iFramesSet !== undefined) stats.iFrames = effect.iFramesSet;
    if (effect.magnetMul) stats.magnetRadius *= effect.magnetMul;
    if (effect.dropChanceSet !== undefined) stats.dropChance = effect.dropChanceSet;
    if (effect.critChanceAdd) stats.critChance += effect.critChanceAdd;
    if (effect.thornsDamage) stats.thornsDamage += effect.thornsDamage;
    if (effect.berserkPerMissingHeart) {
        stats.berserkPerMissingHeart += effect.berserkPerMissingHeart;
    }
    if (effect.shotKnockback) stats.shotKnockback += effect.shotKnockback;
    if (effect.slowOnHitMul) {
        stats.slowOnHitMul = effect.slowOnHitMul; // a fixed value, re-picking just refreshes it
        stats.slowOnHitDuration = effect.slowOnHitDuration || stats.slowOnHitDuration;
    }
    if (effect.bulletRadiusMul) stats.bulletRadiusMul *= effect.bulletRadiusMul;
    if (effect.dodgeChanceAdd) stats.dodgeChance += effect.dodgeChanceAdd;
    if (effect.trailDurationAdd) stats.trailDurationAdd += effect.trailDurationAdd;
    if (effect.trailWidthMul) stats.trailWidthMul *= effect.trailWidthMul;
    if (effect.trailDamageMul) stats.trailDamageMul *= effect.trailDamageMul;

    // Keep the cooldown above a sane floor so stacked Quick Triggers cannot reach zero delay.
    stats.fireCooldown = Math.max(0.1, stats.fireCooldown);

    // Achievements: Decked Out counts the cards held in a single run.
    recordCardCollected(collectedCards.length);
}

// --- Damage, healing, i-frames ----------------------------------------------

// Applies damage unless it is prevented. Returns what happened:
//   'shielded' — the Pusher shield cancelled physical damage (and the shockwave is owed)
//   'immune'   — i-frames are running; the hit is ignored
//   'dodged'   — the Evasion card rolled; the hit is ignored entirely
//   'hit'      — damage landed
//   'dead'     — damage landed and killed the player
// `kind` is 'physical' (enemy contact, boss dash) or 'projectile' — the shield cancels only
// physical damage; projectiles are supposed to be reflected before they arrive.
export function damagePlayer(amount, kind = 'physical') {
    if (dead) return 'dead';
    if (kind === 'physical' && shieldRemaining > 0) {
        // Shield works: flag the success (sound + shockwave) and cancel the hit. Every cancelled
        // physical hit counts toward the Bulwark achievement, not just the first of a window.
        recordShieldBlock();
        if (!pushSucceeded) {
            pushSucceeded = true;
            pushBurstPending = true;
            playSfx('parry'); // the sfx_parry asset keeps its name
            playPushImpact(); // VFX: flash + expanding ring
        }
        return 'shielded';
    }
    if (iframes > 0) return 'immune';
    if (stats.dodgeChance > 0 && Math.random() < stats.dodgeChance) {
        return 'dodged'; // Evasion: the hit is ignored, i-frames are not consumed
    }

    stats.hearts -= amount;
    iframes = stats.iFrames;
    playSfx('hurt');

    if (stats.hearts <= 0) {
        stats.hearts = 0;
        dead = true;
        deathAnimTime = 0;
        return 'dead';
    }
    // Surviving a hit on exactly one heart is the Close Call achievement.
    if (stats.hearts === 1) recordCloseCall();
    return 'hit';
}

// Restores hearts, clamped to the max. Called by pickups and Titan Heart.
export function healPlayer(amount) {
    stats.hearts = Math.min(stats.maxHearts, stats.hearts + amount);
}

export function isDead() {
    return dead;
}

// True while i-frames are running. The Boss uses this for "ghosting": during i-frames the
// player passes through the Boss's hitbox with no push and no damage.
export function isInvulnerable() {
    return iframes > 0;
}

export function isShieldActive() {
    return shieldRemaining > 0;
}

// Marks this push as successful (used by Combat's projectile reflection, which happens outside
// damagePlayer). Plays the success sound once.
export function markPushSuccess() {
    if (pushSucceeded) return;
    pushSucceeded = true;
    pushBurstPending = true;
    playSfx('parry'); // the sfx_parry asset keeps its name; only internals were renamed
    playPushImpact(); // VFX: flash + expanding ring
}

// Applies the boss wave's slow: hop movement is multiplied by `factor` for `duration` seconds.
// The strongest active slow wins (kept by taking the minimum) and the timer never shortens.
export function applyPlayerSlow(factor, duration) {
    slowFactor = Math.min(slowTimer > 0 ? slowFactor : 1, factor);
    slowTimer = Math.max(slowTimer, duration);
}

// The current slow multiplier (1 = unaffected). Combat reads it to slow the auto-shooter's
// cadence and its shots while the effect lasts; everything snaps back the moment it ends.
export function getSlowFactor() {
    return slowFactor;
}

// Hands Combat the pending push shockwave exactly once (null when none is owed). Combat applies
// the AoE damage/stun/knockback because it already owns enemy damage bookkeeping.
export function consumePushBurst() {
    if (!pushBurstPending) return null;
    pushBurstPending = false;
    const ability = getAbilityValues();
    return {
        radius: ability.shockwaveRadius,
        // Shockwave damage is the class's base plus current HP.
        damage: ability.shockwaveBaseDamage + stats.hearts,
        // How far the shockwave shoves enemies (tanks excepted, handled by knockbackEnemy).
        knockback: ability.knockback || 0,
    };
}

// --- Abilities ---------------------------------------------------------------

// Double click/tap handler: activates the class ability. Anchor is passive and does nothing.
export function tryActivateAbility() {
    if (dead || cooldownRemaining > 0 || !model) return;
    const ability = getAbilityValues();

    if (classId === 'pusher') {
        cooldownRemaining = ability.cooldown;
        shieldRemaining = ability.shield;
        pushSucceeded = false;
        showPushGlow(); // VFX: the shield lights up for its shield window
    } else if (classId === 'dasher') {
        cooldownRemaining = ability.cooldown;
        performDash(ability);
    }
    // Anchor: no active ability — the minions do the work.
}

// Executes the Dasher's instant dash: a collision-checked teleport toward the pointer (or the
// last facing when the pointer is idle), shadow clones along the path, a slow-field trail, and
// the extra invulnerability window.
function performDash(ability) {
    const direction = dashDirection();
    const startX = player.position.x;
    const startY = player.position.y;

    // Slide forward in small steps while the path is free — the dash cannot pass through houses
    // or walls (the same rule every other move obeys).
    let travelled = 0;
    const step = Math.min(0.2, ability.distance);
    while (travelled < ability.distance) {
        const next = Math.min(step, ability.distance - travelled);
        const nx = player.position.x + direction.x * next;
        const ny = player.position.y + direction.y * next;
        if (!isMoveFree(playerCollider, nx, ny)) break; // wall ahead: dash ends early
        player.position.x = nx;
        player.position.y = ny;
        travelled += next;
    }

    // Cancel any hop in flight so the next frame continues from the landing spot.
    move.progress = 1;
    move.start.copy(player.position);
    move.target.copy(player.position);

    // Trail lifetime scales with current HP (base + per-heart bonus from the class ability),
    // plus the Trail Master card's flat bonus; its width follows the same card's multiplier.
    const duration = ability.trailBaseDuration + ability.trailPerHeart * stats.hearts
        + stats.trailDurationAdd;
    spawnTrail(
        startX, startY, player.position.x, player.position.y,
        duration, ability.trailWidth * stats.trailWidthMul,
    );

    // The dash sweeps up every pickup it crosses (hearts AND bonus power-up cards), so dashing
    // through a drop collects it. The counts are queued and drained by Combat, which owns the
    // healing and the bonus-draft hand-off.
    sweepDashPickups(startX, startY, player.position.x, player.position.y);

    spawnDashClones(startX, startY, player.position.x, player.position.y, ability);

    // The ability's extra invulnerability (never shortens an i-frame window already running).
    iframes = Math.max(iframes, ability.extraIFrames);
    // Achievements: Blink counts lifetime dashes.
    recordDash();
    playSfx('dash');
}

// Collects pickups along the dash segment: the path is sampled every ~1 unit and each sample
// sweeps the pickup collect radius plus a little grace, so nothing visibly touched is missed.
// Results accumulate into dashPickupQueue for Combat to drain (consumeDashPickups).
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

// Hands Combat everything the dashes have swept up since the last call and clears the queue.
export function consumeDashPickups() {
    const result = dashPickupQueue;
    dashPickupQueue = { hearts: 0, powerups: 0 };
    return result;
}

// Unit direction for the dash: toward the pointer's ground position when one exists, otherwise
// straight along the last hop facing (so a dash with an idle mouse still goes somewhere useful).
function dashDirection() {
    const target = getMoveTarget(player.position);
    if (target) {
        const dx = target.x - player.position.x;
        const dy = target.y - player.position.y;
        const length = Math.hypot(dx, dy);
        if (length > 1e-4) return { x: dx / length, y: dy / length };
    }
    return {
        x: Math.cos(move.yaw - MODEL_YAW_OFFSET),
        y: Math.sin(move.yaw - MODEL_YAW_OFFSET),
    };
}

// Leaves fading afterimages along the dash path. Each clone is a copy of the model with its own
// transparent materials, so fading one never affects the real Tode.
// TODO (polish): reuse the real model's current pose/lean for the clones instead of the bind
//   pose; acceptable now because the dash is nearly instant.
function spawnDashClones(x1, y1, x2, y2, ability) {
    if (!model || !sceneRef) return;
    for (let i = 0; i < ability.cloneCount; i++) {
        const t = (i + 1) / (ability.cloneCount + 1);
        const clone = model.clone();
        clone.position.set(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, clone.position.z);
        clone.rotation.copy(model.rotation);
        const materials = cloneMaterials(clone);
        for (const material of materials) {
            material.transparent = true;
            material.opacity = 0.5;
        }
        sceneRef.add(clone);
        dashClones.push({ clone, life: ability.cloneLife, total: ability.cloneLife });
    }
}

// Fades and removes dash clones. Called every frame from updatePlayer().
function updateDashClones(delta) {
    for (let i = dashClones.length - 1; i >= 0; i--) {
        const entry = dashClones[i];
        entry.life -= delta;
        if (entry.life <= 0) {
            dashClones.splice(i, 1);
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
        if (entry.clone.parent) entry.clone.parent.remove(entry.clone);
    }
    dashClones.length = 0;
}

// --- Push VFX -----------------------------------------------------------------

// The push has a readable visual: a pulsing pale-jade glow while the shield is up, a near-white
// impact flash plus an expanding pale-jade ring when a push actually succeeds, and a quick
// collapse when the shield expires having parried nothing. Every piece is a flat additive mesh
// parented to the player group, so it follows Tode's hop and allocates nothing during play.
// This is presentation only — the shield's behavior never reads any of it.
const PUSH_GLOW_COLOR = 0x8fe6c9;   // soft pale-jade shield glow (wind/force palette)
const PUSH_IMPACT_COLOR = 0xeafff5; // near-white flash on a successful push
const PUSH_RING_COLOR = 0xbdf5e6;   // pale jade of the expanding shockwave ring

// Builds one flat fx mesh in the group's XY plane (this is a Z-up world, so no rotation is
// needed — the same trick the heart pickups use) and attaches it to the player, hidden.
function createPushFx(geometry, color, z) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    }));
    mesh.position.z = z; // slight stacking offsets so the layers never z-fight
    mesh.visible = false;
    player.add(mesh);
    return mesh;
}

const pushGlow = createPushFx(
    new THREE.RingGeometry(ABILITY.pushGlowRadius * 0.5, ABILITY.pushGlowRadius, 40),
    PUSH_GLOW_COLOR,
    0.12,
);
const pushImpact = createPushFx(new THREE.CircleGeometry(0.5, 24), PUSH_IMPACT_COLOR, 0.14);
// The ring's base outer radius is exactly 1, so the animation scales the mesh by the active
// class's shockwave radius and the visual reaches precisely as far as the push AoE really does.
const pushRing = createPushFx(new THREE.RingGeometry(0.72, 1, 40), PUSH_RING_COLOR, 0.13);

// Push fx state machine: 'none' | 'glow' | 'impact' | 'ring' | 'fail'.
let pushFxState = 'none';
let pushFxTime = 0;  // seconds into the current state
let pushFxClock = 0; // free-running clock driving the glow's pulse

// Shield activated: show the pulsing glow.
function showPushGlow() {
    pushFxState = 'glow';
    pushFxTime = 0;
    pushGlow.scale.setScalar(1);
    pushGlow.visible = true;
    pushImpact.visible = false;
    pushRing.visible = false;
}

// Push succeeded: the glow gives way to the impact flash, then the expanding ring.
function playPushImpact() {
    pushFxState = 'impact';
    pushFxTime = 0;
    pushGlow.visible = false;
    pushImpact.scale.setScalar(0.6);
    pushImpact.material.opacity = 0.9;
    pushImpact.visible = true;
    pushRing.visible = false;
}

// Shield expired with no push: the glow collapses inward quickly.
function playPushFail() {
    pushFxState = 'fail';
    pushFxTime = 0;
    pushGlow.visible = true; // collapses from wherever the glow pulse left it
    pushImpact.visible = false;
    pushRing.visible = false;
}

// Hides every push fx mesh (death, new run).
function hidePushFx() {
    pushFxState = 'none';
    pushFxTime = 0;
    pushGlow.visible = false;
    pushImpact.visible = false;
    pushRing.visible = false;
}

// Advances the push visual state machine. Called every live frame from updatePlayer().
function updatePushFx(delta) {
    pushFxClock += delta;
    const pulse = 0.5 + 0.5 * Math.sin(pushFxClock * 14); // 0..1, ~2.2 Hz heartbeat

    switch (pushFxState) {
        case 'glow': {
            pushGlow.material.opacity = 0.3 + 0.3 * pulse;
            pushGlow.scale.setScalar(1 + 0.06 * pulse);
            break;
        }
        case 'impact': {
            pushFxTime += delta;
            const p = Math.min(pushFxTime / ABILITY.pushImpactDuration, 1);
            pushImpact.scale.setScalar(0.6 + 0.7 * p);
            pushImpact.material.opacity = 0.9 * (1 - 0.6 * p);
            if (p >= 1) {
                pushFxState = 'ring';
                pushFxTime = 0;
                pushImpact.visible = false;
                pushRing.visible = true;
            }
            break;
        }
        case 'ring': {
            pushFxTime += delta;
            const p = Math.min(pushFxTime / ABILITY.pushRingDuration, 1);
            pushRing.scale.setScalar(1 + (getAbilityValues().shockwaveRadius - 1) * p);
            pushRing.material.opacity = 0.85 * (1 - p);
            if (p >= 1) hidePushFx();
            break;
        }
        case 'fail': {
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

// --- Per-frame update --------------------------------------------------------

// Advances the player by one frame (called from main.js only while WAVE_PLAYING):
// movement, timers, model orientation, i-frame flash and the minions' orbit/shots.
export function updatePlayer(delta) {
    if (dead) {
        hidePushFx(); // a run that ended mid-glow leaves no rings burning on the corpse
        return;
    }

    // Frame-start position → ground velocity at the end of the frame. The rangers read
    // player.userData.velocity when leading their shots (Enemy.js).
    const frameStartX = player.position.x;
    const frameStartY = player.position.y;

    // Timers.
    if (iframes > 0) iframes = Math.max(0, iframes - delta);
    if (slowTimer > 0) {
        slowTimer = Math.max(0, slowTimer - delta);
        if (slowTimer === 0) slowFactor = 1; // the boss wave's slow has worn off
    }
    // The class ability's cooldown (push/dash) ticks slower while the boss wave's slow is
    // active, so a slowed Dasher/Pusher waits longer; it snaps back the moment the slow ends.
    if (cooldownRemaining > 0) cooldownRemaining = Math.max(0, cooldownRemaining - delta * slowFactor);
    if (shieldRemaining > 0) {
        shieldRemaining = Math.max(0, shieldRemaining - delta);
        // A push that blocked nothing by the time the shield drops has failed.
        if (shieldRemaining === 0 && !pushSucceeded) {
            playSfx('parry_failed'); // the sfx_parry_failed asset keeps its name
            playPushFail(); // VFX: the glow collapses
        }
    }
    updateDashClones(delta);
    updatePushFx(delta);

    // Hop steering: while idle, aim a new hop at the pointer if it is outside the deadzone.
    if (move.progress >= 1) {
        const target = getMoveTarget(player.position);
        if (target) {
            const dx = target.x - player.position.x;
            const dy = target.y - player.position.y;
            const distance = Math.hypot(dx, dy);
            move.direction.set(dx / distance, dy / distance, 0);
            move.start.copy(player.position);
            // Clamp the hop to the remaining distance so the hero never overshoots the pointer.
            move.target
                .copy(move.start)
                .addScaledVector(move.direction, Math.min(PLAYER.hopDistance, distance));
            move.progress = 0;
            move.yaw = Math.atan2(move.direction.y, move.direction.x) + MODEL_YAW_OFFSET;
            playSfx('jump'); // one hop, one jump sound
        }
    }

    // Advance the hop with collision sub-stepping (slide along obstacle faces when the direct
    // step is blocked, exactly like the enemies' movement).
    if (move.progress < 1) {
        const groundSpeed = PLAYER.baseSpeed * stats.speedMul * slowFactor; // includes the wave slow
        const targetProgress = Math.min(move.progress + (delta * groundSpeed) / PLAYER.hopDistance, 1);
        const hopLength = move.start.distanceTo(move.target);
        const subProgress = hopLength > 0 ? Math.min(MAX_MOVE_SUB_STEP / hopLength, 1) : 1;

        let blocked = false;
        while (move.progress < targetProgress) {
            const nextProgress = Math.min(move.progress + subProgress, targetProgress);
            const nextX = THREE.MathUtils.lerp(move.start.x, move.target.x, nextProgress);
            const nextY = THREE.MathUtils.lerp(move.start.y, move.target.y, nextProgress);

            if (!isMoveFree(playerCollider, nextX, nextY)) {
                // Try the step split into axis halves, so Tode skims along a wall face instead of
                // stopping dead against it. Moving `start` and `target` by the same delta keeps
                // position = lerp(start, target, progress) exactly true, so the arc cannot pop.
                const slideX = isMoveFree(playerCollider, nextX, player.position.y);
                const slideY = !slideX && isMoveFree(playerCollider, player.position.x, nextY);
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
            // Fully blocked: collapse the hop onto the current spot and let the arc finish, so
            // Tode lands under his own weight instead of freezing mid-air or teleporting down.
            move.start.copy(player.position);
            move.target.copy(player.position);
            move.progress = targetProgress;
        }
    }

    // Vertical arc: a sine over the hop's progress (0 at both ends, peak mid-hop).
    player.position.z = Math.sin(move.progress * Math.PI) * PLAYER.hopHeight;

    // Model orientation: face the travel direction, tilt through the leap, reset on touch-down.
    orientModel(move.yaw, move.progress < 1 ? currentLean() : 0);
    updateHitCenter(); // refresh the visual hit centre for this frame's hit tests

    // I-frame flash: toggle opacity between the flash opacity and 100% while invulnerable.
    const opacity = iframes > 0 && Math.floor(iframes * 10) % 2 === 0
        ? PLAYER.iframeFlashOpacity
        : 1;
    for (const material of modelMaterials) material.opacity = opacity;

    // Ground velocity for this frame (the rangers lead their shots by this). Written after all
    // position changes so it reflects the hop/dash/slide that actually happened.
    player.userData.velocity = {
        x: (player.position.x - frameStartX) / Math.max(delta, 1e-6),
        y: (player.position.y - frameStartY) / Math.max(delta, 1e-6),
    };

    // Anchor minions: orbit + auto-fire, reading the live stats and class ability values.
    updateMinions(delta, player.position, stats, getAbilityValues());
}

// --- Model orientation helpers ----------------------------------------------

const baseEuler = new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ');
const LEAN_AXIS = new THREE.Vector3(1, 0, 0); // model-local lateral axis
const baseQuaternion = new THREE.Quaternion();
const leanQuaternion = new THREE.Quaternion();

// Points the model at `yaw` and tilts it by `lean` radians through the hop. Quaternion
// composition is used (not raw Euler angles) because the tilt must apply about the model's own
// lateral axis after the yaw.
function orientModel(yaw, lean) {
    if (!model) return;
    baseQuaternion.setFromEuler(baseEuler.set(Math.PI / 2, yaw, 0, 'XYZ'));
    leanQuaternion.setFromAxisAngle(LEAN_AXIS, lean);
    model.quaternion.copy(baseQuaternion).multiply(leanQuaternion);
}

// The frog-lean for the current hop state: snap nose-up, roll to nose-down by the apex, hold
// that nose-down until touch-down. Magnitude grows with hop speed, so faster hops lean more.
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

// --- Defeat animation --------------------------------------------------------

// Plays the code-made defeat animation: Tode spins and sinks into the ground while fading out.
// Returns true while the animation is still running (main.js keeps calling it in GAME_OVER).
export function updateDeathAnimation(delta) {
    if (!dead || deathAnimTime >= PLAYER.deathAnimDuration) return false;
    deathAnimTime += delta;
    const t = Math.min(1, deathAnimTime / PLAYER.deathAnimDuration);

    if (model) {
        model.rotation.z = -t * Math.PI * 2; // one full spin as he goes down
        model.position.z -= t * 0.05 * PLAYER.targetHeight; // sink a little
    }
    for (const material of modelMaterials) material.opacity = Math.max(0, 1 - t);
    return t < 1;
}

// --- Queries used by other systems ------------------------------------------

// The live stats object (read-only for callers; mutate through applyCard/damagePlayer).
export function getStats() {
    return stats;
}

export function getHearts() {
    return stats.hearts;
}

// Ability info for the HUD cooldown ring:
//   { icon, cooldown (total), remaining, passive }
export function getAbilityInfo() {
    const definition = getClass(classId);
    return {
        icon: definition.icon,
        cooldown: definition.ability.cooldown || 0,
        remaining: cooldownRemaining,
        passive: !definition.ability.cooldown,
    };
}

// Card ids picked this run, in order (HUD build badges + game-over recap).
export function getCollectedCards() {
    return collectedCards.slice();
}

// The player's visual hit centre (see the "Visual hit centre" section): the ground-plane centre
// of the model's current world bounds, refreshed every live frame by updatePlayer(). Returned
// live — callers read x/y in the same frame and must not keep or mutate the object.
export function getHitCenter() {
    return hitCenter;
}

// --- Reset -------------------------------------------------------------------

// Puts Tode back at the arena centre, visible and level, with no hop in flight. Called by
// configureClass() on every new run and by main.js when returning to character selection.
export function resetPlayer() {
    player.position.set(0, 0, 0);
    hitCenter.set(player.position.x, player.position.y); // hit tests start on the feet again
    move.progress = 1;
    move.direction.set(0, 0, 0);
    move.start.copy(player.position);
    move.target.copy(player.position);
    iframes = 0;
    slowFactor = 1;
    slowTimer = 0;
    // Fresh velocity reading: rangers must not lead the first shot of a run by the last run's
    // movement (velocity is written every live frame in updatePlayer).
    player.userData.velocity = { x: 0, y: 0 };
    hidePushFx(); // no leftover glow/flash/ring from the previous run
    player.visible = true;
    if (model) {
        model.rotation.z = 0;
        // Restore the model's normal resting height (undoes the defeat animation's sink without
        // losing the ground offset normalizeModel() applied at load time).
        model.position.z = modelGroundZ;
    }
    for (const material of modelMaterials) material.opacity = 1;
}
