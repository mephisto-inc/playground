import * as THREE from 'three';
import './style.css';

import player from './components/Player.js';
import camera from './components/Camera.js';
import renderer from './components/Renderer.js';

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

scene.add(player);
player.add(camera);

// TODO: spec never mentions rendering. Adding a minimal loop so the scene is visible;
//       remove if a later component is meant to own the render/update loop.
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
