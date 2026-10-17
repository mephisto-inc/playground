import * as THREE from "three";
import { registerBoxCollider } from "../core/Collision.js";
import { assetUrl } from "../core/Assets.js";
import renderer from "../core/Renderer.js";
import { ARENA, MENU } from "../config/tuning.js";

export const map = new THREE.Group();

function makeFloor() {
  const texture = new THREE.TextureLoader().load(
    assetUrl("/assets/PlaneMesh.png"),
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    ARENA.width / ARENA.floorTile,
    ARENA.depth / ARENA.floorTile,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.width, ARENA.depth),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0,
    }),
  );
  floor.receiveShadow = true;
  return floor;
}

function makeBackdrop() {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.backdropSize, ARENA.backdropSize),
    new THREE.MeshStandardMaterial({
      color: ARENA.backdropColor,
      roughness: 1,
      metalness: 0,
    }),
  );
  backdrop.position.z = ARENA.backdropZ;
  backdrop.receiveShadow = true;
  return backdrop;
}

function addBoundaryWalls() {
  const halfX = ARENA.width / 2;
  const halfY = ARENA.depth / 2;
  const thickness = ARENA.wallThickness;

  const walls = [
    [0, halfY + thickness / 2, halfX + thickness, thickness / 2],
    [0, -halfY - thickness / 2, halfX + thickness, thickness / 2],
    [-halfX - thickness / 2, 0, thickness / 2, halfY + thickness],
    [halfX + thickness / 2, 0, thickness / 2, halfY + thickness],
  ];

  for (const [x, y, halfWidth, halfDepth] of walls) {
    const owner = new THREE.Object3D();
    registerBoxCollider(
      owner,
      new THREE.Vector3(x, y, 0),
      halfWidth,
      halfDepth,
      { boundary: true },
    );
  }
}

export function initArena(scene) {
  map.add(makeBackdrop());
  map.add(makeFloor());
  addBoundaryWalls();
  scene.add(map);
  return map;
}

export function spinArena(delta) {
  map.rotation.z += MENU.menuRotationSpeed * delta;
}

export function resetArenaRotation() {
  map.rotation.z = 0;
}
