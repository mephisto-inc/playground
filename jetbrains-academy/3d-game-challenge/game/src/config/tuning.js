// Central tuning file: every number the GDD marks as tunable (section 9) plus the values the
// GDD leaves open but that the implementation had to pick. Systems read these instead of
// hard-coding magic numbers, so a balance pass touches only this file.

// --- Arena (GDD 5) -----------------------------------------------------------
// The playfield is 60 x 40 world units on the X/Y (ground) plane, everything at Z = 0.
export const ARENA = {
    width: 60,               // X extent, in world units
    depth: 40,               // Y extent, in world units
    area: 60 * 40,           // 2,400 square units — the reference the enemy cap is based on
    tileSize: 2.5,           // checkerboard square size; not specified by the GDD
    wallThickness: 2,        // invisible boundary wall depth (colliders only)
    backdropSize: 4000,      // dark plane under the floor, sized to always fill the view
    backdropZ: -1,           // slightly below the floor so the two never z-fight
    backdropColor: 0x111111, // near-black void beyond the arena
    checkerDark: '#228B22',  // Dark Green (kept from the previous map look)
    checkerLight: '#90EE90', // Light Green
};

// Spawn points (GDD 5: "8 invisible spawn points on the outer edge, behind the houses").
// Two per corner house: one on the edge beside it and one on the edge behind it, so an enemy
// entering the arena always steps out from behind a house instead of popping into view.
export const SPAWN_POINTS = [
    { x: 28.5, y: 16 }, { x: 26, y: 18.5 },   // NE corner (house at 26, 16)
    { x: -28.5, y: 16 }, { x: -26, y: 18.5 }, // NW corner (house at -26, 16)
    { x: 28.5, y: -16 }, { x: 26, y: -18.5 }, // SE corner (house at 26, -16)
    { x: -28.5, y: -16 }, { x: -26, y: -18.5 }, // SW corner (house at -26, -16)
];

// --- Camera (GDD 3A) ---------------------------------------------------------
// Fixed orthographic camera, diagonal heading (user-confirmed), 55 deg tilt, 38 units up.
export const CAMERA = {
    // Azimuth of the viewpoint around the vertical axis. -45 deg keeps the diagonal look that
    // makes the orthographic projection read as "isometric".
    azimuthDeg: -45,
    tiltDeg: 55,          // angle above the floor (GDD 3A)
    height: 38,           // Z height of the camera (GDD 3A)
    viewWidth: 40,        // camera box width in world units; height follows the screen aspect
    followOffsetMax: 4,   // max units the view leads toward the pointer (GDD 3A)
    followDamping: 5,     // exponential smoothing rate for the follow (higher = tighter)
    near: 0.1,            // near clip; unspecified by the GDD, safe for this scale
    far: 4000,            // far clip; must clear the 4000-unit backdrop's furthest corner
};

// --- Lights (GDD 5) ----------------------------------------------------------
export const LIGHTS = {
    ambientColor: 0xd0e5ff, // light blue
    ambientIntensity: 0.75,
    dirColor: 0xffffff,
    dirIntensity: 1.1,
    dirPosition: { x: 15, y: -20, z: 30 },
    // Shadow camera half-extents: covers the whole 60x40 arena plus a margin so no shadow pops.
    shadowHalfX: 45,
    shadowHalfY: 45,
    shadowNear: 1,
    shadowFar: 120,
};

// --- Player (GDD 4A + user-confirmed heart values) ---------------------------
export const PLAYER = {
    baseHearts: 3,        // Parry/Dasher start here (user override of the GDD's 5)
    maxHearts: 7,         // global cap for every class (GDD 4A)
    targetHeight: 2.4,    // Tode's world height once normalized (GDD fixes no scale)
    baseSpeed: 4,         // ground units per second at "speed 1.0x" (GDD 4A)
    hopDistance: 1.6,     // ground distance covered by one hop
    hopHeight: 1.1,       // peak of the hop's sine arc, in world units
    baseFireCooldown: 0.6, // seconds between shots (GDD 4A)
    baseDamage: 1,        // damage per shot (GDD 4A)
    baseProjectiles: 1,   // shots per volley (GDD 4A)
    basePierce: 0,        // extra targets a shot can hit beyond the first
    baseRange: 14,        // auto-shooter target range; unspecified by the GDD (tunable)
    baseIFrames: 1.0,     // invulnerability after a hit, in seconds (GDD 3C)
    iframeFlashOpacity: 0.5, // player renders at 50% opacity during i-frames (GDD 3C)
    deathAnimDuration: 1.2,  // length of the code-made defeat animation (GDD state 6)
    // The hop's frog-lean (nose-up snap, nose-down hold) — kept from the previous tuning pass.
    leanPerSpeed: 0.06,
    leanMax: 0.5,
};

