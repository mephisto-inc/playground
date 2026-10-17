import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { measureCollisionShape } from "./Collision.js";

const loader = new GLTFLoader();

export function assetUrl(path) {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, "");
}

export function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    loader.load(assetUrl(url), resolve, undefined, reject);
  });
}

export function cloneModel(template) {
  if (template.userData.__skinned === undefined) {
    let skinned = false;
    template.traverse((child) => {
      if (child.isSkinnedMesh) skinned = true;
    });
    template.userData.__skinned = skinned;
  }
  return template.userData.__skinned
    ? skeletonClone(template)
    : template.clone();
}

export function normalizeModel(model, { targetHeight, yaw = 0 } = {}) {
  model.rotation.x = Math.PI / 2;
  model.rotation.y = yaw;
  model.scale.setScalar(1);

  const raw = measureCollisionShape(model);
  const scale = targetHeight && raw.size.z > 0 ? targetHeight / raw.size.z : 1;
  model.scale.setScalar(scale);

  const shape = measureCollisionShape(model);
  model.position.z += shape.groundOffset;
  return {
    radius: shape.radius,
    groundOffset: shape.groundOffset,
    size: shape.size,
    scale,
  };
}

export function enableShadows(model) {
  model.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
}

export function cloneMaterials(model) {
  const materials = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
      materials.push(...child.material);
    } else if (child.material) {
      child.material = child.material.clone();
      materials.push(child.material);
    }
  });
  return materials;
}

export function fadeMaterials(materials, opacity) {
  const transparent = opacity < 1;
  for (const material of materials) {
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
  }
}
