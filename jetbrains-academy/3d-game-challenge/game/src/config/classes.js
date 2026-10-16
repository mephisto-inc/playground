// Class definitions. Pure data: each entry describes one starter class and the numbers its
// ability runs on. Player.js turns these into live stats (see Player.getAbilityValues), the UI
// reads name/icon/description (an array of compact bullet lines, rendered as a list by the
// character-select card and the compendium row).

import {ABILITY, PLAYER, TRAIL} from './tuning.js';

// The three starter classes. `hearts` is the starting HP for the class: Pusher/Dasher start at
// PLAYER.baseHearts; Anchor starts two hearts lower (its minions compensate). Every class can
// grow up to the global 7-heart cap with Titan Heart cards.
export const CLASSES = [
    {
        id: 'pusher',
        name: 'Pusher',
        icon: '🛡️',
        hearts: PLAYER.baseHearts,
        // Every bullet interpolates the live value from tuning.js, so this text can never drift
        // from the actual balance.
        description: [
            `Double click/tap: ${ABILITY.pushShield} s shield that blocks physical damage`,
            `Reflects projectiles within ${ABILITY.pushReflectRadius} units for ${ABILITY.pushReflectDamage} damage`,
            `On a block: shockwave (${ABILITY.pushShockwaveRadius} units) for ${ABILITY.pushShockwaveBaseDamage} + HP, stuns ${ABILITY.pushStun} s, shoves enemies ${ABILITY.pushKnockback} units (not Tanks)`,
            `${ABILITY.pushCooldown} s cooldown`,
        ],
        ability: {
            // Shield window and numbers live in tuning.js so balance stays in one place; the
            // gameplay systems read this block through Player.getAbilityValues().
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
        id: 'dasher',
        name: 'Dasher',
        icon: '⚡',
        hearts: PLAYER.baseHearts,
        description: [
            `Double click/tap: dash ${ABILITY.dashDistance} units, +${ABILITY.dashExtraIFrames} s extra i-frames, ${ABILITY.dashCloneCount} shadow clones`,
            `Leaves a damaging trail: ${ABILITY.trailBaseDuration} s + ${ABILITY.trailPerHeart} s per heart`,
            `Trail tick: ${TRAIL.damageBase} + ${TRAIL.damagePerHeart}/heart damage`,
            `${ABILITY.dashCooldown} s cooldown`,
        ],
        ability: {
            // Dash movement, clone look and trail life/width; all read from tuning.js.
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
        id: 'anchor',
        name: 'Anchor',
        icon: '🤖',
        hearts: PLAYER.baseHearts - 2,
        description: [
            `Passive: ${ABILITY.minionCount} orbiting minions with extra vision that copy your power-ups`,
            `${ABILITY.minionDamage} damage every ${ABILITY.minionInterval} s`,
        ],
        ability: {
            // Anchor has no active ability; these values drive the orbiting companions.
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

// Looks a class up by id; returns undefined for an unknown id (callers validate before use).
export function getClass(id) {
    return CLASSES.find((entry) => entry.id === id);
}
