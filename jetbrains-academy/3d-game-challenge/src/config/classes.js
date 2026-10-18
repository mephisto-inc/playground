import {ABILITY, PLAYER, TRAIL} from "./tuning.js";

export const CLASSES = [
  {
    id: "pusher",
    name: "Pusher",
    icon: "🛡️",
    hearts: PLAYER.baseHearts,
    description: [
      `Double click/tap: ${ABILITY.pushShield}s shield that blocks hits`,
      `Sends shots back and stuns and pushes enemies away`,
      `${ABILITY.pushCooldown}s cooldown`,
    ],
    ability: {
      cooldown: ABILITY.pushCooldown,
      shield: ABILITY.pushShield,
      reflectRadius: ABILITY.pushReflectRadius,
      reflectDamage: ABILITY.pushReflectDamage,
      shockwaveRadius: ABILITY.pushShockwaveRadius,
      shockwaveBaseDamage: ABILITY.pushShockwaveBaseDamage,
      stun: ABILITY.pushStun,
      knockback: ABILITY.pushKnockback,
    },
  },
  {
    id: "dasher",
    name: "Dasher",
    icon: "⚡",
    hearts: PLAYER.baseHearts,
    description: [
      `Double click/tap: dash ${ABILITY.dashDistance} units, safe while dashing`,
      `Clones and a trail: ${TRAIL.damageBase} + ${TRAIL.damagePerHeart} damage per heart`,
      `${ABILITY.dashCooldown}s cooldown`,
    ],
    ability: {
      cooldown: ABILITY.dashCooldown,
      distance: ABILITY.dashDistance,
      extraIFrames: ABILITY.dashExtraIFrames,
      cloneCount: ABILITY.dashCloneCount,
      cloneLife: ABILITY.dashCloneLife,
      trailBaseDuration: ABILITY.trailBaseDuration,
      trailPerHeart: ABILITY.trailPerHeart,
      trailWidth: ABILITY.trailWidth,
    },
  },
  {
    id: "anchor",
    name: "Anchor",
    icon: "🤖",
    hearts: PLAYER.baseHearts - 2,
    description: [
      `Passive: ${ABILITY.minionCount} minions circle around you`,
      `They copy your power-ups and see farther than you`,
      `Each deals ${ABILITY.minionDamage} damage every ${ABILITY.minionInterval}s`,
    ],
    ability: {
      minionCount: ABILITY.minionCount,
      orbitRadius: ABILITY.minionOrbitRadius,
      orbitSpeed: ABILITY.minionOrbitSpeed,
      orbitHeight: ABILITY.minionHeight,
      minionDamage: ABILITY.minionDamage,
      minionInterval: ABILITY.minionInterval,
      minionRateJitter: ABILITY.minionRateJitter,
      rangeMul: ABILITY.minionRangeMul,
    },
  },
];

export function getClass(id) {
  return CLASSES.find((entry) => entry.id === id);
}
