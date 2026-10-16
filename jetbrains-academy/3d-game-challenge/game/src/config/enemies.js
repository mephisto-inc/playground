// Enemy and Boss definitions. Pure data: stats, model files and the animation clip names the
// entity modules try to play. The model-to-type pairing and the clip names below are what the
// files really ship (findClip() also tolerates small naming differences).

// The four common enemy types, keyed by type id. `behavior` selects the AI routine in Enemy.js:
//   'chase'   — straight line toward the player (Fighter)
//   'ranged'  — keeps its distance and fires projectiles (Ranged)
//   'speeder' — short, frequent zig-zag dashes (Speeder)
//   'tank'    — slow, knockback-immune, blocks shots aimed through it (Tank)
// Model pairing: Fighter = Armabee (42djT5zJnx), Ranged = Enemy Flying (kzpT6fNmM5),
// Speeder = Squidle (54QyRcsogk), Tank = Armabee Evolved (GcttdvsqsQ).
// `yawOffset` turns each model's local forward onto its movement direction. PI/2 matches the
// rig conventions and was verified visually for every model (a wrong offset shows up as an
// enemy flying sideways).
export const ENEMY_TYPES = {
    fighter: {
        id: 'fighter',
        model: '/assets/42djT5zJnx.glb',
        hp: 3,
        speedMul: 1.3, // multiplier on ENEMY.baseSpeed
        score: 20,
        targetHeight: 1.3, // model height in world units; the hitbox is measured from the model
        yawOffset: Math.PI / 2,
        behavior: 'chase',
        moveClip: 'Fast_Flying',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    ranged: {
        id: 'ranged',
        model: '/assets/kzpT6fNmM5.glb',
        hp: 1,
        speedMul: 0.8,
        score: 30,
        // The model and its measured hitbox grow together, because the hitbox is measured from
        // the model at this height.
        targetHeight: 1.54,
        yawOffset: Math.PI / 2,
        behavior: 'ranged',
        moveClip: 'Fast_Flying',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    speeder: {
        id: 'speeder',
        model: '/assets/54QyRcsogk.glb',
        hp: 2, // takes two base shots to kill
        speedMul: 2.3,
        score: 25,
        targetHeight: 1.1,
        yawOffset: Math.PI / 2,
        behavior: 'speeder',
        moveClip: 'Flying_Idle',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
    tank: {
        id: 'tank',
        model: '/assets/GcttdvsqsQ.glb',
        hp: 10,
        speedMul: 0.6, // fractional on purpose: only HP and damage are whole numbers
        score: 80,
        targetHeight: 2.0,
        yawOffset: Math.PI / 2,
        behavior: 'tank',
        moveClip: 'Flying_Idle',
        attackClip: 'Headbutt',
        hitClip: 'HitReact',
        deathClip: 'Death',
    },
};

// The Arena Lord boss (Pigeon, 9NGlBTpDEr.glb).
export const BOSS_TYPE = {
    model: '/assets/9NGlBTpDEr.glb',
    targetHeight: 3.5, // ~2.5x a common enemy; the hitbox is measured from the model
    score: 1000,       // points for the kill
    // Same rig family as the mobs; the offset was verified visually like the enemies' ones.
    yawOffset: Math.PI / 2,
    moveClip: 'Walk',
    // The file ships Idle and Dance as separate clips; the pigeon deliberately uses Dance as its
    // idle loop (while charging the volley).
    idleClip: 'Dance',
    // Jump wind-ups the dash telegraph and the quick attacks (shockwave/summon); Bite_Front pecks
    // out the orb volley and the spiral storm (see Boss.startRandomAttack).
    attackClip: 'Jump',
    volleyClip: 'Bite_Front',
    hitClip: 'HitRecieve', // NOTE: misspelled in the file; keep the exact name
    deathClip: 'Death',
};
