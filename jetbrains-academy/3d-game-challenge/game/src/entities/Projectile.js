import * as THREE from 'three';
import { isObstacleFree } from '../core/Collision.js';
import { PROJECTILE } from '../config/tuning.js';

// Projectile component: one pool for every shot in the game — player shots (and Anchor minion
// shots, which behave identically) and enemy shots (ranged projectiles and boss orbs).
//
// The module owns movement, obstacle collision and hit DETECTION, but not damage: Combat.update()
// calls updateProjectiles(delta) and then resolves the returned hit list against enemies and the
// player. Keeping damage out of here avoids an import cycle (Combat imports this module) and
// keeps one place responsible for i-frames, knockback and kill credit.

// Shared geometry for every bullet: a small low-poly sphere. One geometry/material instance per
// color means bullets never allocate during a run.
const bulletGeometry = new THREE.SphereGeometry(1, 8, 6);

// Bullet colors: friendly shots are bright, enemy shots are hostile red, boss orbs are violet.
const COLORS = {
    player: 0xffe14d,
    minion: 0x7dffd4,
    enemy: 0xff5a5a,
    boss: 0xc46bff,
};

const materials = {
    player: new THREE.MeshBasicMaterial({ color: COLORS.player }),
    minion: new THREE.MeshBasicMaterial({ color: COLORS.minion }),
    enemy: new THREE.MeshBasicMaterial({ color: COLORS.enemy }),
    boss: new THREE.MeshBasicMaterial({ color: COLORS.boss }),
};

// Every live bullet. Each entry: { mesh, owner, damage, radius, speedX, speedY, life, pierce,
// hitSet } where owner is 'player' | 'minion' | 'enemy' | 'boss' and hitSet remembers enemies a
// piercing shot already damaged (so one bullet never damages the same body twice).
const bullets = [];
let sceneRef = null;

// Creates a bullet at (x, y, z) flying in the unit direction (dirX, dirY) at `speed` units per
// second. `owner` picks the visual color; `damage`/`radius` are carried for Combat to read.
function spawnBullet({ owner, x, y, z, dirX, dirY, speed, damage, radius, life, pierce = 0 }) {
    if (!sceneRef) return null;

    const mesh = new THREE.Mesh(bulletGeometry, materials[owner]);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(radius);
    sceneRef.add(mesh);

    const bullet = {
        mesh,
        owner,
        damage,
        radius,
        speedX: dirX * speed,
        speedY: dirY * speed,
        life,
        pierce,
        hitSet: new Set(),
    };
    bullets.push(bullet);
    return bullet;
}

// --- Spawn APIs (called by Combat for player/volley shots and by Enemy/Boss for hostile ones) --

// Fires one player-owned shot. (x, y) is the muzzle on the ground plane; the bullet flies at a
// small fixed height so it is visible above the checkerboard.
export function spawnPlayerShot(x, y, dirX, dirY, { damage, speed }) {
    return spawnBullet({
        owner: 'player',
        x,
        y,
        z: 0.7,
        dirX,
        dirY,
        speed,
        damage,
        radius: PROJECTILE.playerRadius,
        life: PROJECTILE.playerLifetime,
    });
}

// Fires one minion shot (identical behavior, different color and no extra bookkeeping).
export function spawnMinionShot(x, y, dirX, dirY, { damage, speed }) {
    return spawnBullet({
        owner: 'minion',
        x,
        y,
        z: 0.7,
        dirX,
        dirY,
        speed,
        damage,
        radius: PROJECTILE.playerRadius,
        life: PROJECTILE.playerLifetime,
    });
}

// Fires one ranged-enemy projectile.
export function spawnEnemyShot(x, y, dirX, dirY) {
    return spawnBullet({
        owner: 'enemy',
        x,
        y,
        z: 0.7,
        dirX,
        dirY,
        speed: PROJECTILE.enemySpeed,
        damage: PROJECTILE.damage,
        radius: PROJECTILE.enemyRadius,
        life: PROJECTILE.enemyLifetime,
    });
}

// Fires one boss orb.
export function spawnBossOrb(x, y, dirX, dirY) {
    return spawnBullet({
        owner: 'boss',
        x,
        y,
        z: 0.7,
        dirX,
        dirY,
        speed: PROJECTILE.bossOrbSpeed,
        damage: PROJECTILE.damage, // boss orbs deal 1 damage each (GDD 3C)
        radius: PROJECTILE.bossOrbRadius,
        life: PROJECTILE.bossOrbLifetime,
    });
}

