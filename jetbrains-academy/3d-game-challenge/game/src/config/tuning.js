// Central tuning file: every number the GDD marks as tunable (section 9) plus the values the
// GDD leaves open but that the implementation had to pick. Systems read these instead of
// hard-coding magic numbers, so a balance pass touches only this file.

// --- Arena (GDD 5) -----------------------------------------------------------
// The playfield is 97.2 x 64.8 world units on the X/Y (ground) plane, everything at Z = 0.
// (User history: 4x the GDD's original 60 x 40 area, then -10% per side in rounds 4 and 5.)
export const ARENA = {
    width: 97.2,             // X extent, in world units
    depth: 64.8,             // Y extent, in world units
    area: 97.2 * 64.8,       // ~6,299 square units (the GDD's 2,400 reference x2.62)
    floorTile: 3,            // world units covered by one PlaneMesh.png repeat; not in the GDD
    wallThickness: 2,        // invisible boundary wall depth (colliders only)
    backdropSize: 4000,      // dark plane under the floor, sized to always fill the view
    backdropZ: -1,           // slightly below the floor so the two never z-fight
    backdropColor: 0x111111, // near-black void beyond the arena
};

// Spawn points (GDD 5: "8 invisible spawn points on the outer edge, behind the houses").
// Two per corner house: one on the edge beside it and one on the edge behind it, so an enemy
// entering the arena always steps out from behind a house instead of popping into view.
// Re-derived for the round-5 97.2 x 64.8 arena with its relocated corner houses: each point
// sits 3 units beyond the house's worst-case face (footprint cap), keeping at least 3 units of
// clearance to every obstacle, so even a tank (~1-unit radius) walks out instead of wedging.
export const SPAWN_POINTS = [
    {x: 41.7, y: 20.8}, {x: 35.2, y: 27.3},   // NE corner (house at 35.2, 20.8)
    {x: -41.7, y: 20.8}, {x: -35.2, y: 27.3}, // NW corner (house at -35.2, 20.8)
    {x: 41.7, y: -20.8}, {x: 35.2, y: -27.3}, // SE corner (house at 35.2, -20.8)
    {x: -41.7, y: -20.8}, {x: -35.2, y: -27.3}, // SW corner (house at -35.2, -20.8)
];

// --- Camera (GDD 3A) ---------------------------------------------------------
// Fixed orthographic camera, diagonal heading (user-confirmed), 55 deg tilt, 38 units up.
export const CAMERA = {
    // Azimuth of the viewpoint around the vertical axis. -45 deg keeps the diagonal look that
    // makes the orthographic projection read as "isometric".
    azimuthDeg: -45,
    tiltDeg: 45,          // angle above the floor (GDD 3A)
    height: 38,           // Z height of the camera (GDD 3A)
    viewWidth: 40,        // camera box width in world units (user: 2x wider than the previous 20)
    followOffsetMax: 4,   // max units the view leads toward the pointer (GDD 3A)
    followDamping: 1,     // exponential smoothing rate for the follow (higher = tighter)
    near: 0.1,            // near clip; unspecified by the GDD, safe for this scale
    far: 4000,            // far clip; must clear the 4000-unit backdrop's furthest corner
};

// --- Lights (GDD 5) ----------------------------------------------------------
export const LIGHTS = {
    ambientColor: 0xd0e5ff, // light blue
    ambientIntensity: 0.75,
    dirColor: 0xffffff,
    dirIntensity: 1.1,
    dirPosition: {x: 15, y: -20, z: 30},
    // Shadow camera half-extents: covers the whole 97.2x64.8 arena plus a margin so no shadow pops.
    shadowHalfX: 59,
    shadowHalfY: 43,
    shadowNear: 1,
    shadowFar: 120,
};

// --- Player (GDD 4A + user-confirmed heart values) ---------------------------
export const PLAYER = {
    baseHearts: 5,        // Parry/Dasher start here (user override of the GDD's 5)
    maxHearts: 7,         // global cap for every class (GDD 4A)
    // User-confirmed: doubled from 0.5 back to 1.0 while the camera zoomed out 2x (viewWidth
    // 40), so Tode's on-screen size stays the same while the world around him stays readable.
    // The collider radius is measured from the model, so it follows the height.
    targetHeight: 1.0,
    baseSpeed: 4,         // ground units per second at "speed 1.0x" (GDD 4A)
    hopDistance: 1.6,     // ground distance covered by one hop
    hopHeight: 1.1,       // peak of the hop's sine arc, in world units
    baseFireCooldown: 0.6, // seconds between shots (GDD 4A)
    baseDamage: 1,        // damage per shot (GDD 4A)
    baseProjectiles: 1,   // shots per volley (GDD 4A)
    basePierce: 0,        // extra targets a shot can hit beyond the first
    baseRange: 14,        // auto-shooter target range; unspecified by the GDD (tunable)
    baseIFrames: 1.0,     // invulnerability after a hit, in seconds (GDD 3C)
    iframeFlashOpacity: 0.3, // player renders at 50% opacity during i-frames (GDD 3C)
    deathAnimDuration: 1.2,  // length of the code-made defeat animation (GDD state 6)
    // The hop's frog-lean (nose-up snap, nose-down hold) — kept from the previous tuning pass.
    leanPerSpeed: 0.06,
    leanMax: 0.5,
};