// --- Movement / input --------------------------------------------------------
export const MOVE = {
    // World units around the hero where the pointer does not move the player (GDD 3B).
    // Must stay above PLAYER.hopDistance, or the hero could overshoot the pointer and oscillate.
    deadzone: 3.5,
};

// --- Enemy combat (GDD 3C, 4B, 6B) -------------------------------------------
export const ENEMY = {
    // Maximum enemies alive at once. Comes from [MAP_SIZE_DEPENDENT] in the GDD: 35 on the
    // 2,400-square-unit arena (~1 enemy per 68.6 square units). Computed so a future arena
    // resize keeps the same density instead of a stale literal.
    maxAlive: Math.round((ARENA.area * 35) / 2400),
    baseSpeed: 3.2,          // world units per second at "speed 1.0x"
    baseDropChance: 0.02,    // 2% health-drop chance per kill (GDD 4B)
    bloodthirstDropChance: 0.10, // 10% with the Bloodthirst card (GDD 6A)
    stunDuration: 1.5,       // seconds common enemies stay stunned after a Parry shockwave
    knockbackDistance: 2.5,  // how far a common enemy is pushed when it touches the player
    hitFlashDuration: 0.08,  // white flash after taking damage, in seconds (GDD 3C)
    deathLinger: 0.9,        // how long a corpse stays to play its Death clip before removal
    // Endless wave-5 growth (GDD 6B): +10% HP and speed per minute, capped at 3x HP / 1.5x speed.
    growthPerMinute: 0.10,
    growthHpCap: 3,
    growthSpeedCap: 1.5,
    // Ranged behavior: it tries to sit at this distance band and fires at the player.
    rangedStandoff: 12,      // preferred distance from the player
    rangedBand: 2,           // +/- band around the standoff where it stops closing
    rangedFireInterval: 2.5, // seconds between projectiles (GDD 4B)
    // Speeder behavior: short zig-zag dashes instead of a straight chase.
    speederDashOn: 0.5,      // seconds of dashing
    speederDashOff: 0.3,     // seconds of rest between dashes
    speederZigzagDeg: 30,    // heading oscillation amplitude
    speederZigzagHz: 2.5,    // oscillation frequency
};

// --- Boss (GDD 4B) -----------------------------------------------------------
export const BOSS = {
    wave3Hp: 50,             // Arena Lord HP in Wave 3
    wave5Hp: 80,             // Arena Lord HP in Wave 5
    speedMul: 0.7,           // speed multiplier against ENEMY.baseSpeed
    targetHeight: 3.5,       // model height in world units (~2.5x a common enemy)
    // Phase A: pause 1.5 s, then fire 8 orbs in a 360-degree circle.
    chargeTime: 1.5,
    orbCount: 8,
    orbDamage: 1,
    phaseAChase: 3.0,        // seconds of chasing between orb volleys (not specified by the GDD)
    // Phase B: red charging dash that deals 2 physical damage.
    dashTelegraph: 0.7,      // seconds the red charge-up is shown before the dash (not specified)
    dashDuration: 0.55,      // seconds the dash itself lasts (not specified)
    dashSpeed: 14,           // world units per second during the dash (not specified)
    dashDamage: 2,           // damage of the dash hit (GDD 4B)
    phaseBChase: 1.5,        // seconds of chasing between dashes (not specified by the GDD)
    heartDropsMin: 1,        // 100% chance to drop 1-2 health items (GDD 4B)
    heartDropsMax: 2,
    knockbackDistance: 2.5,  // how far the shockwave/parry pushes the boss (GDD 4A)
};

