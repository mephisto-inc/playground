import * as THREE from 'three';
import { updateCameraProjection } from '../world/Camera.js';

// Renderer component: wraps THREE.WebGLRenderer for the page's <canvas class="game"> and keeps
// it sized to the window.

const canvas = document.querySelector('canvas.game');

// alpha: true     -> the canvas is transparent; the page background shows through beyond the
//                    dark arena backdrop.
// antialias: true -> smooth model and floor edges.
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

// Shadows: PCFSoft gives the softest edge the default shadow map supports. Every caster/receiver
// opts in individually (see Arena/Houses/entities).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
