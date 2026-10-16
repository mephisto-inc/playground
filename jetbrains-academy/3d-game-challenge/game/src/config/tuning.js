// Central tuning file: every balance number lives here (or in the other config/ files), so a
// balance pass touches only config. Systems read these instead of hard-coding magic numbers.

// --- Arena -------------------------------------------------------------------
// The playfield is 87.48 x 58.32 world units on the X/Y (ground) plane, everything at Z = 0.
export const ARENA = {
    width: 87.48,            // X extent, in world units
    depth: 58.32,            // Y extent, in world units
    floorTile: 3,            // world units covered by one PlaneMesh.png repeat
    wallThickness: 2,        // depth of the invisible boundary wall colliders
    backdropSize: 4000,      // dark plane under the floor, sized to always fill the view
    backdropZ: -1,           // slightly below the floor so the two never z-fight
    backdropColor: 0x111111, // near-black void beyond the arena
};

// Spawn points: 8 spots on the outer edge, two per corner house — one on the edge beside the
// house and one on the edge behind it, so an enemy always steps out from behind cover instead
// of popping into view. Each point sits 2.7 units beyond the house's worst-case face (the
// footprint cap), keeping at least 4.5 units of clearance to the boundary walls, so even a
// tank (~1-unit radius) walks out instead of wedging.
export const SPAWN_POINTS = [
    {x: 37.53, y: 18.72}, {x: 31.68, y: 24.57},   // NE corner (house at 31.68, 18.72)
    {x: -37.53, y: 18.72}, {x: -31.68, y: 24.57}, // NW corner (house at -31.68, 18.72)
    {x: 37.53, y: -18.72}, {x: 31.68, y: -24.57}, // SE corner (house at 31.68, -18.72)
    {x: -37.53, y: -18.72}, {x: -31.68, y: -24.57}, // SW corner (house at -31.68, -18.72)
];

// --- Camera ------------------------------------------------------------------
// Fixed orthographic camera, diagonal heading, 45 deg tilt, 38 units up.
export const CAMERA = {
    // Azimuth of the viewpoint around the vertical axis. -45 deg keeps the diagonal look that
    // makes the orthographic projection read as "isometric".
    azimuthDeg: -45,
    tiltDeg: 45,          // angle above the floor
    height: 38,           // Z height of the camera
    viewWidth: 40,        // camera box width in world units (the zoom level)
    followOffsetMax: 4,   // max units the view leads toward the pointer
    followDamping: 1,     // exponential smoothing rate for the follow (higher = tighter)
    near: 0.1,            // near clip plane
    far: 4000,            // far clip; must clear the 4000-unit backdrop's furthest corner
};

// --- Lights ------------------------------------------------------------------
export const LIGHTS = {
    ambientColor: 0xd0e5ff, // light blue
    ambientIntensity: 0.75,
    dirColor: 0xffffff,
    dirIntensity: 1.1,
    dirPosition: {x: 15, y: -20, z: 30},
    // Shadow camera half-extents: covers the whole arena plus a margin so no shadow pops.
    shadowHalfX: 53.1,
    shadowHalfY: 38.7,
    shadowNear: 1,
    shadowFar: 120,
};

// --- Player ------------------------------------------------------------------
export const PLAYER = {
    baseHearts: 5,        // starting hearts for Parry/Dasher (Anchor starts 2 lower)
    maxHearts: 7,         // global cap every class can grow to with Titan Heart cards
    // Tode's height in world units. The collider radius is measured from the model, so it
    // follows this value.
    targetHeight: 1.0,
    baseSpeed: 4,         // ground units per second at "speed 1.0x"
    hopDistance: 1.6,     // ground distance covered by one hop
    hopHeight: 1.1,       // peak of the hop's sine arc, in world units
    baseFireCooldown: 0.6, // seconds between auto-shots
    baseDamage: 1,        // damage per shot
    baseProjectiles: 1,   // shots per volley
    basePierce: 0,        // extra targets a shot can hit beyond the first
    baseRange: 14,        // auto-shooter target range
    baseIFrames: 1.0,     // invulnerability after a hit, in seconds
    iframeFlashOpacity: 0.3, // opacity Tode renders at during i-frames (blinking flash)
    deathAnimDuration: 1.2,  // length of the code-made defeat animation
    // The hop's frog-lean: a quick nose-up snap, a roll to nose-down, held until touch-down.
    leanPerSpeed: 0.06,   // lean radians gained per unit of hop speed
    leanMax: 0.5,         // lean cap, radians
};

