import {ABILITY, PLAYER, TRAIL} from "./tuning.js";

export const CLASSES = [
  {
    id: "pusher",
    name: "Pusher",
    icon: "🛡️",
    hearts: PLAYER.baseHearts,
    description: [
      `Double click/tap: activates a shield that blocks hits`,
      `If sucessfully, sends shots back, stuns and pushes enemies away`,
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
      `Double click/tap: dash while safe`,
      `Trail deals ${TRAIL.damageBase} damage per heart`,
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
      `Each deals ${ABILITY.minionDamage} damage`,
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
