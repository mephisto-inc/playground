// Class definitions. Pure data: each entry describes one starter class and the numbers its
// ability runs on. Player.js turns these into live stats (see Player.getAbilityValues), the UI
// reads name/icon/description.

import {ABILITY, PLAYER} from './tuning.js';

// The three starter classes. `hearts` is the starting HP for the class: Parry/Dasher start at
// PLAYER.baseHearts; Anchor starts two hearts lower (its minions compensate). Every class can
// grow up to the global 7-heart cap with Titan Heart cards.
export const CLASSES = [
    {
        id: 'parry',
        name: 'Parry',
        icon: '🛡️',
        hearts: PLAYER.baseHearts,
        // The numbers interpolate the live values from tuning.js, so this text can never drift
        // from the actual balance.
        description: `Double click/tap: raise a ${ABILITY.parryShield} s shield that cancels physical `
            + `damage and reflects every projectile within ${ABILITY.parryReflectRadius} units straight `
            + `back at whoever fired it (bosses included), each reflected shot dealing `
            + `${ABILITY.parryReflectDamage} damage. On parry, a shockwave deals `
            + `${ABILITY.parryShockwaveBaseDamage} + current HP, stuns common enemies for `
            + `${ABILITY.parryStun} s and knocks the Boss back. ${ABILITY.parryCooldown} s cooldown.`,
        ability: {
            // Shield window and numbers live in tuning.js so balance stays in one place; the
            // gameplay systems read this block through Player.getAbilityValues().
            cooldown: ABILITY.parryCooldown,
            shield: ABILITY.parryShield,
            reflectRadius: ABILITY.parryReflectRadius,
            reflectDamage: ABILITY.parryReflectDamage,
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
        description: `Double click/tap: dash ${ABILITY.dashDistance} units instantly with `
            + `${ABILITY.dashExtraIFrames} s of extra invulnerability and `
            + `${ABILITY.dashCloneCount} shadow clones. The ground trail lasts `
            + `${ABILITY.trailBaseDuration} s + ${ABILITY.trailPerHeart} s per current heart, slowing `
            + `common enemies by ${Math.round((1 - ABILITY.trailSlowCommon) * 100)}% and the Boss by `
            + `${Math.round((1 - ABILITY.trailSlowBoss) * 100)}%. ${ABILITY.dashCooldown} s cooldown.`,
        ability: {
            // Dash movement, clone look and trail slow/width; all read from tuning.js.
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
        hearts: PLAYER.baseHearts - 2,
        description: `Passive: ${ABILITY.minionCount} orbiting Minions that always face the camera. `
            + 'Minions have way more vision range and copy every power-up you collect. '
            + `Minion damage: ${ABILITY.minionDamage} every ${ABILITY.minionInterval} s.`,
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
