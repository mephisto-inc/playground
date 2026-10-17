import { DRAFT, PLAYER } from "./tuning.js";
import { CLASSES } from "./classes.js";

export const ACHIEVEMENT_TARGETS = {
  marathonSeconds: 300,
  the50kScore: 50_000,
  sharpshooterKills: 300,
  arenaChampionBosses: 5,
  deckedOutCards: DRAFT.maxCards,
  bulwarkBlocks: 25,
  powerShovePushes: 50,
  blinkDashes: 100,
  ghostTrailKills: 15,
  swarmMinionKills: 100,
  worldTourClasses: CLASSES.length,
};

export const ACHIEVEMENTS = [
  {
    id: "helloPond",
    name: "Hello to the bugged world",
    icon: "🐸",
    description: "Clear Wave 1.",
  },
  {
    id: "pigeonProblem",
    name: "Pigeon Problem",
    icon: "🐦",
    description: "Defeat the Arena Lord in Wave 3.",
  },
  {
    id: "crowdedPond",
    name: "Crowded Bug",
    icon: "🐛",
    description: "Clear Wave 4.",
  },
  {
    id: "endlessFrog",
    name: "Endless Frog",
    icon: "🌊",
    description: "Reach Wave 5.",
  },
  {
    id: "marathonFrog",
    name: "Marathon Frog",
    icon: "⏱️",
    description: `Survive ${ACHIEVEMENT_TARGETS.marathonSeconds / 60} minutes in Wave 5.`,
  },
  {
    id: "the50kPusher",
    name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Pusher`,
    icon: "🛡️",
    description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Pusher.`,
  },
  {
    id: "the50kDasher",
    name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Dasher`,
    icon: "⚡",
    description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Dasher.`,
  },
  {
    id: "the50kAnchor",
    name: `The ${ACHIEVEMENT_TARGETS.the50kScore / 1000}K: Anchor`,
    icon: "🤖",
    description: `Reach ${ACHIEVEMENT_TARGETS.the50kScore.toLocaleString()} score in a single run with the Anchor.`,
  },
  {
    id: "untouchable",
    name: "Untouchable",
    icon: "✨",
    description: "Clear any wave without taking damage.",
  },
  {
    id: "fullHearts",
    name: "Full Hearts",
    icon: "💖",
    description: `Reach the maximum of ${PLAYER.maxHearts} hearts.`,
  },
  {
    id: "newRecord",
    name: "New Record",
    icon: "🏆",
    description: "Beat your own best score.",
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    icon: "🎯",
    description: `Defeat ${ACHIEVEMENT_TARGETS.sharpshooterKills} enemies in total.`,
  },
  {
    id: "arenaChampion",
    name: "Arena Champion",
    icon: "👑",
    description: `Defeat ${ACHIEVEMENT_TARGETS.arenaChampionBosses} Arena Lords in total.`,
  },
  {
    id: "closeCall",
    name: "Close Call",
    icon: "🍃",
    description: "Survive until the doom with 1 heart.",
  },
  {
    id: "worldTour",
    name: "World Tour",
    icon: "🌍",
    description: `Play a run with each of the ${ACHIEVEMENT_TARGETS.worldTourClasses} classes.`,
  },
  {
    id: "deckedOut",
    name: "Decked Out",
    icon: "🃏",
    description: `Collect ${ACHIEVEMENT_TARGETS.deckedOutCards} power-ups in a single run.`,
  },
  {
    id: "bulwark",
    name: "Bulwark",
    icon: "🛡️",
    description: `Block ${ACHIEVEMENT_TARGETS.bulwarkBlocks} hits with the Pusher shield in total.`,
  },
  {
    id: "powerShove",
    name: "Power Shove",
    icon: "💨",
    description: `Push ${ACHIEVEMENT_TARGETS.powerShovePushes} enemies with the Pusher shockwave in a single run.`,
  },
  {
    id: "blink",
    name: "Blink",
    icon: "⚡",
    description: `Dash ${ACHIEVEMENT_TARGETS.blinkDashes} times in total.`,
  },
  {
    id: "ghostTrail",
    name: "Ghost Trail",
    icon: "🌀",
    description: `Defeat ${ACHIEVEMENT_TARGETS.ghostTrailKills} enemies with the trail in a single run.`,
  },
  {
    id: "swarm",
    name: "Swarm",
    icon: "🐝",
    description: `Defeat ${ACHIEVEMENT_TARGETS.swarmMinionKills} enemies with Minions in total.`,
  },
];
