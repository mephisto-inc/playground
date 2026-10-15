// Power-up card definitions (GDD 6A). Pure data: id, emoji, name, description and an effect
// descriptor. Player.applyCard() interprets the descriptor fields — keeping the cards declarative
// means a balance change is a one-line edit here, and the draft UI can render any card generically.

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
export const POWERUPS = [
    {
        id: 'quickTrigger',
        icon: '⚡',
        name: 'Quick Trigger',
        description: '+25% fire rate.',
        effect: { fireRateMul: 1.25 },
    },
    {
        id: 'multiShot',
        icon: '🎯',
        name: 'Multi-Shot',
        description: '+1 projectile per volley.',
        effect: { projectilesAdd: 1 },
    },
    {
        id: 'piercing',
        icon: '💥',
        name: 'Piercing',
        description: '+1 target hit per projectile.',
        effect: { pierceAdd: 1 },
    },
    {
        id: 'jumpSneakers',
        icon: '👟',
        name: 'Jump Sneakers',
        description: '+20% movement speed.',
        effect: { speedAdd: 0.2 },
    },
    {
        id: 'heavyAmmo',
        icon: '🗡️',
        name: 'Heavy Ammo',
        description: '+1 damage per shot.',
        effect: { damageAdd: 1 },
    },
    {
        id: 'tacticalVision',
        icon: '👁️',
        name: 'Tactical Vision',
        description: '+30% auto-shooter range.',
        effect: { rangeMul: 1.3 },
    },
    {
        id: 'titanHeart',
        icon: '💖',
        name: 'Titan Heart',
        description: '+2 HP and +1 max HP (max 7). Still heals at 7 hearts.',
        effect: { maxHeartsAdd: 1, heal: 2 },
    },
    {
        id: 'scaledSkin',
        icon: '🛡️',
        name: 'Scaled Skin',
        description: 'Invulnerability after a hit becomes 1.5 s.',
        effect: { iFramesSet: 1.5 },
    },
    {
        id: 'pointMagnet',
        icon: '🧲',
        name: 'Point Magnet',
        description: 'Double health-pickup radius.',
        effect: { magnetMul: 2 },
    },
    {
        id: 'bloodthirst',
        icon: '🩸',
        name: 'Bloodthirst',
        description: 'Health drop chance goes from 2% to 10%.',
        effect: { dropChanceSet: 0.10 },
    },
];

// Looks a power-up up by id; used by tests of the draft flow and by the recap at game over.
export function getPowerup(id) {
    return POWERUPS.find((card) => card.id === id);
}
