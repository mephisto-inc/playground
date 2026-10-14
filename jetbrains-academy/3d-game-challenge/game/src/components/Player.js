import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const player = new THREE.Group();
player.position.set(0, 0, 0); // center of the scene

const loader = new GLTFLoader();

// TODO: model loads asynchronously, so the group is returned empty and filled in
//       the callback. If later code needs the model synchronously, wrap this in a Promise.
loader.load('/models/tode.glb', (gltf) => {
  const model = gltf.scene;

  model.rotation.x = Math.PI / 2;
  model.scale.setScalar(20);

  // TODO: Z-offset spec is ambiguous. We compute the box AFTER scale + rotation and
  //       lift the model so its lowest point rests on z=0. Confirm this matches "model height".
  const box = new THREE.Box3().setFromObject(model);
  model.position.z -= box.min.z;

  player.add(model);
});

export default player;