// --- Movement / input --------------------------------------------------------
export const MOVE = {
    // World units around the hero where the pointer does not steer him. Must stay above
    // PLAYER.hopDistance, or the hero could overshoot the pointer and oscillate.
    deadzone: 4,
};

// --- Collision ---------------------------------------------------------------
// Every character radius is measured from the real model geometry; these multipliers scale that
// measurement where it is born, so movement, spawn placement, contact and every hit test agree.
// The projectile multiplier scales only the bullets' HIT radius — their visual size is
// deliberately untouched.
export const COLLISION = {
    // Extra reach added to every contact test, in world units. Small on purpose: the radius is
    // measured from the model, so this only smooths over frame-to-frame jitter.
    padding: 0.05,
    playerRadiusMul: 0.8,     // scales Tode's measured hit radius
    enemyRadiusMul: 1,        // scales every common enemy's measured hit radius
    bossRadiusMul: 1,         // scales the Arena Lord's measured hit radius
    houseRadiusMul: 0.8,      // scales both ground half-extents of every house's footprint box
    projectileRadiusMul: 0.9, // scales every bullet's hit radius only (visual size unchanged)
};

// --- Enemy combat ------------------------------------------------------------
export const ENEMY = {
    // Maximum enemies alive at once. A pure guard against spawning without bound — normal play
    // never reaches it.
    maxAlive: 200,
    baseSpeed: 3.2,          // world units per second at "speed 1.0x"
    baseDropChance: 0.2,     // chance a kill drops a heart (0.2 = 20%)
    HealthyDropChance: 0.5,  // drop chance with the Bloodthirst card
    stunDuration: 1.5,       // seconds common enemies stay stunned after a Parry shockwave
    knockbackDistance: 2.5,  // how far a common enemy is pushed when it touches the player
    hitFlashDuration: 0.08,  // white flash after taking damage, in seconds
    deathLinger: 0.9,        // how long a corpse stays to play its Death clip before removal
    // Endless wave-5 growth: +10% HP and speed per minute, capped at 3x HP / 1.5x speed.
    growthPerMinute: 0.10,
    growthHpCap: 3,
    growthSpeedCap: 1.5,
    // Ranged behavior: it tries to sit at this distance band and fires at the player.
    rangedStandoff: 12,      // preferred distance from the player
    rangedBand: 2,           // +/- band around the standoff where it stops closing
    rangedFireInterval: 2.5, // seconds between projectiles
    // Shots predict the player's movement instead of aiming at where he stands: the aim leads a
    // fraction of the travel time, then gets a uniformly random miss offset of up to
    // rangedAimError world units, so a moving player is threatened but can still dodge.
    rangedAimLead: 0.8,      // fraction of the player's flight-time travel used as lead
    rangedAimError: 1.5,     // max random miss offset around the predicted point, world units
    // Speeder behavior: short zig-zag dashes instead of a straight chase.
    speederDashOn: 0.5,      // seconds of dashing
    speederDashOff: 0.3,     // seconds of rest between dashes
    speederZigzagDeg: 30,    // heading oscillation amplitude
    speederZigzagHz: 2.5,    // oscillation frequency
};

// --- Boss --------------------------------------------------------------------
export const BOSS = {
    // Base speed multiplier against ENEMY.baseSpeed; the wave definitions can override it per
    // wave (see bossSpeedMul in waves.js).
    speedMul: 0.7,
    contactDamage: 2,        // touching the boss deals this (i-frames still gate it)
    // Phase A: pause 1.5 s, then fire the orb circle.
    chargeTime: 1.5,
    orbCount: 24,            // orbs fired in one circle volley
    phaseAChase: 3.0,        // seconds of chasing between orb volleys
    // Phase B: red charging dash that deals dashDamage physical damage.
    dashTelegraph: 0.7,      // seconds the red charge-up is shown before the dash
    dashDuration: 0.55,      // seconds the dash itself lasts
    dashSpeed: 20,           // world units per second during the dash
    dashDamage: 4,           // damage of the dash hit
    phaseBChase: 1.5,        // seconds of chasing between dashes
    heartDropsMin: 1,        // boss kills drop this many hearts...
    heartDropsMax: 2,        // ...up to this many (inclusive random range)
    knockbackDistance: 2.5,  // how far the parry shockwave pushes the boss
};

