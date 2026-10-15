import * as THREE from 'three';
import { CAMERA } from '../config/tuning.js';

// Camera component (GDD 3A): a fixed-orientation orthographic camera looking down at the arena
// from a 55-degree tilt, 38 units up, with a diagonal (isometric-style) heading. The projection
// is orthographic, so distance does not change apparent size — position only fixes direction.
//
// The camera leads the player slightly toward the pointer (up to CAMERA.followOffsetMax units)
// and smooths every move, so the view glides instead of snapping.
//
// main.js calls updateCamera(delta, pointerGroundPoint) every frame and
// updateCameraProjection() on resize.

// The camera box is a fixed width in world units; its height follows the window aspect ratio
// (about 22.5 units tall on a 16:9 screen — GDD 3A).
const FRUSTUM_WIDTH = CAMERA.viewWidth;

const aspect = window.innerWidth / window.innerHeight;

const camera = new THREE.OrthographicCamera(
    -FRUSTUM_WIDTH / 2,
    FRUSTUM_WIDTH / 2,
    FRUSTUM_WIDTH / aspect / 2,
    -FRUSTUM_WIDTH / aspect / 2,
    CAMERA.near,
    CAMERA.far,
);

// Place the camera on a sphere around the origin: azimuth decides the heading, the tilt and
// height decide how steep the look is. Only the direction matters (orthographic), but standing
// off keeps the near/far planes comfortably around the action.
const azimuth = (CAMERA.azimuthDeg * Math.PI) / 180;
const tilt = (CAMERA.tiltDeg * Math.PI) / 180;
const horizontal = CAMERA.height / Math.tan(tilt);
camera.position.set(
    horizontal * Math.cos(azimuth),
    horizontal * Math.sin(azimuth),
    CAMERA.height,
);
camera.up.set(0, 0, 1); // Z is "up" in this scene, not the default Y
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

// The camera's resting offset from the follow point (captured once; the direction never changes).
const FOLLOW_OFFSET = camera.position.clone();

// The smoothed follow point (x/y on the ground). Starts at the origin.
const followPoint = new THREE.Vector3();

// Rebuilds the frustum from the current window shape. An orthographic camera has no `aspect`
// field, so the planes must be recomputed explicitly on resize.
export function updateCameraProjection() {
    const nextAspect = window.innerWidth / window.innerHeight;
    camera.left = -FRUSTUM_WIDTH / 2;
    camera.right = FRUSTUM_WIDTH / 2;
    camera.top = FRUSTUM_WIDTH / nextAspect / 2;
    camera.bottom = -FRUSTUM_WIDTH / nextAspect / 2;
    camera.updateProjectionMatrix();
}

// Moves the camera toward the player's ground position plus a small lead toward the pointer.
// `delta` is the frame time in seconds; `pointerGroundPoint` is the pointer's ground position
// (or null when there is none) and is only used to aim the lead.
export function updateCamera(delta, pointerGroundPoint, playerPosition) {
    // Desired follow point: the player, with a lead of up to followOffsetMax units toward the
    // pointer. The clamped lead keeps the hero from drifting to the edge of the box even when
    // the pointer is far away.
    const targetX = playerPosition.x;
    const targetY = playerPosition.y;
    if (pointerGroundPoint) {
        const dx = pointerGroundPoint.x - targetX;
        const dy = pointerGroundPoint.y - targetY;
        const distance = Math.hypot(dx, dy);
        if (distance > CAMERA.followOffsetMax) {
            // Clamp the lead to its maximum length while keeping its direction.
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

    // Exponential smoothing: frame-rate independent (1 - e^(-k*dt) converges to k per second),
    // so the camera behaves the same at 30 and 144 FPS.
    const smoothing = 1 - Math.exp(-CAMERA.followDamping * delta);
    const currentX = camera.position.x - FOLLOW_OFFSET.x;
    const currentY = camera.position.y - FOLLOW_OFFSET.y;
    camera.position.set(
        currentX + (followPoint.x - currentX) * smoothing + FOLLOW_OFFSET.x,
        currentY + (followPoint.y - currentY) * smoothing + FOLLOW_OFFSET.y,
        FOLLOW_OFFSET.z, // fixed height: the hero's hop must not bob the view
    );
}

// Snaps the camera to a follow point without smoothing (used on resets, so a new run does not
// glide in from wherever the camera happened to be).
export function snapCameraTo(playerPosition) {
    followPoint.set(playerPosition.x, playerPosition.y, 0);
    camera.position.set(
        playerPosition.x + FOLLOW_OFFSET.x,
        playerPosition.y + FOLLOW_OFFSET.y,
        FOLLOW_OFFSET.z,
    );
}

export default camera;
