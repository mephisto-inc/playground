import * as THREE from 'three';

// TODO: near plane is unspecified in the spec; using 0.1 as a safe default.
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 9000);

camera.position.set(300, -300, 300);
camera.up.set(0, 0, 1);
camera.lookAt(0, 0, 0);

export default camera;
