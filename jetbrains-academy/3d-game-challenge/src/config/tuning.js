export const ARENA = {
  width: 87.48,
  depth: 58.32,
  floorTile: 3,
  wallThickness: 2,
  backdropSize: 4000,
  backdropZ: -1,

  backdropColor: 0x0d1f12,
};

export const SPAWN_POINTS = [
  {x: 49.74, y: 0},
  {x: -49.74, y: 0},
  {x: 0, y: 35.16},
  {x: 0, y: -35.16},
  {x: 49.74, y: 35.16},
  {x: -49.74, y: 35.16},
  {x: 49.74, y: -35.16},
  {x: -49.74, y: -35.16},
];

export const CAMERA = {
  azimuthDeg: -45,
  tiltDeg: 45,
  height: 38,
  viewWidth: 40,
  followOffsetMax: 4,
  followDamping: 1,
  near: 0.1,
  far: 4000,
};

export const QUALITY = {
  overrideParam: "quality",
  overrides: ["high", "medium", "low"],
  mobileTier: "low",
  desktopTier: "high",
  tiers: {
    high: {
      dprCap: 2,
      antialias: true,
      shadows: true,
      shadowMapSize: 4096,
      shadowType: "PCFSoft",
      blobShadows: false,
      lambert: false,
    },
    medium: {
      dprCap: 1.5,
      antialias: true,
      shadows: true,
      shadowMapSize: 1024,
      shadowType: "PCF",
      blobShadows: false,
      lambert: false,
    },
    low: {
      dprCap: 1.25,
      antialias: false,
      shadows: false,
      shadowMapSize: 512,
      shadowType: "PCF",
      blobShadows: true,
      lambert: true,
    },
  },
  autoDowngrade: {
    targetFps: 30,
    windowMs: 5_000,
    stepCooldownMs: 5_000,
    minDprCap: 1,
    dprStep: 0.25,
    minShadowMapSize: 512,
  },
};

export const LIGHTS = {
  ambientColor: 0x8fb3ff,
  ambientIntensity: 0.45,
  dirColor: 0xbfd4ff,
  dirIntensity: 0.955,
  dirPosition: {x: 15, y: -20, z: 30},

  shadowHalfX: 76,
  shadowHalfY: 61,
  shadowNear: 1,
  shadowFar: 120,
};

export const MENU = {
  menuRotationSpeed: 0.12,

  toastLife: 3500,
  toastFade: 300,

  vignetteStrength: 1,
  vignetteColor: "3, 10, 18",

  resetConfirm: 3000,
};

export const TREES = {
  pines: ["rfnxJv0Rqa", "igSu0cPoBz", "79gmlLnweB", "Zt62gceKXZ"],
  twisted: ["9aWlx82xUf", "GVTsMmuzv7", "7PDBpElkQr"],

  pineHeightMin: 3.2,
  pineHeightMax: 4.2,
  twistedHeightMin: 2.5,
  twistedHeightMax: 3.6,

  heightJitterMin: 0.85,
  heightJitterMax: 1.15,

  ringStart: 0.2,
  ringDepth: 12,
  ringAttempts: 6000,
  ringCount: 800,
  minSpacing: 0.7,

  scatterAttempts: 1000,
  scatterCount: 160,
  scatterSpacing: 3,
  houseClearance: 5.5,
  spawnLaneClearance: 3.5,
  centerClearance: 6,
  arenaMargin: 3,

  fadeOpacity: 0.5,
  fadeDuration: 0.25,
  fadeCheckRadius: 10,
  fadeLateral: 1.6,
};

export const HOUSE = {
  houses: [
    {asset: "053kskrV4U_", x: -31.68, y: 18.72},
    {asset: "oJJIRwv6Bo", x: 31.68, y: 18.72},
    {asset: "L7h0SjZX2K", x: -31.68, y: -18.72},
    {asset: "vZ1CLbWmSx", x: 31.68, y: -18.72},
    {asset: "wxi3kAu5ey", x: -9.9, y: 6.3},
  ],
  houseHeight: 4.95,
  houseFadeRadius: 12,
  houseFadeLateral: 4.5,
  houseMaxFootprint: 6.3,
};

export const PLAYER = {
  baseHearts: 5,
  maxHearts: 7,

  targetHeight: 1.0,
  baseSpeed: 4,
  hopDistance: 1.6,
  hopHeight: 1.1,
  baseFireCooldown: 0.6,
  baseDamage: 1,
  baseProjectiles: 1,
  basePierce: 0,
  baseRange: 14,
  baseIFrames: 1.0,
  iframeFlashOpacity: 0.3,
  deathAnimDuration: 1.2,

  leanPerSpeed: 0.06,
  leanMax: 0.5,
};

export const MOVE = {
  deadzone: 4,
  tapMaxMovePx: 10,
  doubleTap: 350,
  doubleTapMaxDist: 50,
};

