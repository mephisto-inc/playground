// Power-up card definitions. Pure data: id, emoji, name, description and an effect descriptor.
// Player.applyCard() interprets the descriptor fields — keeping the cards declarative means a
// balance change is a one-line edit here, and the draft UI can render any card generically.
//
// Each card's numbers live in a value object defined right above its entry; the description
// text and the effect descriptor both read that object, so the text can never drift from the
// real balance.

// Effect descriptor fields (any combination; an absent field means "do not touch"):
//   fireRateMul           — multiply shots per second (cooldown is divided by this)
//   projectilesAdd        — add projectiles to every volley
//   pierceAdd             — add targets a shot can pass through
//   speedAdd              — add to the player's speed multiplier
//   damageAdd             — add damage per shot
//   rangeMul              — multiply the auto-shooter's targeting range
//   maxHeartsAdd          — change the max-heart cap (clamped to [0, global 7]; may be negative,
//                           and a cap that trims the last heart to 0 is fatal — Reckless)
//   heal                  — restore this many hearts immediately (clamped to max)
//   iFramesSet            — set the invulnerability duration to this many seconds
//   magnetMul             — multiply the pickup attraction radius (hearts and power-up drops)
//   dropChanceSet         — replace the enemy health-drop chance with this value
//   critChanceAdd         — add to the chance a damage roll (shots, shockwave, trail ticks) doubles
//   thornsDamage          — damage dealt back to an enemy that touches the player
//   berserkPerMissingHeart — extra shot damage per missing heart
//   shotKnockback         — world units a shot pushes a common enemy it hits
//   slowOnHitMul          — speed multiplier applied to enemies hit (0.6 = 40% slow)
//   slowOnHitDuration     — seconds that slow lasts
//   bulletRadiusMul       — multiply the size (visual sphere + hit radius) of player/minion shots
//   dodgeChanceAdd        — add to the chance to ignore an incoming hit entirely
//   trailDurationAdd      — extra seconds of Dasher trail life
//   trailWidthMul         — multiply the Dasher trail width
//   trailDamageMul        — multiply the Dasher trail's tick damage
// Card-level fields (outside `effect`):
//   classId               — optional; the card only enters that class's draft pool
import {ENEMY, PLAYER} from "./tuning.js";

// Rounds a fraction (0.15, 0.5, 1.5...) to a whole percentage for the description text
// (Math.round also cleans up float artifacts like 0.15 * 100 = 15.000000000000002).
const pct = (fraction) => Math.round(fraction * 100);

// Quick Trigger: +25% fire rate.
const QUICK_TRIGGER = {fireRateMul: 1.25};
// Multi-Shot: +1 projectile per volley.
const MULTI_SHOT = {projectilesAdd: 1};
// Piercing: +2 pierce per projectile.
const PIERCING = {pierceAdd: 2};
// Jump Sneakers: +50% movement speed.
const JUMP_SNEAKERS = {speedAdd: 0.5};
// Heavy Ammo: +2 damage per shot.
const HEAVY_AMMO = {damageAdd: 2};
// Tactical Vision: +30% auto-shooter range.
const TACTICAL_VISION = {rangeMul: 1.3};
// Titan Heart: +2 HP now, +1 max heart.
const TITAN_HEART = {maxHeartsAdd: 1, heal: 2};
// Scaled Skin: invulnerability after a hit becomes 3 s.
const SCALED_SKIN = {iFramesSet: 3};
// Point Magnet: x5 pickup attraction radius.
const POINT_MAGNET = {magnetMul: 5};
// Critical Hit: 15% chance for a damage roll to double.
const CRITICAL_HIT = {critChanceAdd: 0.15};
// Thorn Skin: 2 damage back to a common enemy that touches the player.
const THORN_SKIN = {thornsDamage: 2};
// Berserk: +0.5 shot damage per missing heart.
const BERSERK = {berserkPerMissingHeart: 0.5};
// Trail Master: +1 s trail life, 25% wider, triple tick damage.
const TRAIL_MASTER = {trailDurationAdd: 1, trailWidthMul: 1.25, trailDamageMul: 3};
// Frost Shot: 40% slow for 1 s on hit.
const FROST_SHOT = {slowOnHitMul: 0.6, slowOnHitDuration: 1};
// Big Bullets: 2.5x bullet size.
const BIG_BULLETS = {bulletRadiusMul: 2.5};
// Evasion: 15% chance to ignore a hit.
const EVASION = {dodgeChanceAdd: 0.15};
// Reckless: +5 damage per shot, -1 max heart.
const RECKLESS = {damageAdd: 5, maxHeartsAdd: -1};
// Overflow: +2 projectiles, 25% slower fire rate.
const OVERFLOW = {projectilesAdd: 2, fireRateMul: 0.75};

