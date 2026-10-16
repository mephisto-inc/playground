// Power-up card definitions. Pure data: id, emoji, name, description and an effect descriptor.
// Player.applyCard() interprets the descriptor fields — keeping the cards declarative means a
// balance change is a one-line edit here, and the draft UI can render any card generically.

// Effect descriptor fields (any combination; an absent field means "do not touch"):
//   fireRateMul    — multiply shots per second (cooldown is divided by this)
//   projectilesAdd — add projectiles to every volley
//   pierceAdd      — add targets a shot can pass through
//   speedAdd       — add to the player's speed multiplier
//   damageAdd      — add damage per shot
//   rangeMul       — multiply the auto-shooter's targeting range
//   maxHeartsAdd   — raise the max-heart cap (still clamped to the global 7)
//   heal           — restore this many hearts immediately (clamped to max)
//   iFramesSet     — set the invulnerability duration to this many seconds
//   magnetMul      — multiply the health-pickup attraction radius
//   dropChanceSet  — replace the enemy health-drop chance with this value
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
];

// Looks a power-up up by id; used by the HUD's collected-card queue and the game-over recap.
export function getPowerup(id) {
    return POWERUPS.find((card) => card.id === id);
}
