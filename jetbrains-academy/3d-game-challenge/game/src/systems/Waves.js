import { ENEMY, SPAWN_POINTS } from '../config/tuning.js';
import { TOTAL_WAVES, getWaveDef } from '../config/waves.js';
import {
    getAliveCount,
    getEnemyRadius,
    setDoomScaling,
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

// Waves system: drives the five waves — spawn pacing, the enemy cap, boss scheduling, clear
// conditions and the wave-5 endless escalation. main.js steps it directly with
// updateWaves(delta) only while WAVE_PLAYING, so the draft and pause freeze it for free.
//
// Division of labour: this module decides WHEN to spawn; Enemy/Boss own HOW spawning works. When
// a wave clears it pays the bonus, reports achievements and calls the clear handler — Run opens
// the power-up draft. After the draft, Run calls advanceAfterDraft() to start the next wave, and
// that is when the Audio system is told the new music stage (see startWave).

// Set by Run (registerClearHandler): "this wave is over, open the draft".
let clearHandler = null;

let wave = 0;          // 1-based current wave; 0 before the run starts
let waveElapsed = 0;   // seconds since the current wave began (wave 5: the survival chronometer)
let runElapsed = 0;    // seconds since the run began (total survival clock)
let spawnTimer = 0;    // accumulates to the spawn interval
let running = false;   // false outside a live run
let cleared = false;   // true from the clear moment until the next wave starts

// Boss scheduling per wave:
let bossPending = false;      // a boss should spawn (at start, or after the wave-5 gate)
let bossWasAlive = false;     // polls the alive -> dead transition for the death moment
let scoreCheckpoint = null;   // wave 5: score at the last boss death (null before the first boss)

// Doom mode: the first tier hits at ENEMY.doomScore, then every next tier needs half the
// previous step, rounded up to 1,000 points. Each tier doubles enemy damage, shot speed and
// attack pacing (enemy movement speed is not affected) and triples the HP of new spawns; it
// stays for the rest of the run (the world reset clears it via Enemy.resetEnemies).
let doomTier = 0;

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
    runElapsed = 0;
    spawnTimer = 0;
    cleared = false;
    bossPending = false;
    bossWasAlive = false;
    scoreCheckpoint = null;
    doomTier = 0;
}

// Starts the wave after the one that just cleared. Called by Run when the draft closes.
export function advanceAfterDraft() {
    if (!cleared) return; // guard: advancement only makes sense right after a clear
    startWave(wave + 1);
}

// HUD data: current wave number, total, the current wave's elapsed seconds (the HUD shows it
// as the chronometer during wave 5) and the boss bar's numbers (null without a live boss).
export function getWaveInfo() {
    return {
        wave,
        total: TOTAL_WAVES,
        waveElapsed,
        bossAlive: isBossAlive(),
        boss: getBossInfo(),
    };
}

