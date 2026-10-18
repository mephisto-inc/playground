import {ENEMY, PLAYER} from "./tuning.js";

const pct = (fraction) => Math.round(fraction * 100);
const QUICK_TRIGGER = {fireRateMul: 1.25};
const MULTI_SHOT = {projectilesAdd: 1};
const PIERCING = {pierceAdd: 2};
const JUMP_SNEAKERS = {speedAdd: 0.5};
const HEAVY_AMMO = {damageAdd: 2};
const TACTICAL_VISION = {rangeMul: 1.3};
const TITAN_HEART = {maxHeartsAdd: 1, heal: 2};
const SCALED_SKIN = {iFramesSet: 3};
const POINT_MAGNET = {magnetMul: 5};
const CRITICAL_HIT = {critChanceAdd: 0.15};
const THORN_SKIN = {thornsDamage: 2};
const BERSERK = {berserkPerMissingHeart: 0.5};
const TRAIL_MASTER = {
  trailDurationAdd: 1, trailWidthMul: 1.25, trailDamageMul: 3,
};
const FROST_SHOT = {slowOnHitMul: 0.6, slowOnHitDuration: 1};
const BIG_BULLETS = {bulletRadiusMul: 2.5};
const EVASION = {dodgeChanceAdd: 0.15};
const RECKLESS = {damageAdd: 5, maxHeartsAdd: -1};
const OVERFLOW = {projectilesAdd: 2, fireRateMul: 0.75};

export const POWERUPS = [{
  id: "quickTrigger",
  icon: "⚡",
  name: "Quick Trigger",
  description: `+${pct(QUICK_TRIGGER.fireRateMul - 1)}% fire rate.`,
  effect: QUICK_TRIGGER,
}, {
  id: "multiShot",
  icon: "🎯",
  name: "Multi-Shot",
  description: `+${MULTI_SHOT.projectilesAdd} projectile per volley.`,
  effect: MULTI_SHOT,
}, {
  id: "piercing",
  icon: "💥",
  name: "Piercing",
  description: `Each projectile pierces +${PIERCING.pierceAdd} targets.`,
  effect: PIERCING,
}, {
  id: "jumpSneakers",
  icon: "👟",
  name: "Jump Sneakers",
  description: `+${pct(JUMP_SNEAKERS.speedAdd)}% movement speed.`,
  effect: JUMP_SNEAKERS,
}, {
  id: "heavyAmmo",
  icon: "🗡️",
  name: "Heavy Ammo",
  description: `+${HEAVY_AMMO.damageAdd} damage per shot.`,
  effect: HEAVY_AMMO,
}, {
  id: "tacticalVision",
  icon: "👁️",
  name: "Tactical Vision",
  description: `+${pct(TACTICAL_VISION.rangeMul - 1)}% auto-shooter range.`,
  effect: TACTICAL_VISION,
}, {
  id: "titanHeart",
  icon: "💖",
  name: "Titan Heart",
  description: `+${TITAN_HEART.heal} HP and +${TITAN_HEART.maxHeartsAdd} max HP (max ${PLAYER.maxHearts}). Still heals at ${PLAYER.maxHearts} hearts.`,
  effect: TITAN_HEART,
}, {
  id: "scaledSkin",
  icon: "🛡️",
  name: "Scaled Skin",
  description: `Invulnerability after a hit becomes ${SCALED_SKIN.iFramesSet} s.`,
  effect: SCALED_SKIN,
}, {
  id: "pointMagnet",
  icon: "🧲",
  name: "Point Magnet",
  description: `x${POINT_MAGNET.magnetMul} pickup attraction radius (hearts and power-up drops).`,
  effect: POINT_MAGNET,
}, {
  id: "healthy",
  icon: "🩸",
  name: "Healthy",
  description: `Health drop chance goes from ${ENEMY.baseDropChance * 100}% to ${ENEMY.HealthyDropChance * 100}%.`,
  effect: {dropChanceSet: ENEMY.HealthyDropChance},
},

  {
    id: "criticalHit",
    icon: "🎯",
    name: "Critical Hit",
    description: `${pct(CRITICAL_HIT.critChanceAdd)}% chance for a hit to deal double damage (shots, shockwave, trail).`,
    effect: CRITICAL_HIT,
  }, {
    id: "thornSkin",
    icon: "🌵",
    name: "Thorn Skin",
    description: `Common enemies that hurt you by touch take ${THORN_SKIN.thornsDamage} damage.`,
    effect: THORN_SKIN,
  }, {
    id: "berserk",
    icon: "😤",
    name: "Berserk",
    description: `+${BERSERK.berserkPerMissingHeart} damage per shot for every missing heart.`,
    effect: BERSERK,
  }, {
    id: "concussiveShots",
    icon: "💨",
    name: "Concussive Shots",
    description: "Shots knock common enemies back.",
    effect: {shotKnockback: 2.5},
  }, {
    id: "trailMaster",
    icon: "🌀",
    name: "Trail Master",
    description: `Trail lasts +${TRAIL_MASTER.trailDurationAdd} s, is ${pct(TRAIL_MASTER.trailWidthMul - 1)}% wider and deals ${TRAIL_MASTER.trailDamageMul}x damage.`,

    effect: TRAIL_MASTER,
  }, {
    id: "frostShot",
    icon: "❄️",
    name: "Frost Shot",
    description: `Hits slow common enemies by ${pct(1 - FROST_SHOT.slowOnHitMul)}% for ${FROST_SHOT.slowOnHitDuration} s.`,
    effect: FROST_SHOT,
  }, {
    id: "bigBullets",
    icon: "⚪",
    name: "Big Bullets",
    description: `+${pct(BIG_BULLETS.bulletRadiusMul - 1)}% bullet size (visuals and hitbox).`,
    effect: BIG_BULLETS,
  }, {
    id: "evasion",
    icon: "🍀",
    name: "Evasion",
    description: `${pct(EVASION.dodgeChanceAdd)}% chance to ignore an incoming hit.`,
    effect: EVASION,
  }, {
    id: "reckless",
    icon: "💢",
    name: "Reckless",
    description: `+${RECKLESS.damageAdd} damage per shot, but ${RECKLESS.maxHeartsAdd} max heart.`,
    effect: RECKLESS,
  }, {
    id: "overflow",
    icon: "🌊",
    name: "Overflow",
    description: `+${OVERFLOW.projectilesAdd} projectiles per volley, but ${pct(1 - OVERFLOW.fireRateMul)}% slower fire rate.`,
    effect: OVERFLOW,
  },];

export function getPowerup(id) {
  return POWERUPS.find((card) => card.id === id);
}
