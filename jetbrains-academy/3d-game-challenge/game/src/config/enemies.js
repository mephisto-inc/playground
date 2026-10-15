// Enemy and Boss definitions (GDD 4B + 8A). Pure data: stats, model files and the animation
// clip names the entity modules try to play. The GDD fixes HP / speed / score / behavior; the
// model-to-type pairing is ours (TODO below) because the asset table does not map models to
// types explicitly.

// The four common enemy types, keyed by type id. `behavior` selects the AI routine in Enemy.js:
//   'chase'   — straight line toward the player (Runner)
//   'ranged'  — keeps its distance and fires projectiles (Ranged)
//   'speeder' — short, frequent zig-zag dashes (Speeder)
//   'tank'    — slow, knockback-immune, blocks shots aimed through it (Tank)
// Model pairing and clip names come from GDD section 8A:
//   Runner = Armabee (42djT5zJnx), Ranged = Enemy Flying (kzpT6fNmM5),
//   Speeder = Squidle (54QyRcsogk), Tank = Armabee Evolved (GcttdvsqsQ).
// `yawOffset` turns each model's local forward onto its movement direction. PI/2 matches the
// rig conventions of the previous codebase; TODO: verify each model visually and adjust — a
// wrong offset shows up as an enemy flying sideways.
export const ENEMY_TYPES = {
    runner: {
        id: 'runner',
        name: 'Runner',
        model: '/assets/42djT5zJnx.glb',
        hp: 2,
        speedMul: 1.2,
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
        hp: 3,
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
        hp: 1,
        speedMul: 1.8,
        score: 25,
        targetHeight: 1.1,
        yawOffset: Math.PI / 2,
        behavior: 'speeder',
        moveClip: 'Flying_Idle',
        attackClip: 'Push',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    tank: {
        id: 'tank',
        name: 'Tank',
        model: '/assets/GcttdvsqsQ.glb',
        hp: 8,
        speedMul: 0.5,
        score: 80,
        targetHeight: 2.0,
        yawOffset: Math.PI / 2,
        behavior: 'tank',
        moveClip: 'Flying_Idle',
        attackClip: 'Push',
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
    idleClip: 'Idle/Dance',
    attackClip: 'Jump+Bit_Front', // NOTE: exact clip name as written in GDD 8A
    hitClip: 'HitRecieve',        // NOTE: exact clip name as written in GDD 8A
    deathClip: 'Death',
};
