import { BOSS, COLLISION, ENEMY, PICKUP, PROJECTILE } from '../config/tuning.js';
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
} from '../entities/Player.js';
import {
    applySlow,
    damageEnemy,
    getDoomMul,
    getEnemies,
    knockbackEnemy,
    stunEnemy,
    updateEnemies,
} from '../entities/Enemy.js';
import { damageBoss, updateBoss } from '../entities/Boss.js';
import {
    reflectProjectilesNear,
    spawnPlayerShot,
    updateProjectiles,
} from '../entities/Projectile.js';
import { updatePickups } from '../entities/Pickup.js';
import { updateTrails } from '../entities/Trail.js';
import { playSfx } from './Audio.js';
import { markPlayerDamaged, recordPush } from './Achievements.js';
import { getCollider, isLineSightClear } from '../core/Collision.js';
import { STATE, getState } from '../core/StateMachine.js';

// Combat system: the per-frame conductor for everything that fights while WAVE_PLAYING. It owns
// the ORDER of a frame — move the player, move the enemies and boss, fire the auto-shooter,
// advance projectiles, resolve every hit, apply contact damage, collect pickups — so systems stay
// decoupled modules and nobody else calls each other's update functions.
//
// Damage bookkeeping lives where the HP lives: this module only ROUTES results. Kills, score,
// drops and death clips are Enemy.js/Boss.js's business; i-frames and the push shield are
// Player.js's; projectile flight is Projectile.js's. Card traits (crit, frost, knockback,
// thorns, evasion) are resolved here because this is where shots and contacts meet their target.

// The auto-shooter's timing: one volley every stats.fireCooldown seconds while a VISIBLE target
// is in range (findNearestTarget also requires a clear line of sight). `fireTimer` counts down
// only while such a target exists, so hiding behind a house holds the shot instead of wasting it
// on the wall — and the next clear engagement starts with an instant shot.
let fireTimer = 0;

// Set by Run.beginRun(): called exactly once when the player's HP reaches zero.
let deathCallback = null;

// Set by Run.initRun(): opens one bonus power-up draft per collected power-up drop. Kept as a
// callback so Combat never imports the run/draft systems (and their UI imports) directly.
let powerupCallback = null;

// Power-up drops collected while a draft was already open (possible on the exact frame a wave
// clears). They are held here and opened one per WAVE_PLAYING frame once play resumes, so no
// collected card is ever lost to a modal-state race.
let pendingPowerups = 0;

// Registers the run's death handler (Run.endRun).
export function onPlayerDeath(callback) {
    deathCallback = callback;
}

// Registers the bonus-draft handler (Run.openBonusDraft).
export function onPowerupCollected(callback) {
    powerupCallback = callback;
}

// Clears the per-run timing state. Called by Run.beginRun()/resetWorld().
export function resetCombat() {
    fireTimer = 0;
    pendingPowerups = 0;
}

// One combat frame. Called from main.js only while WAVE_PLAYING.
export function updateCombat(delta) {
    // 1. Actors move first...
    updatePlayer(delta);   // includes the Anchor minions' orbit/shots (they aim with enemy data)
    updateEnemies(delta);
    updateBoss(delta);

    // 2. ...then the player's auto-shooter picks its moment...
    updateAutoShooter(delta);

    // 3. ...the push shield keeps flipping whatever hostile bullet touches it...
    reflectWithShield();

    // 4. ...and bullets fly. Hostile and friendly fire are resolved from the returned events.
    const events = updateProjectiles(delta, getEnemies(), playerHitShape());
    resolveEnemyHits(events.enemyHits);
    resolvePlayerHits(events.playerHits);

    // 5. Body contact (after movement, so it reflects this frame's positions).
    resolveContactDamage();

    // 6. The push shockwave, when a successful push is waiting for it.
    applyPushBurst();

    // 7. Pickups: magnet + collection, plus whatever the dashes swept up this frame. Hearts
    //    heal (PICKUP.heal each; healing a full-HP player is a no-op by design), power-up cards
    //    open a bonus draft.
    const collected = updatePickups(
        delta, player.position.x, player.position.y, getStats().magnetRadius,
    );
    const swept = consumeDashPickups();
    handlePickups(collected.hearts + swept.hearts, collected.powerups + swept.powerups);

    // 8. Dasher trails fade and expire (their damage ticks are read by movers each frame).
    updateTrails(delta);

    // 9. Last: if that was the final heart, hand over to the run (defeat animation + state).
    if (isDead() && deathCallback) deathCallback();
}

