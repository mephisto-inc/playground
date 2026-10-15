import { ABILITY, BOSS, ENEMY, PROJECTILE } from '../config/tuning.js';
import player, {
    consumeParryBurst,
    damagePlayer,
    getStats,
    healPlayer,
    isDead,
    isInvulnerable,
    isShieldActive,
    markParrySuccess,
    updatePlayer,
} from '../entities/Player.js';
import {
    damageEnemy,
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
import { markPlayerDamaged } from './Achievements.js';
import { getCollider, isLineSightClear } from '../core/Collision.js';

// Combat system: the per-frame conductor for everything that fights while WAVE_PLAYING. It owns
// the ORDER of a frame — move the player, move the enemies and boss, fire the auto-shooter,
// advance projectiles, resolve every hit, apply contact damage, collect pickups — so systems stay
// decoupled modules and nobody else calls each other's update functions.
//
// Damage bookkeeping lives where the HP lives: this module only ROUTES results. Kills, score,
// drops and death clips are Enemy.js/Boss.js's business; i-frames and the parry are Player.js's;
// projectile flight is Projectile.js's.

// The auto-shooter's timing: one volley every stats.fireCooldown seconds while a VISIBLE target
// is in range (round 4: findNearestTarget also requires a clear line of sight). `fireTimer`
// counts down only while such a target exists, so hiding behind a house holds the shot instead
// of wasting it on the wall — and the next clear engagement starts with an instant shot.
let fireTimer = 0;

// Set by Run.beginRun(): called exactly once when the player's HP reaches zero.
let deathCallback = null;

// Registers the run's death handler (Run.endRun).
export function onPlayerDeath(callback) {
    deathCallback = callback;
}

// Clears the per-run timing state. Called by Run.beginRun()/resetWorld().
export function resetCombat() {
    fireTimer = 0;
}

// One combat frame. Called from main.js only while WAVE_PLAYING.
export function updateCombat(delta) {
    // 1. Actors move first...
    updatePlayer(delta);   // includes the Anchor minions' orbit/shots (they aim with enemy data)
    updateEnemies(delta);
    updateBoss(delta);

    // 2. ...then the player's auto-shooter picks its moment...
    updateAutoShooter(delta);

    // 3. ...the parry shield keeps flipping whatever hostile bullet touches it...
    reflectWithShield();

    // 4. ...and bullets fly. Hostile and friendly fire are resolved from the returned events.
    const events = updateProjectiles(delta, getEnemies(), playerHitShape());
    resolveEnemyHits(events.enemyHits);
    resolvePlayerHits(events.playerHits);

    // 5. Body contact (after movement, so it reflects this frame's positions).
    resolveContactDamage();

    // 6. The parry shockwave, when a successful parry is waiting for it.
    applyParryBurst();

    // 7. Pickups: magnet + collection, then healing (GDD 4B). Healing a full-HP player is a
    //    no-op by design (healPlayer clamps), so no special check is needed here.
    const collected = updatePickups(
        delta, player.position.x, player.position.y, getStats().magnetRadius,
    );
    if (collected > 0) {
        healPlayer(collected);
        playSfx('heart'); // GDD 8C: health pickup sound
    }

    // 8. Dasher trails fade and expire (their slow effect is read by movers each frame).
    updateTrails(delta);

    // 9. Last: if that was the final heart, hand over to the run (defeat animation + state).
    if (isDead() && deathCallback) deathCallback();
}

// --- Auto-shooter (GDD 4A) ----------------------------------------------------

// Fires a volley at the nearest live enemy in range. Runs on stats.fireCooldown (Shortened by
// the Quick Trigger card); multi-shot fans the extra projectiles; aim leads the target's motion.
function updateAutoShooter(delta) {
    const stats = getStats();
    const target = findNearestTarget(stats.range);
    if (!target) return; // no target: leave the timer where it is

    fireTimer -= delta;
    if (fireTimer > 0) return;
    fireTimer = stats.fireCooldown;

    fireVolley(target);
}

// Nearest enemy (boss included) within `range` of the player, skipping corpses and enemies the
// player cannot actually shoot: a target behind a house (no clear line of sight, tested against
// the same static boxes projectiles collide with, at shot radius) is filtered out, so the volley
// never pours into a wall. A farther visible enemy wins over a nearer hidden one.
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
        if (!isLineSightClear(originX, originY, enemy.position.x, enemy.position.y, PROJECTILE.playerRadius)) {
            continue;
        }
        bestDistanceSq = distanceSq;
        best = enemy;
    }
    return best;
}

