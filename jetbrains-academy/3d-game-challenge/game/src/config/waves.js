// Wave definitions (GDD 6B). Pure data: durations, enemy pools, spawn pacing and the two boss
// waves. Waves.js runs these; the values the GDD leaves open (spawn intervals) are tuning TODOs.

// Each wave entry:
//   wave           — 1-based number (the GDD calls the last one "Wave 5 (Endless)")
//   duration       — seconds; Infinity for the waves that end on a condition instead
//   pool           — enemy type ids that may spawn
//   spawnInterval  — seconds between spawn attempts (not specified by the GDD; tunable)
//   boss           — 'start' when the Arena Lord appears at wave start
//   bossHp         — HP for that wave's boss (GDD 4B: 50 in wave 3, 80 in wave 5)
//   bossSpawnRate  — spawn-rate multiplier while the boss lives (GDD: -70% in wave 3)
//   bossRespawnScore — wave 5: score earned after the boss dies before the next one spawns
//   rampTo         — wave 5 only: spawn interval it ramps down to (endless pressure)
//   rampSeconds    — wave 5 only: seconds taken to reach the ramped interval
//   clearBonusMul  — wave clear bonus per wave number (500 x wave), waves 1-4 only
export const WAVES = [
    {
        wave: 1,
        duration: 45,
        pool: ['runner', 'ranged'],
        spawnInterval: 2.5,
        clearBonusMul: 500,
    },
    {
        wave: 2,
        duration: 60,
        pool: ['runner', 'ranged', 'speeder'],
        spawnInterval: 2.0,
        clearBonusMul: 500,
    },
    {
        wave: 3,
        // Ends when the boss dies, not on a timer (duration = Infinity marks that).
        duration: Infinity,
        pool: ['runner', 'ranged', 'speeder'],
        spawnInterval: 1.8,
        boss: 'start',
        bossHp: 50,
        // GDD: enemy spawn rate goes down by 70% during the boss fight (30% of normal).
        bossSpawnRate: 0.3,
        clearBonusMul: 500,
    },
    {
        wave: 4,
        duration: 75,
        pool: ['runner', 'ranged', 'speeder', 'tank'],
        spawnInterval: 1.2,
        clearBonusMul: 500,
    },
    {
        wave: 5,
        duration: Infinity,
        pool: ['runner', 'ranged', 'speeder', 'tank'],
        spawnInterval: 1.2,
        spawnIntervalMin: 0.6, // ramps down over `rampSeconds` for endless pressure
        rampSeconds: 300,
        boss: 'start',
        bossHp: 80,
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