// --- Movement / input --------------------------------------------------------
export const MOVE = {
    // World units around the hero where the pointer does not move the player (GDD 3B).
    // Must stay above PLAYER.hopDistance, or the hero could overshoot the pointer and oscillate.
    deadzone: 4,
};

// --- Collision (round 6: configurable hit sizes) -----------------------------
// Every character radius is measured from the real model geometry; these multipliers scale that
// measurement where it is born, so movement, spawn placement, contact and every hit test agree.
// The projectile multiplier scales only the bullets' HIT radius — their visual size is
// deliberately untouched.
export const COLLISION = {
    // Extra reach added to every contact test, in world units. Small on purpose: the radius is
    // measured from the model, so this only smooths over frame-to-frame jitter — it is NOT the
    // old "chunky hitbox" padding (the old arena's models were 10x larger).
    padding: 0.05,
    playerRadiusMul: 0.8,     // scales Tode's measured hit radius
    enemyRadiusMul: 1,      // scales every common enemy's measured hit radius
    bossRadiusMul: 1,       // scales the Arena Lord's measured hit radius
    houseRadiusMul: 0.8,      // scales both ground half-extents of every house's footprint box
    projectileRadiusMul: 0.9, // scales every bullet's hit radius only (visual size unchanged)
};

// --- Enemy combat (GDD 3C, 4B, 6B) -------------------------------------------
export const ENEMY = {
    // Maximum enemies alive at once. The GDD's density formula ([MAP_SIZE_DEPENDENT]: 35 per
    // 2,400 square units) would now give ~92 on the 97.2 x 64.8 arena. User round 4: "remove the
    // cap or make it really high" — set to 200, which normal play (x3 spawn rate and all) never
    // reaches; it only exists as a runaway guard against spawning without bound.
    maxAlive: 200,
    baseSpeed: 3.2,          // world units per second at "speed 1.0x"
    baseDropChance: 0.2,    // 2% health-drop chance per kill (GDD 4B)
    HealthyDropChance: 0.5, // 10% with the Bloodthirst card (GDD 6A)
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
    // Round 5: shots predict the player's movement instead of aiming at where he stands. The lead
    // follows a fraction of the travel time (0.8 = 80% as far ahead as he will really have moved),
    // and the predicted point then gets a uniformly random offset of up to rangedAimError world
    // units, so a moving player is threatened but a dodging one can still slip the shot.
    rangedAimLead: 0.8,      // fraction of the player's flight-time travel used as lead
    rangedAimError: 1.5,     // max random miss offset around the predicted point, world units
    // Speeder behavior: short zig-zag dashes instead of a straight chase.
    speederDashOn: 0.5,      // seconds of dashing
    speederDashOff: 0.3,     // seconds of rest between dashes
    speederZigzagDeg: 30,    // heading oscillation amplitude
    speederZigzagHz: 2.5,    // oscillation frequency
};

// --- Boss (GDD 4B) -----------------------------------------------------------
export const BOSS = {
    // Mirrors of config/waves.js bossHp (the values the game actually reads); keep both in sync.
    wave3Hp: 250,            // Arena Lord HP in Wave 3 (user: 10x the GDD's 50, halved in round 5)
    wave5Hp: 400,            // Arena Lord HP in Wave 5 (user: 10x the GDD's 80, halved in round 5)
    // Base speed multiplier against ENEMY.baseSpeed. Round 5: the wave defs override this —
    // wave 3 runs this base value, wave 5 uses +10% of it (0.77); see bossSpeedMul in waves.js.
    speedMul: 0.7,
    targetHeight: 3.5,       // model height in world units (~2.5x a common enemy)
    contactDamage: 2,        // round 5: touching the boss always hurts (i-frames still gate it)
    // Phase A: pause 1.5 s, then fire the orb circle (round 5: 24 orbs — the GDD's 8, tripled).
    chargeTime: 1.5,
    orbCount: 24,
    orbDamage: 2,
    phaseAChase: 3.0,        // seconds of chasing between orb volleys (not specified by the GDD)
    // Phase B: red charging dash that deals 2 physical damage.
    dashTelegraph: 0.7,      // seconds the red charge-up is shown before the dash (not specified)
    dashDuration: 0.55,      // seconds the dash itself lasts (not specified)
    dashSpeed: 20,           // world units per second during the dash (not specified)
    dashDamage: 4,           // damage of the dash hit (GDD 4B)
    phaseBChase: 1.5,        // seconds of chasing between dashes (not specified by the GDD)
    heartDropsMin: 1,        // 100% chance to drop 1-2 health items (GDD 4B)
    heartDropsMax: 2,
    knockbackDistance: 2.5,  // how far the shockwave/parry pushes the boss (GDD 4A)
};

