import * as THREE from "three";
import "./styles/index.css";

import renderer from "./core/Renderer.js";
import camera, { updateCamera } from "./world/Camera.js";
import {
  initArena,
  map,
  resetArenaRotation,
  spinArena,
} from "./world/Arena.js";
import { initHouses, updateHouseFade } from "./world/Houses.js";
import { initTrees, updateTreeFade } from "./world/Trees.js";
import { LIGHTS, MENU } from "./config/tuning.js";
import { STATE, getState, onStateChange } from "./core/StateMachine.js";
import { getPointerGroundPoint, initInput, onAbility } from "./core/Input.js";
import player, {
  initPlayer,
  playerReady,
  resetPlayer,
  tryActivateAbility,
  updateDeathAnimation,
} from "./entities/Player.js";
import { initEnemies } from "./entities/Enemy.js";
import { initBoss } from "./entities/Boss.js";
import { initProjectiles } from "./entities/Projectile.js";
import { initPickups } from "./entities/Pickup.js";
import { initTrails } from "./entities/Trail.js";
import { initAudio } from "./systems/Audio.js";
import { updateCombat } from "./systems/Combat.js";
import { updateWaves } from "./systems/Waves.js";
import { initRun, resetWorld } from "./systems/Run.js";
import { initUI, updateHUD } from "./ui/index.js";

const scene = new THREE.Scene();
const clock = new THREE.Clock();

const MAX_FRAME_DELTA = 0.1;

const ambientLight = new THREE.AmbientLight(
  LIGHTS.ambientColor,
  LIGHTS.ambientIntensity,
);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
  LIGHTS.dirColor,
  LIGHTS.dirIntensity,
);
directionalLight.position.set(
  LIGHTS.dirPosition.x,
  LIGHTS.dirPosition.y,
  LIGHTS.dirPosition.z,
);
directionalLight.castShadow = true;

directionalLight.shadow.mapSize.set(4096, 4096);
const shadowCamera = directionalLight.shadow.camera;
shadowCamera.left = -LIGHTS.shadowHalfX;
shadowCamera.right = LIGHTS.shadowHalfX;
shadowCamera.top = LIGHTS.shadowHalfY;
shadowCamera.bottom = -LIGHTS.shadowHalfY;
shadowCamera.near = LIGHTS.shadowNear;
shadowCamera.far = LIGHTS.shadowFar;
shadowCamera.updateProjectionMatrix();
scene.add(directionalLight);

initInput();
onAbility(() => {
  if (getState() === STATE.WAVE_PLAYING) tryActivateAbility();
});

initAudio();

initArena(scene);
await initHouses(map);
await initTrees(map);

document.documentElement.style.setProperty(
  "--vignette-strength",
  String(MENU.vignetteStrength),
);
document.documentElement.style.setProperty(
  "--vignette-color",
  MENU.vignetteColor,
);

initPlayer(scene);
await playerReady;
await Promise.all([initEnemies(scene), initBoss(scene)]);

initProjectiles(scene);
initPickups(scene);
initTrails(scene);

initRun();
initUI();

let previousState = getState();
onStateChange((state) => {
  const leftState = previousState;
  previousState = state;

  if (state === STATE.MAIN_MENU) {
    if (leftState !== STATE.MAIN_MENU) resetWorld();
    player.visible = false;
  } else {
    player.visible = true;
    if (leftState === STATE.MAIN_MENU) resetArenaRotation();
    if (state === STATE.CHARACTER_SELECTION) {
      resetWorld();
      resetPlayer();
    }
  }
});

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), MAX_FRAME_DELTA);
  const state = getState();

  if (state === STATE.MAIN_MENU) {
    spinArena(delta);
  } else if (state === STATE.WAVE_PLAYING) {
    updateWaves(delta);
    updateCombat(delta);
  } else if (state === STATE.GAME_OVER) {
    updateDeathAnimation(delta);
  }

  updateCamera(delta, getPointerGroundPoint(), player.position);

  if (state !== STATE.MAIN_MENU) {
    updateTreeFade(delta, player.position);
    updateHouseFade(delta, player.position);
  }
  updateHUD();
  renderer.render(scene, camera);
});