// --- Projectiles -------------------------------------------------------------
export const PROJECTILE = {
    playerSpeed: 30,       // player/minion shot speed, world units per second
    playerRadius: 0.35,    // visual radius of a player shot
    playerLifetime: 1.2,   // seconds before a missed shot despawns (range ~31 units)
    enemySpeed: 4,         // ranged-enemy projectile speed (slow enough to dodge)
    enemyRadius: 0.3,      // visual radius of an enemy shot
    enemyLifetime: 4,      // seconds alive before despawn; houses block them earlier
    bossOrbSpeed: 15,      // boss orb speed
    bossOrbRadius: 0.35,   // visual radius of a boss orb
    bossOrbLifetime: 5,
    multiShotSpreadDeg: 8, // angular spread between extra projectiles of one volley
    aimLeadFactor: 0.8,    // fraction of the target's travel time the aim leads by
    damage: 1,             // common damage for ranged shots and boss orbs
};

// --- Pickups -----------------------------------------------------------------
export const PICKUP = {
    magnetRadius: 2.2,   // base attraction radius; Point Magnet doubles it
    collectRadius: 0.8,  // distance at which a heart is consumed
    pulseAmplitude: 0.18, // fraction of the base scale the pulse swings by (0.18 = +-18%)
    pulseHz: 1.6,
    heal: 1,             // hearts restored per pickup
    lifetime: 30,        // seconds before an uncollected heart is removed
};

// --- Power-up draft ----------------------------------------------------------
export const DRAFT = {
    cardsShown: 3,       // cards drawn per draft
    reshuffleAllowed: 1, // reshuffles per run
};

// --- Audio -------------------------------------------------------------------
export const AUDIO = {
    masterVolumeDefault: 0.5, // initial master volume; persisted in localStorage
    lowPassHz: 1200,           // frequency of the "muffled" filter used outside the arena
    // Two crossfade lengths: a snappy one for ordinary step changes and a longer one for
    // bgm_boss_step3 swaps.
    crossfadeSnappy: 0.15,
    crossfadeLong: 1.0,
    trackLength: 9,           // seconds; every bgm_* track except bgm_boss_step3
    bossStep3Length: 19,      // seconds; bgm_boss_step3.wav
};

// --- Class abilities ---------------------------------------------------------
// The default numbers for every ability. Each class in config/classes.js copies these into its
// own ability block; the code reads the ACTIVE class's block (Player.getAbilityValues), so a
// class can override any of these by using a literal instead of the ABILITY reference.
export const ABILITY = {
    // Parry
    parryCooldown: 0.5,        // seconds
    parryShield: 0.6,          // seconds the shield stays up
    parryReflectRadius: 7,     // radius of the shield circle that flips hostile projectiles
    parryShockwaveRadius: 7,   // radius of the parry's damage shockwave
    parryShockwaveBaseDamage: 3, // shockwave damage is this + current hearts
    parryStun: ENEMY.stunDuration, // stun applied to surviving common enemies
    parryReflectDamage: 5,     // damage a reflected projectile deals (normal shots use
                               // PROJECTILE.damage)
    // Parry visual timings (cosmetic only — shield/reflect behavior never reads these):
    parryGlowRadius: 3,      // soft blue glow ring's outer radius while the shield is up
    parryImpactDuration: 0.03, // white-blue impact flash right when a parry succeeds
    parryRingDuration: 0.1,    // shiny-blue ring expanding to the shockwave radius after the flash
    parryFailDuration: 0.15,   // collapse of the glow when the shield expires with no parry
    // Dasher
    dashCooldown: 0.5,         // seconds
    dashDistance: 10,          // world units covered instantly
    dashExtraIFrames: 1,       // extra invulnerability after dashing, in seconds
    dashCloneCount: 3,         // shadow clones left along the path (cosmetic)
    dashCloneLife: 0.35,       // seconds each clone takes to fade
    trailBaseDuration: 2.0,    // trail life = base + per-heart bonus seconds
    trailPerHeart: 0.5,
    trailWidth: 3,             // world units across the slow zone
    trailSlowCommon: 0.5,      // common enemy speed multiplier inside the trail (50% slow)
    trailSlowBoss: 0.75,       // boss speed multiplier inside the trail (25% slow)
    // Anchor
    minionCount: 3,            // orbiting minions
    minionOrbitRadius: 1.7,    // world units from the player
    minionOrbitSpeed: 1.3,     // radians per second
    minionHeight: 1.2,         // Z height of the orbit (they float)
    minionDamage: 1,           // damage per minion shot
    minionInterval: 2.4,       // seconds between minion shots
    minionRangeMul: 1.5,       // minion targeting range relative to the player's
};