// Hearts heal immediately with the pickup sound; power-up cards are queued for a bonus draft.
// A queued card only opens while WAVE_PLAYING, one per frame at most — a card collected on the
// exact frame a wave clears opens once play resumes instead of fighting the wave draft.
function handlePickups(hearts, powerups) {
    if (hearts > 0) {
        healPlayer(hearts * PICKUP.heal);
        playSfx('heart'); // health pickup sound
    }
    pendingPowerups += powerups;
    if (pendingPowerups > 0 && getState() === STATE.WAVE_PLAYING && powerupCallback) {
        pendingPowerups--;
        powerupCallback();
    }
}

// --- Auto-shooter -------------------------------------------------------------

// Fires a volley at the nearest live enemy in range. Runs on stats.fireCooldown (Shortened by
// the Quick Trigger card); multi-shot fans the extra projectiles; aim leads the target's motion.
// While the boss wave's slow is active the timer ticks slower, so shots come slower too.
function updateAutoShooter(delta) {
    const stats = getStats();
    const target = findNearestTarget(stats.range);
    if (!target) return; // no target: leave the timer where it is

    fireTimer -= delta * getSlowFactor();
    if (fireTimer > 0) return;
    fireTimer = stats.fireCooldown;

    fireVolley(target);
}

// Nearest enemy (boss included) within `range` of the player, skipping corpses and enemies the
// player cannot actually shoot: a target behind a house (no clear line of sight, tested against
// the same static boxes projectiles collide with, at the shot's real hit radius) is filtered
// out, so the volley never pours into a wall. A farther visible enemy wins over a nearer hidden
// one. The border walls are ignored — shots fly over them, so enemies still walking in from the
// forest are valid targets.
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
        if (!isLineSightClear(
            originX, originY, enemy.position.x, enemy.position.y,
            PROJECTILE.playerRadius * COLLISION.projectileRadiusMul,
            true,
        )) {
            continue;
        }
        bestDistanceSq = distanceSq;
        best = enemy;
    }
    return best;
}

// Fires `stats.projectiles` shots in a small fan (the Multi-Shot card) toward the target,
// leading its velocity by a fraction of the flight time. Pierce is carried per bullet. Each shot
// rolls its own Critical Hit (double damage) and carries the live Berserk bonus (damage per
// missing heart); the Big Bullets card rides along as a hit-radius multiplier. The boss wave's
// slow is read here: slowed shots spawn slower (and the lead compensates for that speed).
function fireVolley(target) {
    const stats = getStats();
    const originX = player.position.x;
    const originY = player.position.y;
    const shotSpeed = PROJECTILE.playerSpeed * getSlowFactor();

    const dx = target.position.x - originX;
    const dy = target.position.y - originY;
    const distance = Math.max(Math.hypot(dx, dy), 1e-4);
    const flightTime = distance / shotSpeed;
    const velocity = target.userData.velocity || { x: 0, y: 0 };
    const aimX = target.position.x + velocity.x * flightTime * PROJECTILE.aimLeadFactor;
    const aimY = target.position.y + velocity.y * flightTime * PROJECTILE.aimLeadFactor;

    const baseAngle = Math.atan2(aimY - originY, aimX - originX);
    const spread = (PROJECTILE.multiShotSpreadDeg * Math.PI) / 180;
    const count = Math.max(1, stats.projectiles);
    const offset = ((count - 1) / 2) * spread;

    // Berserk: extra damage for every heart missing right now.
    const missingHearts = Math.max(0, stats.maxHearts - stats.hearts);
    const baseDamage = stats.damage + stats.berserkPerMissingHeart * missingHearts;

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
                radiusMul: stats.bulletRadiusMul, // Big Bullets: bigger sphere and hit radius
            },
        );
        if (bullet) bullet.pierce = stats.pierce;
    }
    playSfx('shoot'); // laser shot
}

// --- Push interactions ---------------------------------------------------------

// While the shield is up, any hostile projectile that enters its circle (radius from the active
// class's ability) is reflected back at player speed (Projectile.reflectProjectilesNear). The
// circle is centred on Tode's VISUAL position (the lean shifts his body), so the push catches
// what visually touches him. A reflection is a successful push.
function reflectWithShield() {
    if (!isShieldActive()) return;
    const center = getHitCenter();
    const ability = getAbilityValues();
    const reflected = reflectProjectilesNear(
        center.x, center.y, ability.reflectRadius, ability.reflectDamage,
    );
    if (reflected > 0) markPushSuccess(); // plays the parry sfx once and arms the shockwave
}

