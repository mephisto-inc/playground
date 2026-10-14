import * as THREE from 'three';

// Camera component: a perspective camera for the Z-up scene. It is created here and,
// in main.js, attached as a child of the player group so it follows the player.
//
// TODO: near plane is unspecified in the spec; using 0.1 as a safe default.
const camera = new THREE.PerspectiveCamera(
  30,                                     // field of view (degrees)
  window.innerWidth / window.innerHeight, // aspect ratio
  0.1,                                    // near clipping plane
  9000                                    // far clipping plane
);

camera.position.set(300, -300, 300); // pulled back and up for a 3/4 view of the origin
camera.up.set(0, 0, 1);              // Z is "up" in this scene, not the default Y
camera.lookAt(0, 0, 0);              // aim at the scene center

export default camera;
