import * as THREE from "three";
import { updateCameraProjection } from "../world/Camera.js";
import { applyViewport } from "./Viewport.js";

const canvas = document.querySelector("canvas.game");

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
});

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function resize() {
  const rect = applyViewport();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(rect.width, rect.height, false);

  updateCameraProjection();
}

resize();
window.addEventListener("resize", resize);

window.addEventListener("orientationchange", resize);
window.visualViewport?.addEventListener("resize", resize);

export default renderer;
