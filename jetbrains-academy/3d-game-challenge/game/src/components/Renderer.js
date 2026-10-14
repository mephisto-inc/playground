import * as THREE from 'three';

const canvas = document.querySelector('canvas.game');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

// TODO: setSize uses raw window dimensions with no devicePixelRatio handling.
//       Revisit if the canvas looks blurry on HiDPI displays.
renderer.setSize(window.innerWidth, window.innerHeight);

export default renderer;
