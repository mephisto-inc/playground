import * as THREE from 'three';
import camera from '../world/Camera.js';
import renderer from './Renderer.js';
import { MOVE } from '../config/tuning.js';

// Input component (GDD 3B, 4A): the single owner of pointer input (mouse, touch, pen) for the
// whole game — no other module adds pointer listeners.
//
//   * Movement — the pointer position is unprojected onto the ground every frame. Player.js pulls
//     the steering target through getMoveTarget(): the hero hops toward that point while it sits
//     outside MOVE.deadzone. A touch drag steers like hovering a mouse; lifting the finger drops
//     the target so the hero settles where the gesture ended.
//   * Ability — a double click or double tap (two stationary releases within DOUBLE_TAP_MS and
//     DOUBLE_TAP_MAX_DIST_PX of each other) fires onAbility() callbacks. main.js forwards that to
//     Player.tryActivateAbility() only while WAVE_PLAYING, so a double click on a menu button can
//     never trigger the class ability.
//   * Camera — getPointerGroundPoint() feeds Camera's lead-toward-pointer; null when the pointer
//     is inactive (no finger down) so the camera recentres.
//
// Events that land on UI elements (buttons, modals) never steer or trigger abilities: every
// handler checks the event target against the renderer's canvas first.

// A stationary release with more than this many pixels of travel since its pointerdown was a
// drag (steering), never a tap.
const TAP_MAX_MOVE_PX = 10;

// Double-tap detection window and max distance between the two taps, in ms and client px.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MAX_DIST_PX = 40;

// --- Pointer state -------------------------------------------------------------
const pointerNDC = new THREE.Vector2(); // latest pointer position in NDC (screen space)
let pointerActive = false; // false until the pointer is seen, and when a touch has lifted
const moveTarget = new THREE.Vector3(); // shared result of getMoveTarget (read-only for callers)
const pointerGroundPoint = new THREE.Vector3(); // shared result of getPointerGroundPoint
const rayStart = new THREE.Vector3(); // scratch: ground-clip point of the pointer ray
const rayEnd = new THREE.Vector3(); // scratch: far-clip point of the pointer ray

let pointerDownOnCanvas = false; // a gesture that began on the canvas is still in progress
let downX = 0; // pointerdown position of the gesture being finished, in client px
let downY = 0;
let lastTapTime = 0; // when the previous stationary release happened (0 = none)
let lastTapX = 0;
let lastTapY = 0;

const abilityCallbacks = [];
let initialized = false;

// Registers the pointer listeners. Called once from main.js before the loop starts.
export function initInput() {
    if (initialized) return; // guard: a stray second call must not double-register listeners
    initialized = true;

    const isCanvas = (event) => event.target === renderer.domElement;

    // Live pointer position: mouse hover and touch dragging both come through here.
    const track = (event) => {
        pointerNDC.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1,
        );
        pointerActive = true;
    };

    window.addEventListener('pointermove', (event) => {
        if (isCanvas(event)) track(event); // hovering UI must not steer the hero
    });

    window.addEventListener('pointerdown', (event) => {
        if (!isCanvas(event)) {
            pointerDownOnCanvas = false; // UI gesture: ignore entirely
            return;
        }
        track(event);
        pointerDownOnCanvas = true;
        downX = event.clientX;
        downY = event.clientY;
    });

    window.addEventListener('pointerup', (event) => {
        if (!pointerDownOnCanvas) return;
        pointerDownOnCanvas = false;

        // Stationary release: judge it as a tap (double taps activate the ability).
        const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
        if (moved <= TAP_MAX_MOVE_PX) registerTap(event);

        // A lifted touch stops steering; the hero settles where the gesture ended.
        if (event.pointerType === 'touch') pointerActive = false;
    });

    // A cancelled gesture (the browser took the pointer over) can neither tap nor leave touch
    // steering dangling.
    window.addEventListener('pointercancel', (event) => {
        pointerDownOnCanvas = false;
        if (event.pointerType === 'touch') pointerActive = false;
    });
}

// Registers a handler for ability activations (double click / double tap). main.js is the only
// caller and forwards to the player's class ability while a run is live.
export function onAbility(callback) {
    abilityCallbacks.push(callback);
}

// Judges one stationary release: within the double-tap window and distance of the previous one
// it fires the ability (and resets, so a third click starts over instead of chaining).
function registerTap(event) {
    const now = performance.now();
    const distance = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY);

    if (now - lastTapTime <= DOUBLE_TAP_MS && distance <= DOUBLE_TAP_MAX_DIST_PX) {
        lastTapTime = 0; // consume the pair; no accidental triple-tap activation
        for (const callback of abilityCallbacks) callback();
        return;
    }

    lastTapTime = now;
    lastTapX = event.clientX;
    lastTapY = event.clientY;
}

// World-space ground point the hero should hop toward, or null when the pointer is inactive or
// inside the deadzone around `fromPosition`. Distance is measured on the ground plane only, so
// the hop height never shrinks the deadzone. The returned vector is shared and reused — treat it
// as read-only (callers copy what they need).
export function getMoveTarget(fromPosition) {
    if (!pointerActive) return null;
    if (!unprojectToGround(moveTarget)) return null;

    const dx = moveTarget.x - fromPosition.x;
    const dy = moveTarget.y - fromPosition.y;
    if (Math.hypot(dx, dy) <= MOVE.deadzone) return null;
    return moveTarget;
}

// Ground point under the pointer for the camera's lead, or null while the pointer is inactive.
// Shares one scratch vector — read-only for callers.
export function getPointerGroundPoint() {
    if (!pointerActive) return null;
    return unprojectToGround(pointerGroundPoint) ? pointerGroundPoint : null;
}

// Ground point under the pointer, written into `out`, or null when the ray misses the ground
// plane. The ray is built from two unprojected clip depths, which stays correct for this
// orthographic camera (whose view rays are parallel).
function unprojectToGround(out) {
    camera.updateWorldMatrix(true, false); // the camera is translated every frame; refresh first
    rayStart.set(pointerNDC.x, pointerNDC.y, -1).unproject(camera);
    rayEnd.set(pointerNDC.x, pointerNDC.y, 1).unproject(camera);
    rayEnd.sub(rayStart);
    if (Math.abs(rayEnd.z) < 1e-9) return null; // ray parallel to the ground — no ground point
    const t = -rayStart.z / rayEnd.z; // distance along the ray until it hits the ground plane
    out.set(rayStart.x + rayEnd.x * t, rayStart.y + rayEnd.y * t, 0);
    return out;
}