// Applies the pending push shockwave once: AoE damage to everything in radius, a stun AND a
// strong shove for common enemies (tanks are immune to knockback, so they are only stunned),
// and plain knockback for the boss (the wave-5 boss is knockback-immune, so the push only
// damages it).
function applyPushBurst() {
    const burst = consumePushBurst();
    if (!burst) return;
    const ability = getAbilityValues();
    const stats = getStats();

    const px = player.position.x;
    const py = player.position.y;
    for (const enemy of getEnemies()) {
        if (enemy.userData.dying) continue;
        const reach = burst.radius + (enemy.userData.collider ? enemy.userData.collider.radius : 0);
        const distance = Math.hypot(enemy.position.x - px, enemy.position.y - py);
        if (distance > reach) continue;

        // Critical Hit: the shockwave rolls per target, like every shot does.
        let damage = burst.damage;
        if (stats.critChance > 0 && Math.random() < stats.critChance) damage *= 2;

        if (enemy.userData.isBoss) {
            // The wave-5 boss ignores the shove entirely; skip both the knockback and its Power
            // Shove count (a shove that never happened must not tick the achievement).
            const shoved = !enemy.userData.knockbackImmune;
            damageBoss(damage, {
                knockback: shoved ? BOSS.knockbackDistance : 0,
                knockbackX: enemy.position.x - px,
                knockbackY: enemy.position.y - py,
                source: 'shockwave',
            });
            if (shoved) recordPush(); // the boss got shoved too
        } else {
            damageEnemy(enemy, damage, {source: 'shockwave'});
            stunEnemy(enemy, ability.stun);
            if (enemy.userData.typeConfig.behavior !== 'tank' && burst.knockback > 0
                && !enemy.userData.dying) {
                knockbackEnemy(
                    enemy,
                    enemy.position.x - px,
                    enemy.position.y - py,
                    burst.knockback,
                );
                recordPush(); // achievements: Power Shove counts shoved enemies
            }
        }
    }
}

// --- Hit resolution ----------------------------------------------------------------

// Friendly bullets that touched an enemy this frame: route to the right HP owner, then apply the
// on-hit card traits — Concussive Shots knock the target back along the bullet's travel and
// Frost Shot slows it (the boss is immune to both; it only takes the damage).
function resolveEnemyHits(enemyHits) {
    const stats = getStats();
    for (const { bullet, enemy } of enemyHits) {
        const options = {source: bullet.source || 'shot'};
        if (enemy.userData.isBoss) {
            damageBoss(bullet.damage, options);
            continue;
        }
        damageEnemy(enemy, bullet.damage, options);
        if (enemy.userData.dying) continue; // no point slowing/knocking a corpse
        if (stats.slowOnHitMul > 0 && stats.slowOnHitDuration > 0) {
            applySlow(enemy, stats.slowOnHitMul, stats.slowOnHitDuration);
        }
        if (stats.shotKnockback > 0) {
            knockbackEnemy(enemy, bullet.speedX, bullet.speedY, stats.shotKnockback);
        }
    }
}

// Hostile bullets that reached the player this frame. The projectile is already consumed by
// Projectile.js; here only the damage happens (i-frames and the Evasion dodge are enforced inside
// damagePlayer). The doom multiplier compounds the damage of every hostile shot.
function resolvePlayerHits(playerHits) {
    const damage = PROJECTILE.damage * getDoomMul();
    for (let i = 0; i < playerHits.length; i++) {
        const result = damagePlayer(damage, 'projectile');
        if (result === 'hit' || result === 'dead') markPlayerDamaged();
    }
}

// Enemies overlapping the player deal 1 physical damage scaled by the doom multiplier and are
// knocked back. Skipped entirely while the player is invulnerable, so i-frames are true ghosting
// (no damage, no push). Thorn Skin answers a landed hit with damage back at the toucher (a
// shielded or dodged hit does not, since nothing actually landed). The boss is excluded: its
// body push lives in Boss.js.
function resolveContactDamage() {
    if (isDead() || isInvulnerable()) return;
    const stats = getStats();
    const contactDamage = getDoomMul();

    for (const enemy of getEnemies()) {
        if (enemy.userData.isBoss || enemy.userData.dying) continue;
        if (!enemy.userData.touchingPlayer) continue;

        const result = damagePlayer(contactDamage, 'physical');
        if (result === 'hit' || result === 'dead') {
            markPlayerDamaged();
            if (stats.thornsDamage > 0) {
                damageEnemy(enemy, stats.thornsDamage, {source: 'thorns'});
            }
        }

        // Knock the enemy away from the player, along the contact line (a corpse is skipped by
        // knockbackEnemy itself).
        knockbackEnemy(
            enemy,
            enemy.position.x - player.position.x,
            enemy.position.y - player.position.y,
            ENEMY.knockbackDistance,
        );
    }
}

// --- Helpers -------------------------------------------------------------------------

// The player's circle for hostile-bullet collision: the VISUAL centre (the hop's lean shifts
// the body ahead of the feet) plus the measured collider radius.
function playerHitShape() {
    const collider = getCollider(player);
    const center = getHitCenter();
    return {
        x: center.x,
        y: center.y,
        radius: collider ? collider.radius : 0.6,
    };
}
