import * as THREE from "three";
import {CAMERA} from "../config/tuning.js";
import {getAspect} from "../core/Viewport.js";

const FRUSTUM_WIDTH = CAMERA.viewWidth;

const aspect = getAspect();

const camera = new THREE.OrthographicCamera(
  -FRUSTUM_WIDTH / 2,
  FRUSTUM_WIDTH / 2,
  FRUSTUM_WIDTH / aspect / 2,
  -FRUSTUM_WIDTH / aspect / 2,
  CAMERA.near,
  CAMERA.far,
);

const azimuth = (CAMERA.azimuthDeg * Math.PI) / 180;
const tilt = (CAMERA.tiltDeg * Math.PI) / 180;
const horizontal = CAMERA.height / Math.tan(tilt);
camera.position.set(
  horizontal * Math.cos(azimuth),
  horizontal * Math.sin(azimuth),
  CAMERA.height,
);
camera.up.set(0, 0, 1);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

const FOLLOW_OFFSET = camera.position.clone();

const followPoint = new THREE.Vector3();

export function updateCameraProjection() {
  const nextAspect = getAspect();
  camera.left = -FRUSTUM_WIDTH / 2;
  camera.right = FRUSTUM_WIDTH / 2;
  camera.top = FRUSTUM_WIDTH / nextAspect / 2;
  camera.bottom = -FRUSTUM_WIDTH / nextAspect / 2;
  camera.updateProjectionMatrix();
}

export function updateCamera(delta, pointerGroundPoint, playerPosition) {
  const targetX = playerPosition.x;
  const targetY = playerPosition.y;
  if (pointerGroundPoint) {
    const dx = pointerGroundPoint.x - targetX;
    const dy = pointerGroundPoint.y - targetY;
    const distance = Math.hypot(dx, dy);
    if (distance > CAMERA.followOffsetMax) {
      const factor = CAMERA.followOffsetMax / distance;
      followPoint.x = targetX + dx * factor;
      followPoint.y = targetY + dy * factor;
    } else {
      followPoint.x = targetX + dx;
      followPoint.y = targetY + dy;
    }
  } else {
    followPoint.x = targetX;
    followPoint.y = targetY;
  }

  const smoothing = 1 - Math.exp(-CAMERA.followDamping * delta);
  const currentX = camera.position.x - FOLLOW_OFFSET.x;
  const currentY = camera.position.y - FOLLOW_OFFSET.y;
  camera.position.set(
    currentX + (followPoint.x - currentX) * smoothing + FOLLOW_OFFSET.x,
    currentY + (followPoint.y - currentY) * smoothing + FOLLOW_OFFSET.y,
    FOLLOW_OFFSET.z,
  );
}

export function snapCameraTo(playerPosition) {
  followPoint.set(playerPosition.x, playerPosition.y, 0);
  camera.position.set(
    playerPosition.x + FOLLOW_OFFSET.x,
    playerPosition.y + FOLLOW_OFFSET.y,
    FOLLOW_OFFSET.z,
  );
}

export function getGroundViewCull(target, margin) {
  target.x = camera.position.x - FOLLOW_OFFSET.x;
  target.y = camera.position.y - FOLLOW_OFFSET.y;
  const halfWidth = FRUSTUM_WIDTH / 2;
  const halfHeight = FRUSTUM_WIDTH / getAspect() / 2;
  target.radius = Math.hypot(halfWidth, halfHeight) + margin;
  return target;
}

export default camera;
