import * as THREE from 'three';
import { getEnemies } from './Enemy.js';
import { spawnMinionShot } from './Projectile.js';
import { assetUrl } from '../core/Assets.js';
import { isLineSightClear } from '../core/Collision.js';
import { playSfx } from '../systems/Audio.js';
import { COLLISION, PLAYER, PROJECTILE } from '../config/tuning.js';

// Minion component (Anchor class): translucent sprites that orbit the player, always facing the
// camera (THREE.Sprite billboards automatically), with extra vision range (ability.rangeMul).
// They copy every power-up: their damage, fire rate, shot count, pierce and range are derived
// from the live player stats each frame, so a card picked mid-run changes them instantly.
//
// Architecture note: this module imports Enemy (to find targets), and Enemy imports Player (for
// its position) — a runtime-only cycle that ESM handles because nothing is touched at module
// evaluation time.
//
// The sprite texture is the tode.svg asset rasterized to a canvas once: SVGs load reliably as
// textures this way (explicit draw size, no dimension guessing), and the same file doubles as
// the page favicon, so no new assets are introduced.

let texture = null;
let texturePromise = null;

// Minion instances: { group, timer, rateMul, angleOffset }. The group holds the sprite; the orbit
// math sets the group position every frame. Each minion keeps its own shot timer and its own
// random rate offset (rateMul), so the three fire on fully independent cadences.
const minions = [];
let elapsed = 0;

// Loads and rasterizes tode.svg into a canvas texture. Idempotent: repeated calls share the
// same promise, so switching to Anchor twice never re-decodes the image.
function loadSpriteTexture() {
    if (texturePromise) return texturePromise;
    texturePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.src = assetUrl('/assets/tode.svg'); // base-relative so subpath deploys work
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, 128, 128);
            const canvasTexture = new THREE.CanvasTexture(canvas);
            canvasTexture.colorSpace = THREE.SRGBColorSpace;
            texture = canvasTexture;
            resolve(canvasTexture);
        };
        image.onerror = reject;
    });
    return texturePromise;
}

// Creates the class's orbiting minions (ability.minionCount of them). Call once per run when
// the class is chosen; safe to call again after clearMinions(). Returns a promise so callers
// can await the texture.
export async function createMinions(scene, ability) {
    clearMinions();
    try {
        await loadSpriteTexture();
    } catch (error) {
        // Without the sprite there is nothing to render; log and skip (game stays playable).
        console.error('Failed to load minion sprite (tode.svg)', error);
        return;
    }
    const count = ability.minionCount;
    for (let i = 0; i < count; i++) {
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8, // translucent sprite
            depthWrite: false, // translucent billboards must not fight other transparent draws
        });
        const sprite = new THREE.Sprite(material);
        // Sized against the 1.0-unit player so the companion reads about Tode-sized.
        sprite.scale.setScalar(0.9);
        const group = new THREE.Group();
        group.add(sprite);
        scene.add(group);
        minions.push({
            group,
            timer: Math.random() * ability.minionInterval, // desync the first shots
            rateMul: 1 + (Math.random() * 2 - 1) * ability.minionRateJitter, // own fire rate
            angleOffset: (i / count) * Math.PI * 2, // spread evenly around the orbit
        });
    }
}