// Survival clock for the HUD and the game-over recap: total run time, and the wave-5 time
// (0 until wave 5 starts). Both freeze while the world is paused or a draft is open, and stop
// at game over — updateWaves is the only ticker.
export function getSurvivalTimes() {
    return {
        total: runElapsed,
        wave5: wave === 5 ? waveElapsed : 0,
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
        setEndlessScaling(1, 1, 1); // growth restarts at 1x for the endless wave
        setBossEndlessScaling(1, 1);
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
    runElapsed += delta;

    // Doom escalation: the first tier hits at ENEMY.doomScore, then each next tier needs half
    // the previous step, rounded up to 1,000 points (50k -> +25k -> +13k -> +7k -> +4k -> +2k ->
    // +1k -> ...). Damage, shot speed and attack pacing double per tier; newly spawned enemies
    // and bosses triple their HP per tier. Checked every tick in any wave; it never turns off.
    const tier = doomTierForScore(getScore());
    if (tier !== doomTier) {
        doomTier = tier;
        setDoomScaling(Math.pow(2, tier), Math.pow(3, tier));
    }

    // Wave 5 growth: +10% HP, speed and attack per minute. HP and attack are UNCAPPED (the wave
    // must eventually defeat the player); speed is capped at 1.5x. HP is baked into each new
    // spawn; speed and attack apply live (Enemy/Boss read them from their setters). Attack
    // scales enemy shot speed, ranged fire rate, boss orb speed, boss phase pacing and the spawn
    // interval (see the ramp below).
    let growthHpMul = 1;
    let growthAttackMul = 1;
    if (wave === 5) {
        const minutes = waveElapsed / 60;
        growthHpMul = 1 + ENEMY.growthPerMinute * minutes;
        const growthSpeedMul = Math.min(1 + ENEMY.growthPerMinute * minutes, ENEMY.growthSpeedCap);
        growthAttackMul = 1 + ENEMY.growthAttackPerMinute * minutes;
        setEndlessScaling(growthHpMul, growthSpeedMul, growthAttackMul);
        setBossEndlessScaling(growthSpeedMul, growthAttackMul);
        onEndlessTime(waveElapsed); // Marathon Frog achievement at 5 minutes
    }

    // Boss scheduling: waves 3 and 5 spawn one at the start; wave 5 respawns each time 1,000
    // points are earned AFTER the previous boss died (the kill's own 1,000 do not count, which is
    // exactly why the checkpoint is taken at the death moment).
    if (definition.boss && bossPending) {
        const gateOpen = scoreCheckpoint === null
            || getScore() - scoreCheckpoint >= definition.bossRespawnScore;
        if (gateOpen) {
            // The wave definition carries the boss's speed and orb-speed multipliers (wave 5
            // runs 10% faster than wave 3), the knockback-immunity flag and the HP-rage flag.
            const boss = spawnBoss(
                definition.bossHp * growthHpMul,
                definition.bossSpeedMul,
                definition.bossOrbSpeedMul,
                !!definition.bossKnockbackImmune,
                !!definition.bossHpRage,
            );
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
            clearWave(); // wave 3 ends the moment the boss dies
            return;
        }
    }

    // Timed waves (1, 2, 4) end on their duration.
    if (Number.isFinite(definition.duration) && waveElapsed >= definition.duration) {
        clearWave();
        return;
    }

    // Spawning: at the wave's interval; in wave 5 ramping toward the endless minimum AND sped
    // up by the attack growth (never below the 0.15 s floor); while the wave-3 boss fight runs,
    // the interval is stretched (spawn rate drops to 30% of normal).
    let interval = definition.spawnInterval;
    if (wave === 5 && definition.rampSeconds) {
        const t = Math.min(waveElapsed / definition.rampSeconds, 1);
        interval += (definition.spawnIntervalMin - definition.spawnInterval) * t;
        interval = Math.max(0.15, interval / growthAttackMul);
    }
    if (definition.bossSpawnRate && isBossAlive()) interval /= definition.bossSpawnRate;

    spawnTimer += delta;
    while (spawnTimer >= interval) {
        spawnTimer -= interval;
        spawnOneEnemy(definition.pool);
    }
}

// Doom tier for a score: the first Doom at ENEMY.doomScore (50k), then each next tier needs half
// the previous step rounded UP to the next 1,000 points — 50k, +25k, +13k, +7k, +4k, +2k, +1k,
// then +1k forever (the step can never round below 1,000).
function doomTierForScore(score) {
    let tier = 0;
    let threshold = ENEMY.doomScore;
    let step = ENEMY.doomScore / 2;
    while (score >= threshold) {
        tier++;
        threshold += Math.ceil(step / 1000) * 1000;
        step /= 2;
    }
    return tier;
}

// Attempts one spawn: skipped at the ENEMY.maxAlive cap (a runaway guard only — the wave's spawn
// rate is what paces the arena), and retried spawn points are limited to the free ones (shuffled
// so consecutive spawns do not all use the same corner). Every attempt lands within
// ENEMY.spawnJitter units of its spawn point, so groups arriving from the forest do not stack on
// one exact spot.
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
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * ENEMY.spawnJitter; // even across the disc
        const x = point.x + Math.cos(angle) * distance;
        const y = point.y + Math.sin(angle) * distance;
        if (isSpotFree(x, y, radius)) {
            spawnEnemy(typeId, {x, y});
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
