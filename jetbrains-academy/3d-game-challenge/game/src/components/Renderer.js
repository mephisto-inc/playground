import * as THREE from 'three';
import camera from './Camera.js';

// Renderer component: wraps THREE.WebGLRenderer for the page's <canvas class="game">.

// The canvas element declared in index.html that WebGL draws into.
const canvas = document.querySelector('canvas.game');

// alpha: true    -> transparent canvas (page background shows through)
// antialias: true -> smooth edges
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

// Handle HiDPI displays and window resizing.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export default renderer;