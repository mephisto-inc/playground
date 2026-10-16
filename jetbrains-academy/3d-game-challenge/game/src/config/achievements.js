// Achievement definitions. Pure data: each entry is one unlockable record, in display order.
// The Achievements system seeds its registry from this list; extra achievements can also be
// added at runtime with registerAchievement() (see systems/Achievements.js).

export const ACHIEVEMENTS = [
    { id: 'helloPond', name: 'Hello, Pond', icon: '🐸', description: 'Clear Wave 1.' },
    { id: 'pigeonProblem', name: 'Pigeon Problem', icon: '🐦', description: 'Defeat the Arena Lord in Wave 3.' },
    { id: 'crowdedPond', name: 'Crowded Pond', icon: '🐟', description: 'Clear Wave 4.' },
    { id: 'endlessFrog', name: 'Endless Frog', icon: '🌊', description: 'Reach Wave 5.' },
    { id: 'marathonFrog', name: 'Marathon Frog', icon: '⏱️', description: 'Survive 5 minutes in Wave 5.' },
    { id: 'untouchable', name: 'Untouchable', icon: '✨', description: 'Clear any wave without taking damage.' },
    { id: 'fullHearts', name: 'Full Hearts', icon: '💖', description: 'Reach the maximum of 7 hearts.' },
    { id: 'newRecord', name: 'New Record', icon: '🏆', description: 'Beat your own best score.' },
];