export const COLLISION = {
  padding: 0.05,
  playerRadiusMul: 0.8,
  enemyRadiusMul: 1,
  bossRadiusMul: 1,
  houseRadiusMul: 0.8,
  projectileRadiusMul: 0.9,
};

export const ENEMY = {
  maxAlive: 200,
  baseSpeed: 3.2,
  baseDropChance: 0.01,
  HealthyDropChance: 0.1,
  stunDuration: 2,
  knockbackDistance: 2.5,
  hitFlashDuration: 0.08,
  deathLinger: 0.9,
  deathFade: 0.7,

  growthPerMinute: 0.1,
  growthSpeedCap: 1.5,

  growthAttackPerMinute: 0.1,

  doomScore: 25000,

  spawnJitter: 1.5,

  silhouetteColor: 0x0a0a0a,
  silhouetteBlend: 0.25,

  rangedStandoff: 12,
  rangedBand: 2,
  rangedFireInterval: 2.5,

  rangedAimLead: 0.8,
  rangedAimError: 1.5,

  speederDashOn: 0.5,
  speederDashOff: 0.3,
  speederZigzagDeg: 30,
  speederZigzagHz: 2.5,
};

export const BOSS = {
  speedMul: 0.7,
  contactDamage: 2,

  chargeTime: 1.5,
  orbCount: 24,
  phaseAChase: 3.0,

  dashTelegraph: 0.7,
  dashDuration: 0.55,
  dashSpeed: 20,
  dashDamage: 4,
  phaseBChase: 1.5,
  heartDropsMin: 1,
  heartDropsMax: 2,
  knockbackDistance: 2.5,
  deathFade: 1.2,
  powerupDropChance: 1,

  attacks: ["volley", "shockwave", "spiral", "summon", "dash"],
  waveColor: 0xc46bff,
  waveArcDeg: 90,
  waveMaxRadius: 22,
  waveSpeed: 20,
  waveSlowMul: 0.75,
  waveSlowDuration: 1,
  spiralDuration: 1.8,
  spiralInterval: 0.12,
  spiralOrbs: 2,
  spiralStepDeg: 24,
  spiralSpeedMul: 0.7,
  summonCount: 3,
  summonTypes: ["speeder", "tank"],
  summonRadius: 1.5,

  hpRageFloor: 0.15,
};

export const PROJECTILE = {
  colors: {
    player: 0xffe14d,
    minion: 0x7dffd4,
    enemy: 0xff5a5a,
    boss: 0xc46bff,
  },
  playerSpeed: 15,
  minionSpeedMul: 2,
  playerRadius: 0.35,
  playerLifetime: 1.733,
  enemySpeed: 4,
  enemyRadius: 0.3,
  enemyLifetime: 6,
  enemyCullMargin: 10,
  bossOrbSpeed: 15,
  bossOrbRadius: 0.35,
  bossOrbLifetime: 5,
  multiShotSpreadDeg: 8,
  aimLeadFactor: 0.8,
  damage: 1,
};

export const PICKUP = {
  magnetRadius: 2.2,
  collectRadius: 0.8,
  pulseAmplitude: 0.18,
  pulseHz: 1.6,
  heal: 1,
  lifetime: 30,

  powerupLifetime: 10,
};

export const TRAIL = {
  color: 0x4dd2ff,
  damageBase: 3,
  damagePerHeart: 1,
  tickInterval: 1,
  tint: 0x4dd2ff,
  tintIntensity: 0.35,
  bossTintIntensity: 0.18,
};

export const DRAFT = {
  cardsShown: 3,
  reshuffleAllowed: 1,
  maxCards: 12,
  inputLock: 400,
};

export const AUDIO = {
  masterVolumeDefault: 0.5,
  lowPassHz: 1200,

  crossfadeSnappy: 0.15,
  crossfadeLong: 1.0,
  trackLength: 9,
  bossStep3Length: 19,
  sfxPanMax: 0.4,
};

export const ABILITY = {
  pushCooldown: 1,
  pushShield: 0.6,
  pushReflectRadius: 7,
  pushShockwaveRadius: 7,
  pushShockwaveBaseDamage: 5,
  pushStun: ENEMY.stunDuration,
  pushReflectDamage: 5,

  pushKnockback: 3,

  pushGlowRadius: 3,
  pushImpactDuration: 0.03,
  pushRingDuration: 0.1,
  pushFailDuration: 0.15,

  dashCooldown: 1,
  dashDistance: 15,
  dashExtraIFrames: 0.5,
  dashCloneCount: 4,
  dashCloneLife: 0.35,
  trailBaseDuration: 1.0,
  trailPerHeart: 0.5,
  trailWidth: 2,

  minionCount: 2,
  minionOrbitRadius: 1.7,
  minionOrbitSpeed: 1.3,
  minionHeight: 1.2,
  minionDamage: 1,
  minionInterval: 0.4444,
  minionRateJitter: 0.15,
  minionRangeMul: 1.5,
};
