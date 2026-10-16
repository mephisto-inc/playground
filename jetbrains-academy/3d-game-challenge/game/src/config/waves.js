// Wave definitions. Pure data: durations, enemy pools, spawn pacing and the two boss waves.
// Waves.js runs these; the spawn intervals are the main pacing knobs.

// Each wave entry:
//   duration         — seconds; Infinity for the waves that end on a condition instead
//   pool             — enemy type ids that may spawn
//   spawnInterval    — seconds between spawn attempts
//   boss             — 'start' when the Arena Lord appears at wave start
//   bossHp           — HP for that wave's boss
//   bossSpeedMul     — the boss's speed multiplier that wave (BOSS.speedMul in tuning.js is the
//                      wave-3 base)
//   bossOrbSpeedMul  — multiplier on the boss's orb speed that wave
//   bossKnockbackImmune — wave 5 only: the boss ignores push knockback (never shoved)
//   bossHpRage       — wave 5 only: attack breathers shrink as the boss's HP drops (none at 10%)
//   bossSpawnRate    — spawn-rate multiplier while the boss lives (enemy pressure during the
//                      boss fight)
//   bossRespawnScore — wave 5: score earned after the boss dies before the next one spawns
//   spawnIntervalMin — wave 5 only: spawn interval it ramps down to (endless pressure)
//   rampSeconds      — wave 5 only: seconds taken to reach the ramped interval
//   clearBonusMul    — wave clear bonus per wave number (500 x wave), waves 1-4 only
export const WAVES = [
    {
        duration: 20,
        pool: ['fighter', 'ranged'],
        spawnInterval: 0.5,
        clearBonusMul: 500,
    },
    {
        duration: 30,
        pool: ['fighter', 'ranged', 'speeder'],
        spawnInterval: 0.3,
        clearBonusMul: 500,
    },
    {
        // Ends when the boss dies, not on a timer (duration = Infinity marks that).
        duration: Infinity,
        pool: [],
        spawnInterval: 0.5,
        boss: 'start',
        bossHp: 80,
        bossSpeedMul: 0.7,    // base boss speed (mirrors BOSS.speedMul in tuning.js)
        bossOrbSpeedMul: 1.0, // orb speed reference: wave 5 fires faster than this
        bossSpawnRate: 0.3,   // enemy spawn rate during the fight: 30% of normal
        clearBonusMul: 500,
    },
    {
        duration: 30,
        pool: ['fighter', 'ranged', 'speeder', 'tank'],
        spawnInterval: 0.3,
        clearBonusMul: 500,
    },
    {
        duration: Infinity,
        pool: ['fighter', 'ranged', 'speeder', 'tank'],
        spawnInterval: 0.3,
        spawnIntervalMin: 0.2, // ramps down over `rampSeconds` for endless pressure
        rampSeconds: 300,
        boss: 'start',
        bossHp: 180, // the boss also scales with the endless growth (uncapped)
        bossSpeedMul: 0.77,   // +10% over wave 3's 0.7
        bossOrbSpeedMul: 1.1, // +10% over wave 3's orbs
        bossKnockbackImmune: true, // the endless boss is unstoppable: pushes only damage it
        bossHpRage: true, // HP-driven rage: the attack breathers vanish as it nears death
        // After the boss dies, the next one spawns once this much score is earned (the kill's
        // own 1,000 points are excluded, since the counter starts at the death moment).
        bossRespawnScore: 1000,
        clearBonusMul: 0, // wave 5 never ends, so it has no clear bonus
    },
];

// Total number of story waves (the endless one included) — used by the HUD banner ("WAVE 3/5").
export const TOTAL_WAVES = WAVES.length;

// Returns the wave definition for a 1-based wave number.
export function getWaveDef(wave) {
    return WAVES[wave - 1];
}
