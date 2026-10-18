import * as THREE from "three";
import {updateCameraProjection} from "../world/Camera.js";
import {applyViewport} from "./Viewport.js";
import {getDprCap, getShadowType, isAntialiasEnabled, isShadowsEnabled,} from "./Quality.js";

const canvas = document.querySelector("canvas.game");

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: isAntialiasEnabled(),
});

const SHADOW_TYPES = {
  PCFSoft: THREE.PCFSoftShadowMap,
  PCF: THREE.PCFShadowMap,
  Basic: THREE.BasicShadowMap,
};

renderer.shadowMap.enabled = isShadowsEnabled();
renderer.shadowMap.type = SHADOW_TYPES[getShadowType()] ?? THREE.PCFShadowMap;

function resize() {
  const rect = applyViewport();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, getDprCap()));
  renderer.setSize(rect.width, rect.height, false);

  updateCameraProjection();
}

export function resizeRenderer() {
  resize();
}

resize();
window.addEventListener("resize", resize);

window.addEventListener("orientationchange", resize);
window.visualViewport?.addEventListener("resize", resize);

export default renderer;
