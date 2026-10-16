// Achievement definitions. Pure data: each entry is one unlockable record, in display order.
// The Achievements system seeds its registry from this list; extra achievements can also be
// added at runtime with registerAchievement() (see systems/Achievements.js).
// ACHIEVEMENT_TARGETS holds every numeric threshold: the system checks in
// systems/Achievements.js and the descriptions below both read it, so the text can never
// drift from the real requirement.

import { DRAFT, PLAYER } from './tuning.js';
import { CLASSES } from './classes.js';

// The unlock thresholds, in one place. systems/Achievements.js imports this for its checks.
export const ACHIEVEMENT_TARGETS = {
    marathonSeconds: 300,            // Marathon Frog: wave-5 survival time
    the50kScore: 50_000,             // the 50K achievements: live score in a single run (per class)
    sharpshooterKills: 300,          // Sharpshooter: lifetime kills
    arenaChampionBosses: 5,          // Arena Champion: lifetime boss kills
    deckedOutCards: DRAFT.maxCards,  // Decked Out: cards in a single run (follows the draft cap)
    bulwarkBlocks: 25,               // Bulwark: lifetime shield blocks
    powerShovePushes: 50,            // Power Shove: pushes within a single run
    blinkDashes: 100,                // Blink: lifetime dashes
    ghostTrailKills: 15,             // Ghost Trail: trail kills within a single run
    swarmMinionKills: 100,           // Swarm: lifetime minion kills
    worldTourClasses: CLASSES.length, // World Tour: distinct classes played
};

export const ACHIEVEMENTS = [
    { id: 'helloPond', name: 'Hello to the bug world', icon: '🐸', description: 'Clear Wave 1.' },
    { id: 'pigeonProblem', name: 'Pigeon Problem', icon: '🐦', description: 'Defeat the Arena Lord in Wave 3.' },
    { id: 'crowdedPond', name: 'Crowded Bug', icon: '🐛', description: 'Clear Wave 4.' },
    { id: 'endlessFrog', name: 'Endless Frog', icon: '🌊', description: 'Reach Wave 5.' },
    { id: 'marathonFrog', name: 'Marathon Frog', icon: '⏱️', description: `Survive ${ACHIEVEMENT_TARGETS.marathonSeconds / 60} minutes in Wave 5.` },
    // One 50K per class: the run must be played with that class.
    { id: 'the50kPusher', name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Pusher`, icon: '🛡️', description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Pusher.` },
    { id: 'the50kDasher', name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Dasher`, icon: '⚡', description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Dasher.` },
    { id: 'the50kAnchor', name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Anchor`, icon: '🤖', description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Anchor.` },
    { id: 'untouchable', name: 'Untouchable', icon: '✨', description: 'Clear any wave without taking damage.' },
    { id: 'fullHearts', name: 'Full Hearts', icon: '💖', description: `Reach the maximum of ${PLAYER.maxHearts} hearts.` },
    { id: 'newRecord', name: 'New Record', icon: '🏆', description: 'Beat your own best score.' },
    // General combat and play milestones (lifetime counters persist in localStorage).
    { id: 'sharpshooter', name: 'Sharpshooter', icon: '🎯', description: `Defeat ${ACHIEVEMENT_TARGETS.sharpshooterKills} enemies in total.` },
    { id: 'arenaChampion', name: 'Arena Champion', icon: '👑', description: `Defeat ${ACHIEVEMENT_TARGETS.arenaChampionBosses} Arena Lords in total.` },
    { id: 'closeCall', name: 'Close Call', icon: '🍃', description: 'Survive a hit while at 1 heart.' },
    { id: 'worldTour', name: 'World Tour', icon: '🌍', description: `Play a run with each of the ${ACHIEVEMENT_TARGETS.worldTourClasses} classes.` },
    { id: 'deckedOut', name: 'Decked Out', icon: '🃏', description: `Collect ${ACHIEVEMENT_TARGETS.deckedOutCards} power-ups in a single run.` },
    // Class-specific milestones.
    { id: 'bulwark', name: 'Bulwark', icon: '🛡️', description: `Block ${ACHIEVEMENT_TARGETS.bulwarkBlocks} hits with the Pusher shield in total.` },
    { id: 'powerShove', name: 'Power Shove', icon: '💨', description: `Push ${ACHIEVEMENT_TARGETS.powerShovePushes} enemies with the Pusher shockwave in a single run.` },
    { id: 'blink', name: 'Blink', icon: '⚡', description: `Dash ${ACHIEVEMENT_TARGETS.blinkDashes} times in total.` },
    { id: 'ghostTrail', name: 'Ghost Trail', icon: '🌀', description: `Defeat ${ACHIEVEMENT_TARGETS.ghostTrailKills} enemies with the trail in a single run.` },
    { id: 'swarm', name: 'Swarm', icon: '🐝', description: `Defeat ${ACHIEVEMENT_TARGETS.swarmMinionKills} enemies with Minions in total.` },
];
