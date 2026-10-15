import * as THREE from 'three';
import './styles/index.css';

import renderer from './core/Renderer.js';
import camera, { updateCamera } from './world/Camera.js';
import { initArena, map, resetArenaRotation, spinArena } from './world/Arena.js';
import { initHouses } from './world/Houses.js';
import { LIGHTS } from './config/tuning.js';
import { STATE, getState, onStateChange } from './core/StateMachine.js';
import { getPointerGroundPoint, initInput, onAbility } from './core/Input.js';
import player, {
    initPlayer,
    playerReady,
    resetPlayer,
    tryActivateAbility,
    updateDeathAnimation,
} from './entities/Player.js';
import { initEnemies } from './entities/Enemy.js';
import { initBoss } from './entities/Boss.js';
import { initProjectiles } from './entities/Projectile.js';
import { initPickups } from './entities/Pickup.js';
import { initTrails } from './entities/Trail.js';
import { initAudio } from './systems/Audio.js';
import { updateCombat } from './systems/Combat.js';
import { updateWaves } from './systems/Waves.js';
import { initRun, resetWorld } from './systems/Run.js';
import { initUI, updateHUD } from './ui/index.js';

// Main entry point: assembles the scene, loads every asset, wires the systems together and runs
// the frame loop. The loop is state-gated (GDD 1): the arena drifts in the main menu, the world
// simulates in WAVE_PLAYING, the defeat animation plays in GAME_OVER, and everything else is
// frozen — the same single state variable drives the UI and the audio through subscriptions.

const scene = new THREE.Scene();
const clock = new THREE.Clock(); // tracks elapsed time between frames (delta)

// Largest frame time the world is stepped by, in seconds (~10 fps). A backgrounded tab or a GC
// pause can make one delta huge; clamping runs the world briefly in slow motion instead of
// lurching (movement sub-stepping already prevents tunneling).
const MAX_FRAME_DELTA = 0.1;

// --- Lighting (GDD 5) ---------------------------------------------------------
// Ambient fill (light blue, 0.75) plus one directional light (15, -20, 30 / 1.1) that casts the
// soft ground shadows the GDD asks for. The shadow camera covers the whole 97.2x64.8 arena.
const ambientLight = new THREE.AmbientLight(LIGHTS.ambientColor, LIGHTS.ambientIntensity);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(LIGHTS.dirColor, LIGHTS.dirIntensity);
directionalLight.position.set(LIGHTS.dirPosition.x, LIGHTS.dirPosition.y, LIGHTS.dirPosition.z);
directionalLight.castShadow = true;
// 4096 keeps the shadow texels small enough for crisp furnishing-sized shadows across the whole
// (large) arena; the soft PCF filter smooths the rest.
directionalLight.shadow.mapSize.set(4096, 4096);
const shadowCamera = directionalLight.shadow.camera;
shadowCamera.left = -LIGHTS.shadowHalfX;
shadowCamera.right = LIGHTS.shadowHalfX;
shadowCamera.top = LIGHTS.shadowHalfY;
shadowCamera.bottom = -LIGHTS.shadowHalfY;
shadowCamera.near = LIGHTS.shadowNear;
shadowCamera.far = LIGHTS.shadowFar;
shadowCamera.updateProjectionMatrix();
scene.add(directionalLight);

// --- Input --------------------------------------------------------------------
// Owns every pointer listener: steering, the double-tap ability and the camera's pointer lead.
initInput();
onAbility(() => {
    // A double click/tap only activates the class ability during live gameplay.
    if (getState() === STATE.WAVE_PLAYING) tryActivateAbility();
});

// --- Audio ----------------------------------------------------------------------
// Started first, before any asset await: the AudioContext is created now (suspended) and the
// buffers preload while the models load, so the very first click unlocks the menu music instead
// of being missed during startup.
initAudio();

// --- World --------------------------------------------------------------------
initArena(scene);
await initHouses(map);

// --- Player, enemies, boss ------------------------------------------------------
initPlayer(scene);
await playerReady;
await Promise.all([initEnemies(scene), initBoss(scene)]);

// --- Combat plumbing -------------------------------------------------------------
initProjectiles(scene);
initPickups(scene);
initTrails(scene);

// --- Systems and UI ---------------------------------------------------------------
initRun();   // wires death -> run end, wave clear -> draft
initUI();

// State reactions that belong to the 3D world:
//   * the main menu shows the slowly rotating arena — leaving a run behind it would leave frozen
//     corpses and bullets on display, so the world is cleared when the menu is entered;
//   * everywhere else the frog is visible (GDD 1: the character selection "focuses on the
//     player"), which needs the arena's rotation back because colliders are world-space and
//     assume a level map;
//   * "Play Again" after a defeat looks at a living hero, so the death animation's faded, tilted
//     model must be restored (the fading, bullet-free battlefield too).
let previousState = getState();
onStateChange((state) => {
    const leftState = previousState;
    previousState = state;

    if (state === STATE.MAIN_MENU) {
        if (leftState !== STATE.MAIN_MENU) resetWorld(); // wipe the abandoned battlefield
        player.visible = false;
    } else {
        player.visible = true;
        if (leftState === STATE.MAIN_MENU) resetArenaRotation();
        if (state === STATE.CHARACTER_SELECTION) {
            resetWorld();
            resetPlayer(); // undo the defeat animation (spin, sink, faded materials)
        }
    }
});

// --- Loop -------------------------------------------------------------------------
renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), MAX_FRAME_DELTA);
    const state = getState();

    if (state === STATE.MAIN_MENU) {
        spinArena(delta); // the slow menu drift (GDD 1 state 1)
    } else if (state === STATE.WAVE_PLAYING) {
        updateWaves(delta);  // spawning, wave timing, boss scheduling
        updateCombat(delta); // player + enemies + boss + projectiles + pickups
    } else if (state === STATE.GAME_OVER) {
        updateDeathAnimation(delta); // the code-made defeat animation (GDD state 6)
    }
    // POWERUP_DRAFT, PAUSE_MENU and CHARACTER_SELECTION freeze the world (time step = 0).

    updateCamera(delta, getPointerGroundPoint(), player.position);
    updateHUD();
    renderer.render(scene, camera);
});
