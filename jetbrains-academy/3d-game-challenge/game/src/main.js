import * as THREE from 'three';
import './style.css';

import player, { updatePlayer } from './components/Player.js';
import camera from './components/Camera.js';
import renderer from './components/Renderer.js';
import { initEnemies, updateEnemies } from './components/Enemy.js';
import { initAttack, updateAttack } from './components/Attack.js';
import { initScore, updateScore } from './components/Score.js';
import { initGameState, updateGameState, isGameOver } from './components/GameState.js';
import { updateDifficulty } from './components/Difficulty.js';

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

// --- Ground -----------------------------------------------------------------
// TODO: temporary ground reference to visualize player movement/hop. Replace with the
//       real map when that stage is implemented. GridHelper lies in the XZ plane by
//       default, so rotate it PI/2 about X to lay it on the XY ground plane (Z-up).
const ground = new THREE.GridHelper(2000, 40);
ground.rotation.x = Math.PI / 2;
scene.add(ground);

// --- Player & camera --------------------------------------------------------
scene.add(player);
player.add(camera); // camera rides along with the player group (follow-cam)

// --- Enemies ----------------------------------------------------------------
// The enemy system loads its own model and spawns into the scene; it is stepped each frame.
initEnemies(scene);

// --- Attack -----------------------------------------------------------------
// The attack system builds its on-ground ring and listens for Space; it is stepped each frame.
initAttack(scene);

// --- Score ------------------------------------------------------------------
// Builds the on-screen readout; the survival reward and the display update in the loop below.
initScore();

// --- Game state -------------------------------------------------------------
// Owns the Game Over overlay and the Space key (attack while playing, restart when over). Must
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
      updateScore(delta);
    }
  }
  renderer.render(scene, camera);
});
