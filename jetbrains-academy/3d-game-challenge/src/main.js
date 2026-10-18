import * as THREE from "three";
import "./styles/index.css";

import renderer, {resizeRenderer} from "./core/Renderer.js";
import {initProfiler} from "./core/Profiler.js";
import {getShadowMapSize, isBlobShadowsEnabled, isShadowsEnabled, recordQualityFrame,} from "./core/Quality.js";
import {hideLoadingMessage, showLoadingError} from "./ui/LoadingStatus.js";
import camera, {updateCamera} from "./world/Camera.js";
import {initArena, map, resetArenaRotation, spinArena,} from "./world/Arena.js";
import {initHouses, updateHouseFade} from "./world/Houses.js";
import {initTrees, updateTreeFade} from "./world/Trees.js";
import {initBlobShadows, updateBlobShadows,} from "./world/BlobShadows.js";
import {LIGHTS, MENU} from "./config/tuning.js";
import {getState, onStateChange, STATE} from "./core/StateMachine.js";
import {getPointerGroundPoint, initInput, onAbility} from "./core/Input.js";
import player, {
  initPlayer,
  playerReady,
  resetPlayer,
  setPlayerInvincible,
  tryActivateAbility,
  updateDeathAnimation,
} from "./entities/Player.js";
import {getEnemies, initEnemies} from "./entities/Enemy.js";
import {initBoss} from "./entities/Boss.js";
import {initProjectiles} from "./entities/Projectile.js";
import {initPickups} from "./entities/Pickup.js";
import {initTrails} from "./entities/Trail.js";
import {initAudio} from "./systems/Audio.js";
import {updateCombat} from "./systems/Combat.js";
import {updateWaves} from "./systems/Waves.js";
import {beginRun, initRun, resetWorld} from "./systems/Run.js";
import {TOTAL_WAVES} from "./config/waves.js";
import {getClass} from "./config/classes.js";
import {initUI, updateHUD} from "./ui/index.js";

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

function applyShadowQuality() {
  const size = getShadowMapSize();
  directionalLight.shadow.mapSize.set(size, size);
  if (directionalLight.shadow.map) {
    directionalLight.shadow.map.dispose();
    directionalLight.shadow.map = null;
  }
}

function applyShadowMapEnabled() {
  const enabled = isShadowsEnabled();
  if (renderer.shadowMap.enabled === enabled) return;
  renderer.shadowMap.enabled = enabled;
  scene.traverse((object) => {
    const material = object.material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (entry) entry.needsUpdate = true;
      }
    } else {
      material.needsUpdate = true;
    }
  });
}

applyShadowQuality();
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

try {
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
} catch (error) {
  console.error("Game initialization failed.", error);
  showLoadingError();
  throw error;
}

initProjectiles(scene);
initPickups(scene);
initTrails(scene);
initBlobShadows(scene);

initRun();
initUI();
hideLoadingMessage();
const profiler = initProfiler(renderer);

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

const urlParams = new URLSearchParams(window.location.search);
const profiledWave = Number.parseInt(urlParams.get("wave") ?? "", 10);
if (
  urlParams.get("profile") === "1" &&
  Number.isInteger(profiledWave) &&
  profiledWave >= 1 &&
  profiledWave <= TOTAL_WAVES
) {
  const classId = urlParams.get("class");
  setPlayerInvincible(urlParams.get("invincible") === "1");
  beginRun(getClass(classId) ? classId : "pusher", profiledWave);
}

renderer.setAnimationLoop(() => {
  const frameStart = performance.now();
  const frameDelta = clock.getDelta();
  const delta = Math.min(frameDelta, MAX_FRAME_DELTA);
  const state = getState();

  if (state === STATE.MAIN_MENU) {
    spinArena(delta);
  } else if (state === STATE.WAVE_PLAYING) {
    updateWaves(delta);
    updateCombat(delta);
  } else if (state === STATE.GAME_OVER) {
    updateDeathAnimation(delta);
  }

  if (recordQualityFrame(frameDelta, state === STATE.WAVE_PLAYING)) {
    resizeRenderer();
    applyShadowQuality();
    applyShadowMapEnabled();
  }

  updateCamera(delta, getPointerGroundPoint(), player.position);

  if (state !== STATE.MAIN_MENU) {
    updateTreeFade(delta, player.position);
    updateHouseFade(delta, player.position);
    if (isBlobShadowsEnabled()) updateBlobShadows(getEnemies());
  }
  updateHUD();
  renderer.render(scene, camera);
  profiler?.recordFrame(frameDelta, performance.now() - frameStart);
});