export const POWERUPS = [
    {
        id: 'quickTrigger',
        icon: '⚡',
        name: 'Quick Trigger',
        description: `+${pct(QUICK_TRIGGER.fireRateMul - 1)}% fire rate.`,
        effect: QUICK_TRIGGER,
    },
    {
        id: 'multiShot',
        icon: '🎯',
        name: 'Multi-Shot',
        description: `+${MULTI_SHOT.projectilesAdd} projectile per volley.`,
        effect: MULTI_SHOT,
    },
    {
        id: 'piercing',
        icon: '💥',
        name: 'Piercing',
        description: `Each projectile pierces +${PIERCING.pierceAdd} targets.`,
        effect: PIERCING,
    },
    {
        id: 'jumpSneakers',
        icon: '👟',
        name: 'Jump Sneakers',
        description: `+${pct(JUMP_SNEAKERS.speedAdd)}% movement speed.`,
        effect: JUMP_SNEAKERS,
    },
    {
        id: 'heavyAmmo',
        icon: '🗡️',
        name: 'Heavy Ammo',
        description: `+${HEAVY_AMMO.damageAdd} damage per shot.`,
        effect: HEAVY_AMMO,
    },
    {
        id: 'tacticalVision',
        icon: '👁️',
        name: 'Tactical Vision',
        description: `+${pct(TACTICAL_VISION.rangeMul - 1)}% auto-shooter range.`,
        effect: TACTICAL_VISION,
    },
    {
        id: 'titanHeart',
        icon: '💖',
        name: 'Titan Heart',
        description: `+${TITAN_HEART.heal} HP and +${TITAN_HEART.maxHeartsAdd} max HP (max ${PLAYER.maxHearts}). Still heals at ${PLAYER.maxHearts} hearts.`,
        effect: TITAN_HEART,
    },
    {
        id: 'scaledSkin',
        icon: '🛡️',
        name: 'Scaled Skin',
        description: `Invulnerability after a hit becomes ${SCALED_SKIN.iFramesSet} s.`,
        effect: SCALED_SKIN,
    },
    {
        id: 'pointMagnet',
        icon: '🧲',
        name: 'Point Magnet',
        description: `x${POINT_MAGNET.magnetMul} pickup attraction radius (hearts and power-up drops).`,
        effect: POINT_MAGNET,
    },
    {
        id: 'healthy',
        icon: '🩸',
        name: 'Healthy',
        description: `Health drop chance goes from ${ENEMY.baseDropChance * 100}% to ${ENEMY.HealthyDropChance * 100}%.`,
        effect: {dropChanceSet: ENEMY.HealthyDropChance},
    },
    // --- Combat-trait cards (Bizarre-Brigade-flavored) ------------------------------------
    {
        id: 'criticalHit',
        icon: '🎯',
        name: 'Critical Hit',
        description: `${pct(CRITICAL_HIT.critChanceAdd)}% chance for a hit to deal double damage (shots, shockwave, trail).`,
        effect: CRITICAL_HIT,
    },
    {
        id: 'thornSkin',
        icon: '🌵',
        name: 'Thorn Skin',
        description: `Common enemies that hurt you by touch take ${THORN_SKIN.thornsDamage} damage.`,
        effect: THORN_SKIN,
    },
    {
        id: 'berserk',
        icon: '😤',
        name: 'Berserk',
        description: `+${BERSERK.berserkPerMissingHeart} damage per shot for every missing heart.`,
        effect: BERSERK,
    },
    {
        id: 'concussiveShots',
        icon: '💨',
        name: 'Concussive Shots',
        description: 'Shots knock common enemies back.',
        effect: {shotKnockback: 2.5},
    },
    {
        id: 'trailMaster',
        icon: '🌀',
        name: 'Trail Master',
        description: `Trail lasts +${TRAIL_MASTER.trailDurationAdd} s, is ${pct(TRAIL_MASTER.trailWidthMul - 1)}% wider and deals ${TRAIL_MASTER.trailDamageMul}x damage.`,
        // No classId: any class can draft it (only the Dasher ever leaves trails, so for the
        // others it is a filler pick).
        effect: TRAIL_MASTER,
    },
    {
        id: 'frostShot',
        icon: '❄️',
        name: 'Frost Shot',
        description: `Hits slow common enemies by ${pct(1 - FROST_SHOT.slowOnHitMul)}% for ${FROST_SHOT.slowOnHitDuration} s.`,
        effect: FROST_SHOT,
    },
    {
        id: 'bigBullets',
        icon: '⚪',
        name: 'Big Bullets',
        description: `+${pct(BIG_BULLETS.bulletRadiusMul - 1)}% bullet size (visuals and hitbox).`,
        effect: BIG_BULLETS,
    },
    {
        id: 'evasion',
        icon: '🍀',
        name: 'Evasion',
        description: `${pct(EVASION.dodgeChanceAdd)}% chance to ignore an incoming hit.`,
        effect: EVASION,
    },
    {
        id: 'reckless',
        icon: '💢',
        name: 'Reckless',
        description: `+${RECKLESS.damageAdd} damage per shot, but ${RECKLESS.maxHeartsAdd} max heart.`,
        effect: RECKLESS,
    },
    {
        id: 'overflow',
        icon: '🌊',
        name: 'Overflow',
        description: `+${OVERFLOW.projectilesAdd} projectiles per volley, but ${pct(1 - OVERFLOW.fireRateMul)}% slower fire rate.`,
        effect: OVERFLOW,
    },
];

// Looks a power-up up by id; used by the HUD's collected-card queue and the game-over recap.
export function getPowerup(id) {
    return POWERUPS.find((card) => card.id === id);
}
