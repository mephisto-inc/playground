const WAVES = [
  {
    duration: 30,
    pool: ["fighter", "ranged"],
    spawnInterval: 0.5,
    clearBonusMul: 500,
  },
  {
    duration: 30,
    pool: ["fighter", "ranged", "speeder"],
    spawnInterval: 0.3,
    clearBonusMul: 500,
  },
  {
    duration: Infinity,
    pool: [],
    spawnInterval: 0.5,
    boss: "start",
    bossHp: 80,
    bossSpeedMul: 0.7,
    bossOrbSpeedMul: 1.0,
    bossSpawnRate: 0.3,
    clearBonusMul: 500,
  },
  {
    duration: 30,
    pool: ["fighter", "ranged", "speeder", "tank"],
    spawnInterval: 0.3,
    clearBonusMul: 500,
  },
  {
    duration: Infinity,
    pool: ["fighter", "ranged", "speeder", "tank"],
    spawnInterval: 0.3,
    spawnIntervalMin: 0.2,
    rampSeconds: 300,
    boss: "start",
    bossHp: 180,
    bossSpeedMul: 0.77,
    bossOrbSpeedMul: 1.1,
    bossKnockbackImmune: true,
    bossHpRage: true,

    bossRespawnScore: 1000,
    clearBonusMul: 0,
  },
];

export const TOTAL_WAVES = WAVES.length;

export function getWaveDef(wave) {
  return WAVES[wave - 1];
}