// --- Projectiles -------------------------------------------------------------
// The GDD fixes the damage (1 for ranged shots and boss orbs) but not the speeds or sizes.
export const PROJECTILE = {
    playerSpeed: 26,       // player/minion shot speed, world units per second
    playerRadius: 0.35,    // hit radius of a player shot
    playerLifetime: 1.2,   // seconds before a missed shot despawns (range ~31 units)
    enemySpeed: 6,         // ranged-enemy projectile speed (slow enough to dodge)
    enemyRadius: 0.3,
    enemyLifetime: 4,      // seconds alive before despawn; houses block them earlier
    bossOrbSpeed: 5,       // boss orb speed
    bossOrbRadius: 0.35,
    bossOrbLifetime: 5,
    multiShotSpreadDeg: 8, // angular spread between extra projectiles of one volley
    aimLeadFactor: 0.8,    // fraction of the target's travel time the aim leads by
    damage: 1,             // common damage for ranged shots and boss orbs (GDD 3C, 9)
};

// --- Pickups (GDD 4B, 6A) ----------------------------------------------------
export const PICKUP = {
    magnetRadius: 2.2,   // base attraction radius; Point Magnet doubles it
    collectRadius: 0.8,  // distance at which a heart is consumed
    bobHeight: 0.3,      // idle bobbing amplitude, purely cosmetic
    bobHz: 1.6,
    heal: 1,             // hearts restored per pickup (GDD: 1-2 items drop, each heals 1)
    lifetime: 30,        // seconds before an uncollected heart fades away (not in the GDD)
};

// --- Power-up draft (GDD 6A) -------------------------------------------------
export const DRAFT = {
    cardsShown: 3,       // cards drawn per draft
    reshuffleAllowed: 1, // reshuffles per run (GDD: once per game)
};

// --- Audio (GDD 2 + 9) -------------------------------------------------------
export const AUDIO = {
    masterVolumeDefault: 0.7, // initial master volume; persisted in localStorage
    lowPassHz: 400,           // the "muffled" filter frequency (GDD 2)
    // GDD 9 leaves the boss_step3 fade length to the editor. Two constants: a snappy crossfade
    // for ordinary step changes (user-approved) and the longer one for bgm_boss_step3 swaps.
    crossfadeSnappy: 0.15,
    crossfadeLong: 1.0,
    trackLength: 9,           // seconds; every bgm_* track except bgm_boss_step3 (GDD 2B)
    bossStep3Length: 19,      // seconds; bgm_boss_step3.wav (GDD 2B)
};

// --- Class abilities (GDD 4A) ------------------------------------------------
export const ABILITY = {
    // Parry
    parryCooldown: 4.0,        // seconds
    parryShield: 0.4,          // seconds the shield stays up
    parryReflectRadius: 2.2,   // shield circle that flips hostile projectiles (not in the GDD)
    parryShockwaveRadius: 8,   // not specified by the GDD; sized to catch nearby enemies
    parryShockwaveBaseDamage: 3, // shockwave damage is 3 + current HP
    parryStun: ENEMY.stunDuration,
    // Dasher
    dashCooldown: 3.0,         // seconds
    dashDistance: 6,           // world units covered instantly
    dashExtraIFrames: 0.5,     // extra invulnerability after dashing, in seconds
    dashCloneCount: 3,         // shadow clones left along the path (cosmetic)
    dashCloneLife: 0.35,       // seconds each clone takes to fade
    trailBaseDuration: 2.0,    // trail life = base + per-heart bonus seconds
    trailPerHeart: 0.5,
    trailWidth: 1.6,           // world units across the slow zone
    trailSlowCommon: 0.5,      // common enemy speed multiplier inside the trail (50% slow)
    trailSlowBoss: 0.75,       // boss speed multiplier inside the trail (25% slow)
    // Anchor
    minionCount: 2,            // two orbiting minions
    minionOrbitRadius: 1.7,    // world units from the player
    minionOrbitSpeed: 1.6,     // radians per second
    minionHeight: 1.2,         // Z height of the orbit (they float)
    minionDamage: 0.5,         // base damage per shot
    minionInterval: 1.2,       // seconds between shots
    minionRangeMul: 1.5,       // 50% more vision range than the player
};
