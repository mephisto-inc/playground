// Achievement definitions. Pure data: each entry is one unlockable record, in display order.
// The Achievements system seeds its registry from this list; extra achievements can also be
// added at runtime with registerAchievement() (see systems/Achievements.js).

export const ACHIEVEMENTS = [
    { id: 'helloPond', name: 'Hello, Pond', icon: '🐸', description: 'Clear Wave 1.' },
    { id: 'pigeonProblem', name: 'Pigeon Problem', icon: '🐦', description: 'Defeat the Arena Lord in Wave 3.' },
    { id: 'crowdedPond', name: 'Crowded Pond', icon: '🐟', description: 'Clear Wave 4.' },
    { id: 'endlessFrog', name: 'Endless Frog', icon: '🌊', description: 'Reach Wave 5.' },
    { id: 'marathonFrog', name: 'Marathon Frog', icon: '⏱️', description: 'Survive 5 minutes in Wave 5.' },
    { id: 'theMillion', name: 'The Million', icon: '💰', description: 'Reach 1,000,000 score in a single run.' },
    { id: 'untouchable', name: 'Untouchable', icon: '✨', description: 'Clear any wave without taking damage.' },
    { id: 'fullHearts', name: 'Full Hearts', icon: '💖', description: 'Reach the maximum of 7 hearts.' },
    { id: 'newRecord', name: 'New Record', icon: '🏆', description: 'Beat your own best score.' },
    // General combat and play milestones (lifetime counters persist in localStorage).
    { id: 'sharpshooter', name: 'Sharpshooter', icon: '🎯', description: 'Defeat 300 enemies in total.' },
    { id: 'arenaChampion', name: 'Arena Champion', icon: '👑', description: 'Defeat 5 Arena Lords in total.' },
    { id: 'closeCall', name: 'Close Call', icon: '🍃', description: 'Survive a hit while at 1 heart.' },
    { id: 'worldTour', name: 'World Tour', icon: '🌍', description: 'Play a run with each of the three classes.' },
    { id: 'deckedOut', name: 'Decked Out', icon: '🃏', description: 'Collect 12 power-ups in a single run.' },
    // Class-specific milestones.
    { id: 'bulwark', name: 'Bulwark', icon: '🛡️', description: 'Block 25 hits with the Pusher shield in total.' },
    { id: 'powerShove', name: 'Power Shove', icon: '💨', description: 'Push 50 enemies with the Pusher shockwave in total.' },
    { id: 'blink', name: 'Blink', icon: '⚡', description: 'Dash 100 times in total.' },
    { id: 'ghostTrail', name: 'Ghost Trail', icon: '🌀', description: 'Defeat 15 enemies with the trail in a single run.' },
    { id: 'swarm', name: 'Swarm', icon: '🐝', description: 'Defeat 100 enemies with Minions in total.' },
];
