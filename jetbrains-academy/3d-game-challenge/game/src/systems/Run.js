import { STATE, getState, setState } from '../core/StateMachine.js';
import { snapCameraTo } from '../world/Camera.js';
import player, {
    applyCard,
    configureClass,
    getCollectedCards,
} from '../entities/Player.js';
import { clearProjectiles } from '../entities/Projectile.js';
import { clearPickups } from '../entities/Pickup.js';
import { clearTrails } from '../entities/Trail.js';
import { clearMinions } from '../entities/Minion.js';
import { resetEnemies } from '../entities/Enemy.js';
import { resetBoss } from '../entities/Boss.js';
import { onPlayerDeath, onPowerupCollected, resetCombat } from './Combat.js';
import {
    advanceAfterDraft,
    registerClearHandler,
    resetWaves,
    startRun as startWaves,
} from './Waves.js';
import { openDraft, resetDraft } from './PowerupDraft.js';
import { commitScore, getBestScore, resetScore } from './Score.js';
import { checkNewRecord, getRunUnlocks, resetRunTracking } from './Achievements.js';

// Run system: the orchestrator that owns a single run's life — starting it (class, score, world
// reset, wave 1), the draft hand-off between waves, and the end (score commit, achievements,
// GAME_OVER state). main.js calls initRun() once and then only steps the loop; everything else
// flows through here or through the state machine.

let initialized = false;
let lastCommit = null; // the Score.commitScore() result of the run that just ended
let bonusDraft = false; // true while the open draft came from a power-up drop, not a wave clear

// Wires the cross-module callbacks. Called once from main.js after all assets load.
export function initRun() {
    if (initialized) return;
    initialized = true;

    // Combat reports the player's death; the run decides what it means.
    onPlayerDeath(() => endRun());

    // Waves reports a cleared wave; the run opens the power-up draft (after waves 1-4).
    registerClearHandler(() => {
        bonusDraft = false;
        openDraft();
        setState(STATE.POWERUP_DRAFT);
    });

    // Combat reports a collected power-up drop; the run opens the bonus draft.
    onPowerupCollected(() => openBonusDraft());
}

// Opens the bonus draft granted by a collected power-up drop. Unlike a wave draft, the run
// (and the wave) does not advance when the card is picked: play simply resumes where it was.
export function openBonusDraft() {
    if (getState() !== STATE.WAVE_PLAYING) return; // never fight an already-open draft
    bonusDraft = true;
    openDraft();
    setState(STATE.POWERUP_DRAFT);
}

// Starts a fresh run with the chosen class (from the character-selection modal).
export function beginRun(classId) {
    resetWorld();          // clear anything left from a previous run
    configureClass(classId); // stats, hearts, collected cards, minions for the class
    resetScore();
    resetRunTracking();    // achievements' per-run trackers
    resetDraft();          // 3 fresh offers + the once-per-run reshuffle
    bonusDraft = false;
    snapCameraTo(player.position);
    startWaves();          // running = true, wave 1 begins
    setState(STATE.WAVE_PLAYING);
}

// Applies the chosen draft card and resumes play. A wave draft advances to the next wave; a
// bonus draft from a power-up drop resumes the SAME wave where it was frozen.
export function completeDraft(card) {
    applyCard(card);
    if (bonusDraft) {
        bonusDraft = false;
    } else {
        advanceAfterDraft(); // starts the next wave (audio stage follows inside)
    }
    setState(STATE.WAVE_PLAYING);
}

// Ends the run: commits the score, evaluates the New Record achievement, freezes into GAME_OVER
// (main plays the defeat animation there).
function endRun() {
    // The Anchor minions vanish with their master, so no companions float around the corpse or
    // survive into the game-over screen.
    clearMinions();
    lastCommit = commitScore();
    checkNewRecord(lastCommit);
    setState(STATE.GAME_OVER);
}

// Clears every live system for a clean slate. Also called at the start of beginRun().
export function resetWorld() {
    clearProjectiles();
    clearPickups();
    clearTrails();
    clearMinions();  // no companions may survive into a menu or a new run
    resetBoss();     // must run before resetEnemies(): the boss lives in the enemy list
    resetEnemies();
    resetCombat();
    resetWaves();
}

// Everything the game-over screen needs: final score, best, record flag, collected cards and
// the achievements unlocked during this run. Validity: meaningful after endRun().
export function getGameOverSummary() {
    return {
        score: lastCommit ? lastCommit.finalScore : 0,
        best: getBestScore(),
        isRecord: lastCommit ? lastCommit.isRecord : false,
        cards: getCollectedCards(),
        unlocked: getRunUnlocks(),
    };
}
