import * as THREE from 'three';

// Camera component: an orthographic ("isometric") camera for the Z-up scene, looking down at the
// ground at a fixed angle. Because the projection is orthographic, distance does not change the
// zoom — position only fixes the viewing direction (and keeps the scene inside the clip planes).
//
// main.js calls updateCamera(player) each frame so the camera tracks the hero's GROUND position
// (x/y) but not the hop height (z), and calls updateCameraProjection() whenever the window aspect
// changes.
//
// TODO: near plane is unspecified in the spec; using 0.1 as a safe default.

// Vertical extent of the view, in world units — this is the zoom. It also sets how far off-screen
// enemies spawn (Enemy.js measures the screen edge), so it affects pacing; no zoom preference yet.
const VIEW_HEIGHT = 200;

// Viewing direction, as a point on a sphere around the origin. Azimuth spins around the vertical
// axis; elevation is the angle above the floor. 45 deg / 55 deg gives the steep, symmetric
// top-down look chosen for this game.
const CAMERA_AZIMUTH = -Math.PI / 4;              // -45 deg: the +X/-Y quadrant
const CAMERA_ELEVATION = (55 * Math.PI) / 180;    // 55 deg above the floor
const CAMERA_DISTANCE = 520;                      // arbitrary for orthographic; keeps the scene in range

const aspect = window.innerWidth / window.innerHeight;

const camera = new THREE.OrthographicCamera(
  (-VIEW_HEIGHT * aspect) / 2, // left
  (VIEW_HEIGHT * aspect) / 2,  // right
  VIEW_HEIGHT / 2,             // top
  -VIEW_HEIGHT / 2,            // bottom
  0.1,                         // near clipping plane
  9000,                        // far clipping plane
);

// Place the camera on the sphere: horizontal offset from the azimuth, height from the elevation.
const horizontal = CAMERA_DISTANCE * Math.cos(CAMERA_ELEVATION);
camera.position.set(
  horizontal * Math.cos(CAMERA_AZIMUTH),
  horizontal * Math.sin(CAMERA_AZIMUTH),
  CAMERA_DISTANCE * Math.sin(CAMERA_ELEVATION),
);
camera.up.set(0, 0, 1); // Z is "up" in this scene, not the default Y
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

// The camera's resting offset from the follow target (captured once; the direction never changes).
const FOLLOW_OFFSET = camera.position.clone();

// Rebuilds the frustum from the current window shape. Call this on resize — an orthographic camera
// has no `aspect` field, so the left/right/top/bottom planes must be recomputed instead.
export function updateCameraProjection() {
  const nextAspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_HEIGHT * nextAspect) / 2;
  camera.right = (VIEW_HEIGHT * nextAspect) / 2;
  camera.top = VIEW_HEIGHT / 2;
  camera.bottom = -VIEW_HEIGHT / 2;
  camera.updateProjectionMatrix();
}

// Keeps the camera over the follow target's ground position. z is pinned to the resting height so
// the hero's hop does not shift the view; only the fixed translation changes, so the viewing angle
// stays put.
export function updateCamera(followTarget) {
  camera.position.set(
    followTarget.position.x + FOLLOW_OFFSET.x,
    followTarget.position.y + FOLLOW_OFFSET.y,
    FOLLOW_OFFSET.z,
  );
}

export default camera;