// --- Projectiles -------------------------------------------------------------
// The GDD fixes the damage (1 for ranged shots and boss orbs) but not the speeds or sizes.
export const PROJECTILE = {
    playerSpeed: 30,       // player/minion shot speed, world units per second
    playerRadius: 0.35,    // hit radius of a player shot
    playerLifetime: 1.2,   // seconds before a missed shot despawns (range ~31 units)
    enemySpeed: 4,         // ranged-enemy projectile speed (slow enough to dodge)
    enemyRadius: 0.3,
    enemyLifetime: 4,      // seconds alive before despawn; houses block them earlier
    bossOrbSpeed: 15,      // boss orb speed (round 5: 3x the previous 5)
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
    // Round 5: the heart pulsates its size instead of bobbing up and down. The old vertical bob
    // dipped the flat mesh below the floor plane at the trough, which read as the heart blinking
    // out of existence; scale pulsing keeps it always visible from the top-down camera.
    pulseAmplitude: 0.18, // fraction of the base scale the pulse swings by (0.18 = +-18%)
    pulseHz: 1.6,
    heal: 1,             // hearts restored per pickup (GDD: 1-2 items drop, each heals 1)
    lifetime: 30,        // seconds before an uncollected heart is removed (not in the GDD)
};

// --- Power-up draft (GDD 6A) -------------------------------------------------
export const DRAFT = {
    cardsShown: 3,       // cards drawn per draft
    reshuffleAllowed: 1, // reshuffles per run (GDD: once per game)
};

// --- Audio (GDD 2 + 9) -------------------------------------------------------
export const AUDIO = {
    masterVolumeDefault: 0.5, // initial master volume; persisted in localStorage
    lowPassHz: 1200,           // the "muffled" filter frequency (GDD 2)
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
    parryCooldown: 0.5,        // seconds
    parryShield: 0.6,          // seconds the shield stays up
    parryReflectRadius: 7,   // shield circle that flips hostile projectiles (not in the GDD)
    parryShockwaveRadius: 7,   // not specified by the GDD; sized to catch nearby enemies
    parryShockwaveBaseDamage: 3, // shockwave damage is 3 + current HP
    parryStun: ENEMY.stunDuration,
    parryReflectDamage: 5,     // damage of a reflected projectile (user round 5b: "increase the
                               // parried projectile damage" — normal shots deal PROJECTILE.damage)
    // Round-5 parry visual timings (cosmetic only — shield/reflect behavior never reads these):
    parryGlowRadius: 3,      // soft blue glow ring's outer radius while the shield is up
    parryImpactDuration: 0.03, // white-blue impact flash right when a parry succeeds
    parryRingDuration: 0.1,    // shiny-blue ring expanding to the shockwave radius after the flash
    parryFailDuration: 0.15,   // collapse of the glow when the shield expires with no parry
    // Dasher
    dashCooldown: 0.5,         // seconds
    dashDistance: 10,           // world units covered instantly
    dashExtraIFrames: 1,     // extra invulnerability after dashing, in seconds
    dashCloneCount: 3,         // shadow clones left along the path (cosmetic)
    dashCloneLife: 0.35,       // seconds each clone takes to fade
    trailBaseDuration: 2.0,    // trail life = base + per-heart bonus seconds
    trailPerHeart: 0.5,
    trailWidth: 3,           // world units across the slow zone
    trailSlowCommon: 0.5,      // common enemy speed multiplier inside the trail (50% slow)
    trailSlowBoss: 0.75,       // boss speed multiplier inside the trail (25% slow)
    // Anchor
    minionCount: 3,            // two orbiting minions
    minionOrbitRadius: 1.7,    // world units from the player
    minionOrbitSpeed: 1.3,     // radians per second
    minionHeight: 1.2,         // Z height of the orbit (they float)
    minionDamage: 1,           // damage per shot (round 5: integer; was 0.5)
    minionInterval: 2.4,       // seconds between shots (doubled alongside the damage change,
                               // so each minion's DPS is identical to the old 0.5 per 1.2 s)
    minionRangeMul: 1.5,       // 50% more vision range than the player
};