// Fires `stats.projectiles` shots in a small fan (GDD 6A: Multi-Shot) toward the target, leading
// its velocity by a fraction of the flight time. Pierce is carried per bullet.
function fireVolley(target) {
    const stats = getStats();
    const originX = player.position.x;
    const originY = player.position.y;

    const dx = target.position.x - originX;
    const dy = target.position.y - originY;
    const distance = Math.max(Math.hypot(dx, dy), 1e-4);
    const flightTime = distance / PROJECTILE.playerSpeed;
    const velocity = target.userData.velocity || { x: 0, y: 0 };
    const aimX = target.position.x + velocity.x * flightTime * PROJECTILE.aimLeadFactor;
    const aimY = target.position.y + velocity.y * flightTime * PROJECTILE.aimLeadFactor;

    const baseAngle = Math.atan2(aimY - originY, aimX - originX);
    const spread = (PROJECTILE.multiShotSpreadDeg * Math.PI) / 180;
    const count = Math.max(1, stats.projectiles);
    const offset = ((count - 1) / 2) * spread;

    for (let i = 0; i < count; i++) {
        const angle = baseAngle - offset + i * spread;
        const bullet = spawnPlayerShot(
            originX,
            originY,
            Math.cos(angle),
            Math.sin(angle),
            { damage: stats.damage, speed: PROJECTILE.playerSpeed },
        );
        if (bullet) bullet.pierce = stats.pierce;
    }
    playSfx('shoot'); // GDD 8C: laser shot
}

// --- Parry interactions (GDD 4A) ------------------------------------------------

// While the shield is up, any hostile projectile that enters its circle is reflected back at
// player speed (Projectile.reflectProjectilesNear). A reflection is a successful parry.
function reflectWithShield() {
    if (!isShieldActive()) return;
    const reflected = reflectProjectilesNear(
        player.position.x, player.position.y, ABILITY.parryReflectRadius,
    );
    if (reflected > 0) markParrySuccess(); // plays sfx_parry once and arms the shockwave
}

// Applies the pending parry shockwave once: AoE damage to everything in radius, a stun for
// common enemies, and plain knockback for the boss (GDD 4A).
function applyParryBurst() {
    const burst = consumeParryBurst();
    if (!burst) return;

    const px = player.position.x;
    const py = player.position.y;
    for (const enemy of getEnemies()) {
        if (enemy.userData.dying) continue;
        const reach = burst.radius + (enemy.userData.collider ? enemy.userData.collider.radius : 0);
        const distance = Math.hypot(enemy.position.x - px, enemy.position.y - py);
        if (distance > reach) continue;

        if (enemy.userData.isBoss) {
            damageBoss(burst.damage, {
                knockback: BOSS.knockbackDistance,
                knockbackX: enemy.position.x - px,
                knockbackY: enemy.position.y - py,
            });
        } else {
            damageEnemy(enemy, burst.damage);
            stunEnemy(enemy, ABILITY.parryStun);
        }
    }
}

// --- Hit resolution ----------------------------------------------------------------

// Friendly bullets that touched an enemy this frame: route to the right HP owner.
function resolveEnemyHits(enemyHits) {
    for (const { bullet, enemy } of enemyHits) {
        if (enemy.userData.isBoss) {
            damageBoss(bullet.damage);
        } else {
            damageEnemy(enemy, bullet.damage);
        }
    }
}

// Hostile bullets that reached the player this frame. The projectile is already consumed by
// Projectile.js; here only the damage happens (i-frames are enforced inside damagePlayer).
function resolvePlayerHits(playerHits) {
    for (let i = 0; i < playerHits.length; i++) {
        const result = damagePlayer(PROJECTILE.damage, 'projectile');
        if (result === 'hit' || result === 'dead') markPlayerDamaged();
    }
}

// Enemies overlapping the player deal 1 physical damage and are knocked back (GDD 3C). Skipped
// entirely while the player is invulnerable, so i-frames are true ghosting (no damage, no push).
// The boss is excluded: its body push lives in Boss.js.
function resolveContactDamage() {
    if (isDead() || isInvulnerable()) return;

    for (const enemy of getEnemies()) {
        if (enemy.userData.isBoss || enemy.userData.dying) continue;
        if (!enemy.userData.touchingPlayer) continue;

        const result = damagePlayer(1, 'physical');
        if (result === 'hit' || result === 'dead') markPlayerDamaged();

        // Knock the enemy away from the player, along the contact line.
        knockbackEnemy(
            enemy,
            enemy.position.x - player.position.x,
            enemy.position.y - player.position.y,
            ENEMY.knockbackDistance,
        );
    }
}

// --- Helpers -------------------------------------------------------------------------

// The player's circle for hostile-bullet collision: centre + measured collider radius.
function playerHitShape() {
    const collider = getCollider(player);
    return {
        x: player.position.x,
        y: player.position.y,
        radius: collider ? collider.radius : 0.6,
    };
}
