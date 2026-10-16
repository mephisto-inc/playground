// Enemy and Boss definitions (GDD 4B + 8A). Pure data: stats, model files and the animation
// clip names the entity modules try to play. The GDD fixes HP / speed / score / behavior; the
// model-to-type pairing is ours (TODO below) because the asset table does not map models to
// types explicitly.
// Round 5: every non-ranged type (fighter, speeder, tank) got +20% HP and speed. HP stays
// integer (the game's health is whole numbers), so the +20% was rounded up: fighter 2 -> 3,
// speeder 1 -> 2, tank 8 -> 10. The Ranged type and the Boss keep their GDD values.

// The four common enemy types, keyed by type id. `behavior` selects the AI routine in Enemy.js:
//   'chase'   — straight line toward the player (Fighter)
//   'ranged'  — keeps its distance and fires projectiles (Ranged)
//   'speeder' — short, frequent zig-zag dashes (Speeder)
//   'tank'    — slow, knockback-immune, blocks shots aimed through it (Tank)
// Model pairing and clip names come from GDD section 8A:
//   Fighter = Armabee (42djT5zJnx), Ranged = Enemy Flying (kzpT6fNmM5),
//   Speeder = Squidle (54QyRcsogk), Tank = Armabee Evolved (GcttdvsqsQ).
// NOTE: the GDD's clip names are not always what the GLBs ship — the speeder and tank have no
// 'Push' clip (their files ship Headbutt/Punch instead) and the boss ships Idle and Dance as
// separate clips plus Jump and Bite_Front. The names below use what the files really have.
// `yawOffset` turns each model's local forward onto its movement direction. PI/2 matches the
// rig conventions of the previous codebase; TODO: verify each model visually and adjust — a
// wrong offset shows up as an enemy flying sideways.
export const ENEMY_TYPES = {
    fighter: {
        id: 'fighter',
        name: 'Fighter',
        model: '/assets/42djT5zJnx.glb',
        hp: 3, // round 5: +20% from 2, rounded up for integer health
        speedMul: 1.3, // round 5: 1.2 + 20%
        score: 20,
        targetHeight: 1.3,
        yawOffset: Math.PI / 2,
        behavior: 'chase',
        // Clip names from GDD 8A; findClip() tolerates naming differences and falls back.
        moveClip: 'Fast_Flying',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    ranged: {
        id: 'ranged',
        name: 'Ranged',
        model: '/assets/kzpT6fNmM5.glb',
        hp: 1,
        speedMul: 0.8,
        score: 30,
        targetHeight: 1.4,
        yawOffset: Math.PI / 2,
        behavior: 'ranged',
        moveClip: 'Fast_Flying',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    speeder: {
        id: 'speeder',
        name: 'Speeder',
        model: '/assets/54QyRcsogk.glb',
        hp: 2, // round 5: +20% from 1, rounded up (now takes two base shots to kill)
        speedMul: 2.3, // round 5: 1.8 + 20%
        score: 25,
        targetHeight: 1.1,
        yawOffset: Math.PI / 2,
        behavior: 'speeder',
        moveClip: 'Flying_Idle',
        attackClip: 'Punch', // substitute for the GDD's "Push" (not shipped) — TODO: try Headbutt
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    tank: {
        id: 'tank',
        name: 'Tank',
        model: '/assets/GcttdvsqsQ.glb',
        hp: 10, // round 5: +20% from 8, rounded up for integer health
        speedMul: 0.6, // round 5: 0.5 + 20% (0.6 keeps the multiplier fractional; only HP/damage
                       // are integer — speed is a continuous stat)
        score: 80,
        targetHeight: 2.0,
        yawOffset: Math.PI / 2,
        behavior: 'tank',
        moveClip: 'Flying_Idle',
        attackClip: 'Punch', // substitute for the GDD's "Push" (not shipped) — TODO: try Headbutt
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
};

// The Arena Lord boss (GDD 4B + 8A: Pigeon, 9NGlBTpDEr.glb).
export const BOSS_TYPE = {
    id: 'boss',
    name: 'Arena Lord',
    model: '/assets/9NGlBTpDEr.glb',
    targetHeight: 3.5, // ~2.5x a common enemy (GDD: "Size 2.5x")
    score: 1000,      // points for the kill (GDD 6C)
    // Same rig family as the mobs; TODO: verify visually like the enemy yaw offsets.
    yawOffset: Math.PI / 2,
    moveClip: 'Walk',
    // GDD 8A writes "Idle/Dance" — the file ships both; Idle reads calmer while charging the
    // volley. TODO: try Dance if the pigeon should feel goofier.
    idleClip: 'Dance',
    // GDD 8A writes "Jump+Bit_Front": both clips are used — Jump wind-ups the dash telegraph,
    // Bite_Front pecks out the orb volley (played in Boss.fireOrbVolley).
    attackClip: 'Jump',
    volleyClip: 'Bite_Front',
    hitClip: 'HitRecieve',        // NOTE: exact clip name as written in GDD 8A
    deathClip: 'Death',
};
