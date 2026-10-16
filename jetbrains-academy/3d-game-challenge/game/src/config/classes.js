// Class definitions (GDD 4A). Pure data: each entry describes one starter class and the numbers
// its ability runs on. Player.js turns these into live stats; the UI reads name/icon/description.

import {ABILITY, PLAYER} from './tuning.js';

// The three starter classes. `hearts` is the starting HP for the class:
//   Parry/Dasher: 3 (the base — user-confirmed change from the GDD's 5).
//   Anchor: 5 = base 3 + 2 from its passive "+2 max hearts" (user-confirmed; GDD said +1).
// Every class can still grow up to the global 7-heart cap with Titan Heart cards.
export const CLASSES = [
    {
        id: 'parry',
        name: 'Parry',
        icon: '🛡️',
        hearts: PLAYER.baseHearts,
        // The numbers interpolate the live values from tuning.js, so this text can never drift
        // from the actual balance (round 5b: also mentions the reflected shots' damage).
        description: `Double click/tap: raise a ${ABILITY.parryShield} s shield that cancels physical `
            + `damage and reflects every projectile around you straight back at whoever fired it `
            + `(bosses included), each reflected shot dealing ${ABILITY.parryReflectDamage} damage. `
            + `On parry, a shockwave deals ${ABILITY.parryShockwaveBaseDamage} + current HP, stuns `
            + `common enemies for ${ABILITY.parryStun} s and knocks the Boss back. `
            + `${ABILITY.parryCooldown} s cooldown.`,
        ability: {
            // Shield window and cooldown live in tuning.js so balance stays in one place.
            cooldown: ABILITY.parryCooldown,
            shield: ABILITY.parryShield,
            shockwaveRadius: ABILITY.parryShockwaveRadius,
            shockwaveBaseDamage: ABILITY.parryShockwaveBaseDamage,
            stun: ABILITY.parryStun,
        },
    },
    {
        id: 'dasher',
        name: 'Dasher',
        icon: '⚡',
        hearts: PLAYER.baseHearts,
        description: 'Double click/tap: dash instantly with 0.5 s of extra invulnerability and '
            + 'shadow clones. The ground trail lasts 2.0 s + 0.5 s per current heart, slowing '
            + 'common enemies by 50% and the Boss by 25%. 3.0 s cooldown.',
        ability: {
            cooldown: ABILITY.dashCooldown,
            distance: ABILITY.dashDistance,
            extraIFrames: ABILITY.dashExtraIFrames,
            cloneCount: ABILITY.dashCloneCount,
            cloneLife: ABILITY.dashCloneLife,
            trailBaseDuration: ABILITY.trailBaseDuration,
            trailPerHeart: ABILITY.trailPerHeart,
            trailWidth: ABILITY.trailWidth,
            trailSlowCommon: ABILITY.trailSlowCommon,
            trailSlowBoss: ABILITY.trailSlowBoss,
        },
    },
    {
        id: 'anchor',
        name: 'Anchor',
        icon: '🤖',
        hearts: PLAYER.baseHearts - 2, // passive: +2 max hearts (user-confirmed; GDD said +1)
        description: 'Passive: 3 orbiting Minions that always face the camera. '
            + 'Minions have 50% more vision range and copy every power-up you collect. '
            + 'Minion damage: 1 every 2.4 s.',
        ability: {
            // Anchor has no active ability; these values drive the orbiting companions.
            minionCount: ABILITY.minionCount,
            orbitRadius: ABILITY.minionOrbitRadius,
            orbitSpeed: ABILITY.minionOrbitSpeed,
            orbitHeight: ABILITY.minionHeight,
            minionDamage: ABILITY.minionDamage,
            minionInterval: ABILITY.minionInterval,
            rangeMul: ABILITY.minionRangeMul,
        },
    },
];

// Looks a class up by id; returns undefined for an unknown id (callers validate before use).
export function getClass(id) {
    return CLASSES.find((entry) => entry.id === id);
}
