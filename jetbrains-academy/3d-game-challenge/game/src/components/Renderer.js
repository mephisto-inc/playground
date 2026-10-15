import * as THREE from 'three';
import { updateCameraProjection } from './Camera.js';

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
  // Orthographic cameras have no `aspect` field, so the frustum is rebuilt instead.
  updateCameraProjection();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export default renderer;