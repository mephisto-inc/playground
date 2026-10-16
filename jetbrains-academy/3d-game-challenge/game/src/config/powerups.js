// Power-up card definitions. Pure data: id, emoji, name, description and an effect descriptor.
// Player.applyCard() interprets the descriptor fields — keeping the cards declarative means a
// balance change is a one-line edit here, and the draft UI can render any card generically.

// Effect descriptor fields (any combination; an absent field means "do not touch"):
//   fireRateMul           — multiply shots per second (cooldown is divided by this)
//   projectilesAdd        — add projectiles to every volley
//   pierceAdd             — add targets a shot can pass through
//   speedAdd              — add to the player's speed multiplier
//   damageAdd             — add damage per shot
//   rangeMul              — multiply the auto-shooter's targeting range
//   maxHeartsAdd          — change the max-heart cap (clamped to [1, global 7]; may be negative)
//   heal                  — restore this many hearts immediately (clamped to max)
//   iFramesSet            — set the invulnerability duration to this many seconds
//   magnetMul             — multiply the health-pickup attraction radius
//   dropChanceSet         — replace the enemy health-drop chance with this value
//   critChanceAdd         — add to the chance a shot deals double damage
//   thornsDamage          — damage dealt back to an enemy that touches the player
//   berserkPerMissingHeart — extra shot damage per missing heart
//   shotKnockback         — world units a shot pushes a common enemy it hits
//   slowOnHitMul          — speed multiplier applied to enemies hit (0.6 = 40% slow)
//   slowOnHitDuration     — seconds that slow lasts
//   bulletRadiusMul       — multiply the hit radius of player/minion shots (visual size fixed)
//   dodgeChanceAdd        — add to the chance to ignore an incoming hit entirely
//   trailDurationAdd      — extra seconds of Dasher trail life
//   trailWidthMul         — multiply the Dasher trail width
// Card-level fields (outside `effect`):
//   classId               — optional; the card only enters that class's draft pool
import {ENEMY} from "./tuning.js";

export const POWERUPS = [
    {
        id: 'quickTrigger',
        icon: '⚡',
        name: 'Quick Trigger',
        description: '+25% fire rate.',
        effect: {fireRateMul: 1.25},
    },
    {
        id: 'multiShot',
        icon: '🎯',
        name: 'Multi-Shot',
        description: '+1 projectile per volley.',
        effect: {projectilesAdd: 1},
    },
    {
        id: 'piercing',
        icon: '💥',
        name: 'Piercing',
        description: '+2 target hit per projectile.',
        effect: {pierceAdd: 2},
    },
    {
        id: 'jumpSneakers',
        icon: '👟',
        name: 'Jump Sneakers',
        description: '+50% movement speed.',
        effect: {speedAdd: 0.5},
    },
    {
        id: 'heavyAmmo',
        icon: '🗡️',
        name: 'Heavy Ammo',
        description: '+2 damage per shot.',
        effect: {damageAdd: 2},
    },
    {
        id: 'tacticalVision',
        icon: '👁️',
        name: 'Tactical Vision',
        description: '+30% auto-shooter range.',
        effect: {rangeMul: 1.3},
    },
    {
        id: 'titanHeart',
        icon: '💖',
        name: 'Titan Heart',
        description: '+2 HP and +1 max HP (max 7). Still heals at 7 hearts.',
        effect: {maxHeartsAdd: 1, heal: 2},
    },
    {
        id: 'scaledSkin',
        icon: '🛡️',
        name: 'Scaled Skin',
        description: `Invulnerability after a hit becomes 3 s.`,
        effect: {iFramesSet: 3},
    },
    {
        id: 'pointMagnet',
        icon: '🧲',
        name: 'Point Magnet',
        description: 'Increase health-pickup radius.',
        effect: {magnetMul: 5},
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
        description: '15% chance for a shot to deal double damage.',
        effect: {critChanceAdd: 0.15},
    },
    {
        id: 'thornSkin',
        icon: '🌵',
        name: 'Thorn Skin',
        description: 'Enemies that touch you take 2 damage.',
        effect: {thornsDamage: 2},
    },
    {
        id: 'berserk',
        icon: '😤',
        name: 'Berserk',
        description: '+0.5 damage per shot for every missing heart.',
        effect: {berserkPerMissingHeart: 0.5},
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
        description: 'Dasher trail lasts +1 s and is 25% wider.',
        classId: 'dasher', // only the Dasher can draft this (its trail is the Dasher's ability)
        effect: {trailDurationAdd: 1, trailWidthMul: 1.25},
    },
    {
        id: 'frostShot',
        icon: '❄️',
        name: 'Frost Shot',
        description: 'Hits slow enemies by 40% for 1 s.',
        effect: {slowOnHitMul: 0.6, slowOnHitDuration: 1},
    },
    {
        id: 'bigBullets',
        icon: '⚪',
        name: 'Big Bullets',
        description: '+50% bullet hit size (the visuals stay sleek).',
        effect: {bulletRadiusMul: 1.5},
    },
    {
        id: 'evasion',
        icon: '🍀',
        name: 'Evasion',
        description: '15% chance to ignore an incoming hit.',
        effect: {dodgeChanceAdd: 0.15},
    },
    {
        id: 'reckless',
        icon: '💢',
        name: 'Reckless',
        description: '+3 damage per shot, but -1 max heart.',
        effect: {damageAdd: 3, maxHeartsAdd: -1},
    },
    {
        id: 'overflow',
        icon: '🌊',
        name: 'Overflow',
        description: '+2 projectiles per volley, but 25% slower fire rate.',
        effect: {projectilesAdd: 2, fireRateMul: 0.75},
    },
];

// Looks a power-up up by id; used by the HUD's collected-card queue and the game-over recap.
export function getPowerup(id) {
    return POWERUPS.find((card) => card.id === id);
}
