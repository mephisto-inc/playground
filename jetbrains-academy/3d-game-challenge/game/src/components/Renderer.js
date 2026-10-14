import * as THREE from 'three';

// Renderer component: wraps THREE.WebGLRenderer for the page's <canvas class="game">.

// The canvas element declared in index.html that WebGL draws into.
const canvas = document.querySelector('canvas.game');

// alpha: true    -> transparent canvas (page background shows through)
// antialias: true -> smooth edges
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

// TODO: setSize uses raw window dimensions with no devicePixelRatio handling.
//       Revisit if the canvas looks blurry on HiDPI displays.
renderer.setSize(window.innerWidth, window.innerHeight);

export default renderer;
