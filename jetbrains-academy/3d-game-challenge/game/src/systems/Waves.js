import { ENEMY, SPAWN_POINTS } from '../config/tuning.js';
import { TOTAL_WAVES, getWaveDef } from '../config/waves.js';
import {
    getAliveCount,
    getEnemyRadius,
    setEndlessScaling,
    spawnEnemy,
} from '../entities/Enemy.js';
import {
    getBossInfo,
    isBossAlive,
    setBossEndlessScaling,
    spawnBoss,
} from '../entities/Boss.js';
import { isSpotFree } from '../core/Collision.js';
import { addScore, getScore } from './Score.js';
import {
    onBossDefeated,
    onEndlessTime,
    onWaveCleared,
    onWaveStarted,
} from './Achievements.js';
import { setWaveStage } from './Audio.js';

// Waves system (GDD 6B): drives the five waves — spawn pacing, the enemy cap, boss scheduling,
// clear conditions and the wave-5 endless escalation. main.js steps it (through Run's loop) with
// updateWaves(delta) only while WAVE_PLAYING, so the draft and pause freeze it for free.
//
// Division of labour: this module decides WHEN to spawn; Enemy/Boss own HOW spawning works. When
// a wave clears it pays the bonus, reports achievements, tells the Audio system the new stage,
// and calls the clear handler — Run opens the power-up draft. After the draft, Run calls
// advanceAfterDraft() to start the next wave.

// Set by Run (registerClearHandler): "this wave is over, open the draft".
let clearHandler = null;

let wave = 0;          // 1-based current wave; 0 before the run starts
let waveElapsed = 0;   // seconds since the current wave began
let spawnTimer = 0;    // accumulates to the spawn interval
let running = false;   // false outside a live run
let cleared = false;   // true from the clear moment until the next wave starts

// Boss scheduling per wave:
let bossPending = false;      // a boss should spawn (at start, or after the wave-5 gate)
let bossWasAlive = false;     // polls the alive -> dead transition for the death moment
let scoreCheckpoint = null;   // wave 5: score at the last boss death (null before the first boss)

// Registers the wave-clear handler. Run.js calls this once; the handler receives the wave number.
export function registerClearHandler(callback) {
    clearHandler = callback;
}

// Begins the run at wave 1. Called by Run.beginRun().
export function startRun() {
    running = true;
    startWave(1);
}

// Clears all wave state for a fresh run (Run.resetWorld()).
export function resetWaves() {
    running = false;
    wave = 0;
    waveElapsed = 0;
    spawnTimer = 0;
    cleared = false;
    bossPending = false;
    bossWasAlive = false;
    scoreCheckpoint = null;
}

// Starts the wave after the one that just cleared. Called by Run when the draft closes.
export function advanceAfterDraft() {
    if (!cleared) return; // guard: advancement only makes sense right after a clear
    startWave(wave + 1);
}

// HUD data: current wave number, total, and the boss bar's numbers (null without a live boss).
export function getWaveInfo() {
    return {
        wave,
        total: TOTAL_WAVES,
        bossAlive: isBossAlive(),
        boss: getBossInfo(),
    };
}

// --- Internals -------------------------------------------------------------------

function startWave(number) {
    wave = number;
    waveElapsed = 0;
    spawnTimer = 0;
    cleared = false;

    const definition = getWaveDef(number);
    bossPending = !!definition.boss;
    bossWasAlive = false;
    // The wave-5 respawn gate only applies AFTER a boss death, so the first boss is ungated.
    scoreCheckpoint = null;

    if (number === 5) {
        setEndlessScaling(1, 1); // growth restarts at 1x for the endless wave
        setBossEndlessScaling(1);
    }

    onWaveStarted(number); // achievements: Endless Frog at wave 5, damage tracker reset
    setWaveStage(number, false); // music step for the new wave (no boss yet)
}

