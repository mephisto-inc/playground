import { getExactScore } from './Score.js';

// Difficulty component: the dynamic difficulty system (spec: Increasing complexity). As the score
// climbs, enemies get faster and appear more often while the hero gets a smaller boost to hop
// speed, attack speed, and attack range — so the world gently outpaces the player.
//
// It is the single source of truth for the five score-scaled parameters and for their *base*
// values. Every tuning number that this system touches lives here, because task.md notes that the
// game's feel "depends heavily on the ratio between these numbers" — keeping them together makes
// that ratio visible in one place instead of scattered across components.
//
// Direction of dependency: Difficulty reads the score and the game systems read Difficulty. That
// is deliberately one-way (Difficulty -> Score; Enemy/Player/Attack -> Difficulty), so there is
// no import cycle. Systems *pull* the current value with a getter each frame.
//
// main.js calls updateDifficulty() once per frame; the getters below then report this frame's
// values. updateDifficulty() is the "recalculate using the current score" step the spec asks for.

// --- Growth rate ------------------------------------------------------------
// The spec's single "complexity growth rate factor" constant: difficulty per score point. The
// factor is `score * COMPLEXITY_GROWTH_RATE`, so it is 0 at the start and rises linearly.
//   TODO (tuning): this is the master dial. Raise it to make the game spike quickly (0.02 doubles
//     enemy speed by ~50 points); lower it for a slow burn (0.005). It has NO upper cap, so a big
//     enough score keeps scaling forever — the floors on the two "decreasing" params below are the
//     only safety rails.
export const COMPLEXITY_GROWTH_RATE = 0.01;

// --- Base values (the score-0 game) -----------------------------------------
// These are the values at difficulty factor 0. Previously they lived in Enemy/Player/Attack;
// they moved here so all difficulty-scaled tuning sits in one file (see the module note above).
//   TODO (tuning): the absolute feel at score 0 — the baseline the scaling grows away from.
const BASE_ENEMY_SPEED = 30;         // world units per second (was Enemy.ENEMY_SPEED)
const BASE_ENEMY_SPAWN_DELAY = 3;    // seconds between spawns (was Enemy.ENEMY_SPAWN_DELAY)
const BASE_PLAYER_MOVE_SPEED = 2;    // hop progress per second (was Player.MOVE_SPEED)
const BASE_ATTACK_COOLDOWN = 1;      // seconds between strikes (was Attack.ATTACK_COOLDOWN)
const BASE_ATTACK_RADIUS = 50;       // attack ring radius (was Attack.ATTACK_RADIUS)

// --- Linear weights ---------------------------------------------------------
// How strongly each parameter reacts to the factor. The value is the fraction changed when the
// factor reaches 1 (e.g. 1.0 = +100% at factor 1, 0.6 = -60% at factor 1).
//
// The core balance rule (spec): ENEMY weights are all larger than PLAYER weights, so the threat
// scales slightly faster than the hero and the player never truly outgrows it.
//   TODO (tuning): these five numbers are the "ratio" task.md talks about. Nudge enemy weights up
//     for a harsher curve, player weights up to keep pace. Keep enemy > player for each pair.
const ENEMY_SPEED_WEIGHT = 1.0;         // +100% enemy speed at factor 1
const ENEMY_SPAWN_DELAY_WEIGHT = 0.6;   // -60% spawn delay at factor 1 (enemies appear sooner)
const PLAYER_MOVE_SPEED_WEIGHT = 0.4;   // +40% hop speed at factor 1 (slower than enemies)
const ATTACK_COOLDOWN_WEIGHT = 0.4;     // -40% cooldown at factor 1 (attacks more often)
const ATTACK_RADIUS_WEIGHT = 0.3;       // +30% range at factor 1 (slightly larger ring)

// --- Floors ----------------------------------------------------------------
// The two parameters that *decrease* with difficulty must never hit zero (or go negative), which
// would spawn an unbounded number of enemies per frame or allow an attack every frame. These are
// the only safety rails, since the factor itself is deliberately uncapped.
//   TODO (tuning): raise the spawn floor if the end-game feels like a swarm; raise the cooldown
//     floor if the power becomes spam.
const MIN_ENEMY_SPAWN_DELAY = 0.5; // seconds; fastest the spawner will ever go
const MIN_ATTACK_COOLDOWN = 0.2;   // seconds; fastest the attack will ever recharge

// --- Current values (recomputed every frame by updateDifficulty) ------------
let factor = 0;
let enemySpeed = BASE_ENEMY_SPEED;
let enemySpawnDelay = BASE_ENEMY_SPAWN_DELAY;
let playerMoveSpeed = BASE_PLAYER_MOVE_SPEED;
let attackCooldown = BASE_ATTACK_COOLDOWN;
let attackRadius = BASE_ATTACK_RADIUS;

// Recomputes every scaled parameter from the current score. Called once per frame by main.js.
//
// Every formula is `base * (1 +/- factor * weight)` — a straight line in the factor, as the spec
// requires ("adjust the complexity parameters linearly in proportion to the factor"). Increasing
// parameters add; the two that should shrink subtract and are clamped by their floors.
export function updateDifficulty() {
  factor = getExactScore() * COMPLEXITY_GROWTH_RATE;

  // Enemies (scale faster): speed up, spawn sooner.
  enemySpeed = BASE_ENEMY_SPEED * (1 + factor * ENEMY_SPEED_WEIGHT);
  enemySpawnDelay = Math.max(
    MIN_ENEMY_SPAWN_DELAY,
    BASE_ENEMY_SPAWN_DELAY * (1 - factor * ENEMY_SPAWN_DELAY_WEIGHT),
  );

  // Player (scale slower, so the challenge holds): hop faster, attack sooner and a touch wider.
  playerMoveSpeed = BASE_PLAYER_MOVE_SPEED * (1 + factor * PLAYER_MOVE_SPEED_WEIGHT);
  attackCooldown = Math.max(
    MIN_ATTACK_COOLDOWN,
    BASE_ATTACK_COOLDOWN * (1 - factor * ATTACK_COOLDOWN_WEIGHT),
  );
  attackRadius = BASE_ATTACK_RADIUS * (1 + factor * ATTACK_RADIUS_WEIGHT);
}

// --- Getters (read by the game systems each frame) --------------------------
// These are the "apply the updated speeds and delays to the respective game systems" half of the
// spec: each system asks for its current value instead of holding a fixed constant.
// TODO (debug): getDifficultyFactor() is handy for an on-screen difficulty readout if the balance
//   is ever hard to judge in motion; it is not used by gameplay.

export function getDifficultyFactor() {
  return factor;
}

export function getEnemySpeed() {
  return enemySpeed;
}

export function getEnemySpawnDelay() {
  return enemySpawnDelay;
}

export function getPlayerMoveSpeed() {
  return playerMoveSpeed;
}

export function getAttackCooldown() {
  return attackCooldown;
}

export function getAttackRadius() {
  return attackRadius;
}