// Turns every hostile bullet currently overlapping the parry shield circle back into a
// player-owned bullet: ownership flips, the direction reverses and the shot accelerates to
// player speed (a reflected orb that then crawls across the field would not feel like a parry).
// Returns how many projectiles were reflected, so the parry can decide success/failure sound.
export function reflectProjectilesNear(x, y, radius) {
    let reflected = 0;
    for (const bullet of bullets) {
        if (bullet.owner !== 'enemy' && bullet.owner !== 'boss') continue;
        const dx = bullet.mesh.position.x - x;
        const dy = bullet.mesh.position.y - y;
        if (Math.hypot(dx, dy) > radius + bullet.radius) continue;

        const speed = Math.hypot(bullet.speedX, bullet.speedY);
        if (speed < 1e-6) continue;
        bullet.owner = 'player';
        bullet.damage = PROJECTILE.damage;
        bullet.pierce = 0;
        bullet.hitSet.clear();
        bullet.speedX = (-bullet.speedX / speed) * PROJECTILE.playerSpeed;
        bullet.speedY = (-bullet.speedY / speed) * PROJECTILE.playerSpeed;
        bullet.life = PROJECTILE.playerLifetime;
        bullet.mesh.material = materials.player;
        reflected++;
    }
    return reflected;
}

// Applies a pierce upgrade to every live player-owned bullet. Called when the Piercing card is
// picked mid-flight of some bullets: they simply become more penetrating from that moment.
export function addPierceToPlayerShots(extraPierce) {
    for (const bullet of bullets) {
        if (bullet.owner === 'player' || bullet.owner === 'minion') bullet.pierce += extraPierce;
    }
}

// --- Update / query ----------------------------------------------------------

// Advances every bullet by one frame, removes the ones that die (lifetime, walls or hits read
// by Combat), and returns the events Combat must resolve:
//   { enemyHits: [{ bullet, enemy }], playerHits: [bullet, ...] }
// The live enemy OBJECT is reported (not an index) because kill bookkeeping splices the array
// mid-flight. `enemies` is the live enemy array (read-only here). `playerInfo` is
// { x, y, radius } and may be null when the player cannot be hit (i-frames are checked by
// Combat, not here).
export function updateProjectiles(delta, enemies, playerInfo) {
    const events = { enemyHits: [], playerHits: [] };

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        // Bullets move in sub-steps of at most MAX_MOVE_SUB_STEP (0.1) world units so a fast
        // player shot cannot tunnel through a thin wall or a small enemy between frames.
        const stepX = bullet.speedX * delta;
        const stepY = bullet.speedY * delta;
        const distance = Math.hypot(stepX, stepY);
        const subSteps = Math.max(1, Math.ceil(distance / 0.1));
        let dead = false;

        for (let s = 0; s < subSteps && !dead; s++) {
            bullet.mesh.position.x += stepX / subSteps;
            bullet.mesh.position.y += stepY / subSteps;

            // Houses and walls block every shot (GDD 5: houses block shots).
            if (!isObstacleFree(bullet.mesh.position.x, bullet.mesh.position.y, bullet.radius)) {
                dead = true;
                break;
            }

            if (bullet.owner === 'player' || bullet.owner === 'minion') {
                // Friendly fire check: the first enemy whose body the bullet touches. The enemy
                // index is reported, and Combat calls damageEnemy() — that way score, drops and
                // death bookkeeping all stay in the enemy/score modules.
                for (let e = 0; e < enemies.length; e++) {
                    const enemy = enemies[e];
                    if (!enemy.userData.collider || enemy.userData.dying) continue;
                    if (bullet.hitSet.has(enemy)) continue; // never damage one body twice
                    const dx = enemy.position.x - bullet.mesh.position.x;
                    const dy = enemy.position.y - bullet.mesh.position.y;
                    const reach = enemy.userData.collider.radius + bullet.radius;
                    if (dx * dx + dy * dy > reach * reach) continue;

                    // The enemy OBJECT is remembered (not its index), because kill bookkeeping
                    // splices the live array and would shift indices mid-flight.
                    bullet.hitSet.add(enemy);
                    events.enemyHits.push({ bullet, enemy });
                    // Tanks act as a shield (GDD 4B): their body stops every shot dead, so even
                    // a piercing bullet cannot pass through one to reach what stands behind it.
                    if (enemy.userData.blocksShots) {
                        dead = true; // absorbed
                    } else if (bullet.pierce > 0) {
                        bullet.pierce--; // passes through; may hit another body later
                    } else {
                        dead = true; // spent
                    }
                    break;
                }
            } else if (playerInfo) {
                // Hostile bullet vs player: report the hit; Combat applies damage and i-frames.
                const dx = playerInfo.x - bullet.mesh.position.x;
                const dy = playerInfo.y - bullet.mesh.position.y;
                const reach = playerInfo.radius + bullet.radius;
                if (dx * dx + dy * dy <= reach * reach) {
                    events.playerHits.push(bullet);
                    dead = true;
                }
            }
        }

        bullet.life -= delta;
        if (bullet.life <= 0) dead = true;

        if (dead) removeBulletAt(i);
    }

    return events;
}

// Removes the bullet at `index`, detaching its mesh from the scene.
function removeBulletAt(index) {
    const bullet = bullets[index];
    bullets.splice(index, 1);
    if (bullet.mesh.parent) bullet.mesh.parent.remove(bullet.mesh);
}

// Removes every bullet (new run, reset). Called by Run.resetWorld().
export function clearProjectiles() {
    for (let i = bullets.length - 1; i >= 0; i--) removeBulletAt(i);
}

// Stores the scene bullets are added to. Called once from main.js.
export function initProjectiles(scene) {
    sceneRef = scene;
}
