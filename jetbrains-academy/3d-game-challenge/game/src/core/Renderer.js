import * as THREE from 'three';
import { updateCameraProjection } from '../world/Camera.js';
import { applyViewport } from './Viewport.js';

// Renderer component: wraps THREE.WebGLRenderer for the page's <canvas class="game"> and keeps
// it sized to the letterboxed game rect (core/Viewport.js). The on-screen size and position come
// from the --game-* CSS variables; only the drawing buffer is resized here.

const canvas = document.querySelector('canvas.game');

// alpha: true     -> the canvas is transparent; the page background shows through beyond the
//                    dark arena backdrop.
// antialias: true -> smooth model and floor edges.
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

// Shadows: PCFSoft gives the softest edge the default shadow map supports. Every caster/receiver
// opts in individually (see Arena/Houses/entities).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Handle HiDPI displays and window resizing (the single resize listener: it also refreshes the
// viewport variables and the camera frustum). updateStyle is false — the stylesheet's --game-*
// variables own the canvas' CSS size, so only the buffer changes here.
function resize() {
    const rect = applyViewport();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rect.width, rect.height, false);
    // Orthographic cameras have no `aspect` field, so the frustum is rebuilt instead.
    updateCameraProjection();
}

resize();
window.addEventListener('resize', resize);
// Belt-and-braces for mobile rotation: some browsers update the window size a tick after the
// orientation event, and iOS reports the visual viewport separately — re-applying on both keeps
// the game rect, the drawing buffer and the UI scale in sync after the device turns.
window.addEventListener('orientationchange', resize);
window.visualViewport?.addEventListener('resize', resize);

export default renderer;
