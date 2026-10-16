// Wave definitions (GDD 6B). Pure data: durations, enemy pools, spawn pacing and the two boss
// waves. Waves.js runs these; the values the GDD leaves open (spawn intervals) are tuning TODOs.
// Round 4: every spawn interval (wave 5's ramp minimum included) was tripled in rate (x3) — the
// user's "+200%" — so the arena keeps constant pressure.

// Each wave entry:
//   wave           — 1-based number (the GDD calls the last one "Wave 5 (Endless)")
//   duration       — seconds; Infinity for the waves that end on a condition instead
//   pool           — enemy type ids that may spawn
//   spawnInterval  — seconds between spawn attempts (not specified by the GDD; tunable)
//   boss           — 'start' when the Arena Lord appears at wave start
//   bossHp         — HP for that wave's boss (GDD 4B says 50/80; user override: 10x = 500/800,
//                    halved in round 5 to 250/400)
//   bossSpeedMul   — the boss's speed multiplier that wave (round 5: wave 5 runs 10% faster than
//                    wave 3; BOSS.speedMul in tuning.js is the wave-3 base)
//   bossOrbSpeedMul — multiplier on the boss's orb speed that wave (round 5: wave 5 = 1.1x wave 3)
//   bossSpawnRate  — spawn-rate multiplier while the boss lives (GDD: -70% in wave 3)
//   bossRespawnScore — wave 5: score earned after the boss dies before the next one spawns
//   rampTo         — wave 5 only: spawn interval it ramps down to (endless pressure)
//   rampSeconds    — wave 5 only: seconds taken to reach the ramped interval
//   clearBonusMul  — wave clear bonus per wave number (500 x wave), waves 1-4 only
export const WAVES = [
    {
        wave: 1,
        duration: 20,
        pool: ['fighter', 'ranged'],
        spawnInterval: 0.5,
        clearBonusMul: 500,
    },
    {
        wave: 2,
        duration: 30,
        pool: ['fighter', 'ranged', 'speeder'],
        spawnInterval: 0.3,
        clearBonusMul: 500,
    },
    {
        wave: 3,
        // Ends when the boss dies, not on a timer (duration = Infinity marks that).
        duration: Infinity,
        pool: [],
        spawnInterval: 0.5,
        boss: 'start',
        bossHp: 80, // GDD's 50 x5 (user: 10x, then halved in round 5 — the fight felt long)
        bossSpeedMul: 0.7,    // base boss speed (mirrors BOSS.speedMul in tuning.js)
        bossOrbSpeedMul: 1.0, // orb speed reference: wave 5 fires 10% faster than this
        // GDD: enemy spawn rate goes down by 70% during the boss fight (30% of normal).
        bossSpawnRate: 0.3,
        clearBonusMul: 500,
    },
    {
        wave: 4,
        duration: 30,
        pool: ['fighter', 'ranged', 'speeder', 'tank'],
        spawnInterval: 0.3,
        clearBonusMul: 500,
    },
    {
        wave: 5,
        duration: Infinity,
        pool: ['fighter', 'ranged', 'speeder', 'tank'],
        spawnInterval: 0.3,
        spawnIntervalMin: 0.2, // ramps down over `rampSeconds` for endless pressure
        rampSeconds: 300,
        boss: 'start',
        bossHp: 180, // GDD's 80 x5 (user: 10x, then halved in round 5; growth can raise it 3x more)
        bossSpeedMul: 0.77,   // round 5: +10% over wave 3's 0.7
        bossOrbSpeedMul: 1.1, // round 5: +10% over wave 3's orbs (which already run at 15)
        // GDD: after the boss dies, the next one spawns once 1,000 score is earned.
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
