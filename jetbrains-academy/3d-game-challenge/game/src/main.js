import * as THREE from 'three';
import './style.css';

import player, { updatePlayer } from './components/Player.js';
import camera from './components/Camera.js';
import renderer from './components/Renderer.js';

// Main entry point: assembles the scene from the component modules and drives the
// update/render loop.

const scene = new THREE.Scene();
const clock = new THREE.Clock(); // tracks elapsed time between frames (delta)

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

// --- Loop -------------------------------------------------------------------
// setAnimationLoop runs once per display frame: advance the player, then draw the scene.
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  updatePlayer(delta);
  renderer.render(scene, camera);
});
