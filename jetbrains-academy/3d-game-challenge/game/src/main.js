import * as THREE from 'three';
import './style.css';

import player, {playerReady, updatePlayer} from './components/Player.js';
import camera, {updateCamera} from './components/Camera.js';
import renderer from './components/Renderer.js';
import {initMap, map} from './components/Map.js';
import {initHouses} from './components/House.js';
import {initEnemies, updateEnemies} from './components/Enemy.js';
import {initAttack, updateAttack} from './components/Attack.js';
import {initScore, updateScore} from './components/Score.js';
import {initGameState, isGameOver, updateGameState} from './components/GameState.js';
import {updateDifficulty} from './components/Difficulty.js';
import {initInput} from './components/Input.js';

// Main entry point: assembles the scene from the component modules and drives the
// update/render loop.

const scene = new THREE.Scene();
const clock = new THREE.Clock(); // tracks elapsed time between frames (delta)

// Largest frame time the world is stepped by, in seconds (~10 fps). A backgrounded tab, a GC
// pause, or a slow load can make a single delta huge; without this cap the next frame would try
// to advance everything by that whole gap in one go (sub-stepping already prevents tunneling, but
// the world would visibly lurch). Clamping makes the simulation run briefly in slow motion
// instead. Frame-rate independence is unaffected for normal frames, which are well under this.
const MAX_FRAME_DELTA = 0.1;

// --- Lighting ---------------------------------------------------------------
// Flat base illumination so nothing is fully black.
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

// Directional light for shape/shadow depth, positioned up and to one side.
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

// --- Input -------------------------------------------------------------------
// Owns every pointer listener: hover/tap steering for the hero plus the double click/tap that
// routes to attack or restart. Wired up before the systems that consume it.
initInput();

// --- Map & houses -----------------------------------------------------------
initMap(scene);
await initHouses(map);

// --- Player & camera --------------------------------------------------------
scene.add(player);
updateCamera(player); // settle the orthographic camera over the hero's ground position
await playerReady;

// --- Enemies ----------------------------------------------------------------
await initEnemies(scene);

// --- Attack -----------------------------------------------------------------
// The attack system builds its on-ground ring; the double click/tap reaches it through GameState,
// and it is stepped each frame.
initAttack(scene);

// --- Score ------------------------------------------------------------------
// Builds the on-screen readout; the survival reward and the display update in the loop below.
initScore();

// --- Game state -------------------------------------------------------------
// Owns the Game Over overlay and the double activation (attack while playing, restart when over).
// Must
// come after the systems it resets so their reset functions exist when it is wired up.
initGameState();

// --- Loop -------------------------------------------------------------------
// Update order per frame: refresh difficulty (so this frame's speeds/delays reflect the current
// score), move the player, then advance the enemies (spawn + chase), then check game state (after
// the enemies have moved, so a fresh contact freezes the world the same frame), then the attack
// (cooldown + hit sweep — after the enemies have moved, so it checks fresh positions), then the
// score (after the attack, so a defeat scored this frame shows immediately), then render.
//
// Difficulty uses the score from the previous frame (updateScore runs at the end). The factor
// moves so slowly that a one-frame lag is invisible; putting the refresh first means this frame's
// movement already uses the latest value rather than waiting a full frame.
//
// While the Game Over state is up, every world update is skipped so the scene is frozen, but the
// render call still runs so the overlay/field stay on screen. The Game Over check sits between
// the enemies and the attack so a defeat takes priority: once it flips, the attack and score are
// skipped for that frame too.
renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), MAX_FRAME_DELTA);
    if (!isGameOver()) {
        updateDifficulty();
        updatePlayer(delta);
        updateEnemies(delta);
        updateGameState();
        if (!isGameOver()) {
            updateAttack(delta);
            updateScore();
        }
    }
    updateCamera(player); // follow the hero's ground position (x/y), never the hop height
    renderer.render(scene, camera);
});
