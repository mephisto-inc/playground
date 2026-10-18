import * as THREE from "three";
import {cloneModel, enableShadows, loadGLTF, normalizeModel,} from "../core/Assets.js";
import {registerBoxCollider} from "../core/Collision.js";
import {COLLISION, HOUSE, TREES} from "../config/tuning.js";
import {updateFade} from "./Fade.js";

const houses = [];

async function placeHouse(definition, mapGroup) {
  const gltf = await loadGLTF(`/assets/${definition.asset}.glb`);
  const template = gltf.scene;

  const toCenter = Math.atan2(-definition.y, -definition.x);
  const yaw = Math.round(toCenter / (Math.PI / 2)) * (Math.PI / 2);

  const model = cloneModel(template);
  enableShadows(model);

  const materials = new Set();
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      for (const material of child.material) materials.add(material);
    } else if (child.material) {
      materials.add(child.material);
    }
  });

  normalizeModel(model, {targetHeight: HOUSE.houseHeight, yaw});

  const scratch = new THREE.Group();
  scratch.add(model);
  scratch.updateMatrixWorld(true);
  const firstBox = new THREE.Box3().setFromObject(scratch);
  const firstSize = firstBox.getSize(new THREE.Vector3());
  const longestFootprint = Math.max(firstSize.x, firstSize.y);
  if (longestFootprint > HOUSE.houseMaxFootprint) {
    const shrinkFactor = HOUSE.houseMaxFootprint / longestFootprint;
    normalizeModel(model, {
      targetHeight: HOUSE.houseHeight * shrinkFactor,
      yaw,
    });
  }

  scratch.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scratch);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const group = new THREE.Group();
  model.position.x -= center.x;
  model.position.y -= center.y;
  group.add(model);
  group.position.set(definition.x, definition.y, 0);
  mapGroup.add(group);

  const halfWidth = (size.x / 2) * COLLISION.houseRadiusMul;
  const halfDepth = (size.y / 2) * COLLISION.houseRadiusMul;
  registerBoxCollider(group, group.position, halfWidth, halfDepth);

  houses.push({object: group, materials, opacity: 1});
}

export function getHouseCenters() {
  return HOUSE.houses.map((house) => ({x: house.x, y: house.y}));
}

export async function initHouses(mapGroup) {
  for (const definition of HOUSE.houses) {
    try {
      await placeHouse(definition, mapGroup);
    } catch (error) {
      console.error(
        `Failed to load house model ${definition.asset}.glb`,
        error,
      );
    }
  }
}

export function updateHouseFade(delta, playerPosition) {
  updateFade(houses, delta, playerPosition, {
    radius: HOUSE.houseFadeRadius,
    lateral: HOUSE.houseFadeLateral,
    targetOpacity: TREES.fadeOpacity,
    duration: TREES.fadeDuration,
  });
}
