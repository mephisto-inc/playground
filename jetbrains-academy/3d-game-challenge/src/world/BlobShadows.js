import * as THREE from "three";

const MAX_BLOBS = 256;

let blobMesh = null;
const scratchMatrix = new THREE.Matrix4();

function makeBlobTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.4)");
  gradient.addColorStop(0.65, "rgba(0,0,0,0.22)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function initBlobShadows(scene) {
  const geometry = new THREE.CircleGeometry(1, 20);
  const material = new THREE.MeshBasicMaterial({
    map: makeBlobTexture(),
    transparent: true,
    depthWrite: false,
  });
  blobMesh = new THREE.InstancedMesh(geometry, material, MAX_BLOBS);
  blobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobMesh.frustumCulled = false;
  blobMesh.renderOrder = 1;
  blobMesh.count = 0;
  blobMesh.visible = false;
  scene.add(blobMesh);
}

export function updateBlobShadows(enemies) {
  if (!blobMesh) return;

  let count = 0;
  for (const enemy of enemies) {
    if (count >= MAX_BLOBS) break;
    const data = enemy.userData;
    if (!data.collider || data.dying) continue;

    const radius = data.collider.radius * 1.2;
    scratchMatrix.makeScale(radius, radius, 1);
    scratchMatrix.setPosition(enemy.position.x, enemy.position.y, 0.06);
    blobMesh.setMatrixAt(count, scratchMatrix);
    count += 1;
  }

  blobMesh.count = count;
  blobMesh.visible = count > 0;
  if (count > 0) blobMesh.instanceMatrix.needsUpdate = true;
}