// One wave tick: growth, boss scheduling, clear conditions, spawning — in that order, so a wave
// that clears this frame does not also spawn.
export function updateWaves(delta) {
    // Nothing to do before the run starts, or after a wave cleared (the draft is open).
    if (!running || cleared) return;
    const definition = getWaveDef(wave);
    if (!definition) return;

    waveElapsed += delta;

    // Wave 5 growth (GDD 6B): +10% HP and speed per minute, capped at 3x HP / 1.5x speed. HP is
    // baked into each new spawn; speed applies live (Enemy/Boss read it from their setters).
    let growthHpMul = 1;
    if (wave === 5) {
        const minutes = waveElapsed / 60;
        growthHpMul = Math.min(1 + ENEMY.growthPerMinute * minutes, ENEMY.growthHpCap);
        const growthSpeedMul = Math.min(1 + ENEMY.growthPerMinute * minutes, ENEMY.growthSpeedCap);
        setEndlessScaling(growthHpMul, growthSpeedMul);
        setBossEndlessScaling(growthSpeedMul);
        onEndlessTime(waveElapsed); // Marathon Frog achievement at 5 minutes
    }

    // Boss scheduling: waves 3 and 5 spawn one at the start; wave 5 respawns each time 1,000
    // points are earned AFTER the previous boss died (GDD 6B — the kill's own 1,000 do not count,
    // which is exactly why the checkpoint is taken at the death moment).
    if (definition.boss && bossPending) {
        const gateOpen = scoreCheckpoint === null
            || getScore() - scoreCheckpoint >= definition.bossRespawnScore;
        if (gateOpen) {
            const boss = spawnBoss(definition.bossHp * growthHpMul);
            if (boss) {
                bossPending = false;
                bossWasAlive = true;
                setWaveStage(wave, true); // music: boss step while it lives
            }
        }
    }

    // Boss death detection (enables the next music step, achievements, wave-3 ending).
    if (bossWasAlive && !isBossAlive()) {
        bossWasAlive = false;
        onBossDefeated(wave);
        setWaveStage(wave, false);
        if (wave === 5) {
            scoreCheckpoint = getScore(); // start the 1,000-point respawn counter
            bossPending = true;
        } else if (wave === 3) {
            clearWave(); // wave 3 ends the moment the boss dies (GDD 6B)
            return;
        }
    }

    // Timed waves (1, 2, 4) end on their duration.
    if (Number.isFinite(definition.duration) && waveElapsed >= definition.duration) {
        clearWave();
        return;
    }

    // Spawning: at the wave's interval; in wave 5 ramping toward the endless minimum; during the
    // wave-3 boss fight at 30% of the normal rate (GDD 6B: spawn rate -70% while the boss lives).
    let interval = definition.spawnInterval;
    if (wave === 5 && definition.rampSeconds) {
        const t = Math.min(waveElapsed / definition.rampSeconds, 1);
        interval += (definition.spawnIntervalMin - definition.spawnInterval) * t;
    }
    if (definition.bossSpawnRate && isBossAlive()) interval /= definition.bossSpawnRate;

    spawnTimer += delta;
    while (spawnTimer >= interval) {
        spawnTimer -= interval;
        spawnOneEnemy(definition.pool);
    }
}

// Attempts one spawn: skipped at the 35-enemy cap, and retried spawn points are limited to the
// free ones (shuffled so consecutive spawns do not all use the same corner).
function spawnOneEnemy(pool) {
    if (getAliveCount() >= ENEMY.maxAlive) return;

    const typeId = pool[Math.floor(Math.random() * pool.length)];
    const radius = getEnemyRadius(typeId);

    const candidates = SPAWN_POINTS.map((point) => point);
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const point of candidates) {
        if (isSpotFree(point.x, point.y, radius)) {
            spawnEnemy(typeId, point);
            return;
        }
    }
}

// Ends the current wave: pays the bonus (500 x wave number, waves 1-4 — wave 5 never clears),
// reports achievements, and hands over to the draft.
function clearWave() {
    cleared = true;
    const definition = getWaveDef(wave);
    if (definition.clearBonusMul) addScore(definition.clearBonusMul * wave);
    onWaveCleared(wave);
    if (clearHandler) clearHandler(wave);
}