// Advances the orbit and the minions' auto-fire. Called from Player.updatePlayer() every frame
// while WAVE_PLAYING.
//   * playerPos — the hero's ground position (orbit centre).
//   * stats     — live player stats; minions copy them (see the module header).
//   * ability   — the active class's ability block (orbit + damage numbers).
export function updateMinions(delta, playerPos, stats, ability) {
    if (minions.length === 0) return;
    elapsed += delta;

    // Fire-rate copy: how much faster the player shoots than at base (1.0 = no Quick Trigger).
    const fireRateMul = PLAYER.baseFireCooldown / Math.max(stats.fireCooldown, 0.05);
    const baseInterval = ability.minionInterval / fireRateMul;
    // Range copy: extra vision relative to the player (ability.rangeMul).
    const range = stats.range * ability.rangeMul;
    const enemies = getEnemies();

    for (const minion of minions) {
        // Orbit placement: angle advances at a fixed rate; the group (not the sprite) moves.
        const angle = elapsed * ability.orbitSpeed + minion.angleOffset;
        minion.group.position.set(
            playerPos.x + Math.cos(angle) * ability.orbitRadius,
            playerPos.y + Math.sin(angle) * ability.orbitRadius,
            ability.orbitHeight,
        );

        // Each minion fires on its own interval: the copied base rate times its personal offset.
        const interval = baseInterval * minion.rateMul;
        minion.timer += delta;
        if (minion.timer < interval) continue;
        minion.timer -= interval;

        // Nearest live enemy inside the minion's range.
        const target = findNearestEnemy(enemies, minion.group.position, range);
        if (!target) continue;

        fireVolley(minion.group.position, target, stats, ability);
        playSfx('minion_shot');
    }
}

// Finds the closest enemy (circle centres on the ground plane) within `range` of a position,
// skipping corpses and enemies with no clear shot: the line from the minion's orbit point must
// stay clear of every house box for the shot's hit radius (the configurable one, matching what
// really stops the bullet), so minions never fire into a house wall. The border walls are
// ignored — minion shots fly over them like the player's, so enemies walking in from the forest
// are valid targets too. A farther visible enemy wins over a nearer hidden one.
function findNearestEnemy(enemies, position, range) {
    let best = null;
    let bestDistanceSq = range * range;
    for (const enemy of enemies) {
        if (enemy.userData.dying) continue;
        const dx = enemy.position.x - position.x;
        const dy = enemy.position.y - position.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= bestDistanceSq) continue;
        if (!isLineSightClear(
            position.x, position.y, enemy.position.x, enemy.position.y,
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

// Fires the minion's volley at one target: `stats.projectiles` shots in a small fan, each with
// the minion's damage and the player's pierce. Aim leads the target's velocity, mirroring the
// player's auto-shooter (see Combat.js).
function fireVolley(origin, target, stats, ability) {
    // Damage copy: the ability's base damage plus whatever Heavy Ammo added to the player.
    const damage = ability.minionDamage + (stats.damage - PLAYER.baseDamage);
    const count = Math.max(1, stats.projectiles);

    // Lead: extrapolate the target's position by its approximate flight time to it.
    const dx = target.position.x - origin.x;
    const dy = target.position.y - origin.y;
    const distance = Math.max(Math.hypot(dx, dy), 1e-4);
    const flightTime = distance / PROJECTILE.playerSpeed;
    const velocity = target.userData.velocity || { x: 0, y: 0 };
    const aimX = target.position.x + velocity.x * flightTime * PROJECTILE.aimLeadFactor;
    const aimY = target.position.y + velocity.y * flightTime * PROJECTILE.aimLeadFactor;

    const baseAngle = Math.atan2(aimY - origin.y, aimX - origin.x);
    const spread = ((count - 1) / 2) * (PROJECTILE.multiShotSpreadDeg * Math.PI) / 180;

    for (let i = 0; i < count; i++) {
        const angle = baseAngle - spread + i * (PROJECTILE.multiShotSpreadDeg * Math.PI) / 180;
        const bullet = spawnMinionShot(
            origin.x,
            origin.y,
            Math.cos(angle),
            Math.sin(angle),
            { damage, speed: PROJECTILE.playerSpeed, radiusMul: stats.bulletRadiusMul },
        );
        // Minion shots copy the player's pierce count.
        if (bullet) bullet.pierce = stats.pierce;
    }
}

// Removes every minion from the scene (new run / class change / reset).
export function clearMinions() {
    for (const minion of minions) {
        minion.group.remove(...minion.group.children);
        if (minion.group.parent) minion.group.parent.remove(minion.group);
    }
    minions.length = 0;
    elapsed = 0;
}
