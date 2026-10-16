import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { measureCollisionShape } from './Collision.js';

// Assets component: one GLTFLoader for the whole game plus the two load-time helpers every
// entity module needs —
//
//   * normalizeModel() — lays a Y-up GLB onto this Z-up ground and scales it so its height
//     matches a target, then reports the collision radius and ground offset. Deriving the
//     scale from geometry keeps entity sizes robust to model swaps.
//   * cloneModel() — SkeletonUtils.clone for skinned models, plain clone for static ones.

const loader = new GLTFLoader();

// Prefixes a public-asset path with the build's base URL, so the absolute-looking paths used
// everywhere in src ('/assets/tode.glb') resolve in every deployment: the dev server (base '/'),
// a repository root, or a nested subpath like /game/3d-game/ (base './' from vite.config.js —
// the emitted './assets/...' then resolves against the page URL). Keeps the deploy location out
// of every individual call site.
export function assetUrl(path) {
    return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}

// Loads a GLB and resolves with its gltf object (scene + animations). Rejects on network/decode
// errors so callers can surface a message. The URL passes through assetUrl() so callers keep
// writing '/assets/...' regardless of the deploy base.
export function loadGLTF(url) {
    return new Promise((resolve, reject) => {
        loader.load(assetUrl(url), resolve, undefined, reject);
    });
}

// Clones a loaded model for one instance. Skinned meshes MUST use SkeletonUtils.clone (a plain
// clone would share and corrupt the skeleton); static meshes can use either, so this checks for
// skinning once and caches the answer on the template.
export function cloneModel(template) {
    if (template.userData.__skinned === undefined) {
        let skinned = false;
        template.traverse((child) => {
            if (child.isSkinnedMesh) skinned = true;
        });
        template.userData.__skinned = skinned;
    }
    return template.userData.__skinned ? skeletonClone(template) : template.clone();
}

// Lays a model onto the Z-up ground and scales it to `targetHeight` world units tall.
//
// The model is authored Y-up (all Poly Pizza GLBs are), so a +90-degree rotation about X lays
// its height along world Z, matching every other object in this scene.
//
// Measurement notes:
//   * Height is measured AFTER the rotation: an unscaled probe measures the model's world-Z
//     extent, giving the exact scale factor in one pass.
//   * The collision shape is then measured at the final scale, so radius/groundOffset come out
//     in real world units.
//   * `model.position.z += shape.groundOffset` lifts the model so its lowest vertex rests on
//     the ground plane (z = 0).
//
// Returns { radius, groundOffset, size } where size is the final world-space bounding size —
// house placement uses it to fit footprints inside the arena.
export function normalizeModel(model, { targetHeight, yaw = 0 } = {}) {
    model.rotation.x = Math.PI / 2; // lay the Y-up model onto the Z-up ground
    model.rotation.y = yaw;
    model.scale.setScalar(1);

    // First pass: measure the unscaled world-Z extent (the model's height after rotation).
    const raw = measureCollisionShape(model);
    const scale = targetHeight && raw.size.z > 0 ? targetHeight / raw.size.z : 1;
    model.scale.setScalar(scale);

    // Second pass: measure again at the final scale for exact radius/offset/bounds.
    const shape = measureCollisionShape(model);
    model.position.z += shape.groundOffset; // rest the lowest vertex on the ground
    return { radius: shape.radius, groundOffset: shape.groundOffset, size: shape.size, scale };
}

// Enables casting shadows on every mesh of a loaded model. Called once per template; clone
// materials/geometry are shared, and castShadow is copied by the clone, so clones inherit it.
export function enableShadows(model) {
    model.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
    });
}

// Replaces every material on a clone with its own copy, so flash tints or fade opacities on one
// instance never leak into its siblings (glTF clones share materials by default). Returns the
// list of materials so callers can restore them later. Shared by enemies (white hit flash),
// dash clones (opacity fade) and any other per-instance tinting.
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
