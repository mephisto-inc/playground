import * as THREE from 'three';
import { registerBoxCollider } from '../core/Collision.js';
import { ARENA } from '../config/tuning.js';

// Arena component (GDD 5): builds the 60 x 40 playfield — a checkerboard floor, a dark backdrop
// plane under it, and four invisible boundary-wall colliders. Exposes the whole thing as one
// group so the main menu can spin the arena slowly in the background and a run can reset it.
//
// The 8 enemy spawn points live in tuning.js (SPAWN_POINTS) and are only referenced, not built
// here — they are pure coordinates, nothing to draw.

// The whole world (floor + backdrop + houses) hangs off this group so it can be rotated as one
// unit in the main menu. Colliders keep world-space coordinates, which stay valid as long as the
// group's rotation is zero — Run.resetWorld() puts it back before any wave starts.
export const map = new THREE.Group();

// Degrees per second the arena drifts in the main menu (GDD 1: "arena rotates slowly").
const MENU_ROTATION_SPEED = 0.12;

// A 2x2 texel checker texture: diagonally matching texels so one repeat makes a proper check.
// NearestFilter keeps squares crisp when magnified; the default mipmapping avoids shimmer at
// distance. (Identical technique to the previous map, retuned for the smaller arena.)
function makeCheckerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ARENA.checkerLight;
    ctx.fillRect(0, 0, 2, 2);
    ctx.fillStyle = ARENA.checkerDark;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(1, 1, 1, 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    // The hex colours are CSS/sRGB values; tag the texture so three converts them correctly.
    texture.colorSpace = THREE.SRGBColorSpace;
    // Each texture repeat covers 2x2 grid squares, i.e. 2 * tileSize world units.
    texture.repeat.set(ARENA.width / (2 * ARENA.tileSize), ARENA.depth / (2 * ARENA.tileSize));
    return texture;
}

// Builds the checkerboard floor as one textured plane. PlaneGeometry already lies in the XY
// plane facing +Z — exactly this scene's ground — so no rotation is needed. Unlit
// (MeshBasicMaterial) so the two greens stay exact regardless of the lighting.
function makeFloor() {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ARENA.width, ARENA.depth),
        new THREE.MeshBasicMaterial({ map: makeCheckerTexture() }),
    );
    floor.receiveShadow = true; // houses and characters drop soft shadows on it (GDD 5)
    return floor;
}

// A large dark plane under the floor: everything beyond the arena edge reads as a void instead
// of the page background. Sized far larger than the arena so no reachable viewpoint sees its
// edge, but kept inside the camera's far plane.
function makeBackdrop() {
    const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(ARENA.backdropSize, ARENA.backdropSize),
        new THREE.MeshBasicMaterial({ color: ARENA.backdropColor }),
    );
    backdrop.position.z = ARENA.backdropZ; // just under the floor, so the two never z-fight
    return backdrop;
}

// Four invisible axis-aligned box colliders just outside the floor edge, sealing the play area.
// No meshes: the dark backdrop is what hides the outside, not a visible fence.
function addBoundaryWalls() {
    const halfX = ARENA.width / 2;
    const halfY = ARENA.depth / 2;
    const thickness = ARENA.wallThickness;

    // [centre x, centre y, halfWidth, halfDepth]. The half-extents run past the corners so the
    // four walls overlap and leave no diagonal gap.
    const walls = [
        [0, halfY + thickness / 2, halfX + thickness, thickness / 2], // +Y
        [0, -halfY - thickness / 2, halfX + thickness, thickness / 2], // -Y
        [-halfX - thickness / 2, 0, thickness / 2, halfY + thickness], // -X
        [halfX + thickness / 2, 0, thickness / 2, halfY + thickness], // +X
    ];

    for (const [x, y, halfWidth, halfDepth] of walls) {
        // Walls never move, so a bare Object3D as the registry key is enough; it is never added
        // to the scene graph.
        const owner = new THREE.Object3D();
        registerBoxCollider(
            owner,
            new THREE.Vector3(x, y, 0),
            halfWidth,
            halfDepth,
        );
    }
}

// Builds the arena and adds it to the scene. Called once from main.js.
export function initArena(scene) {
    map.add(makeBackdrop());
    map.add(makeFloor());
    addBoundaryWalls();
    scene.add(map);
    return map;
}

// Slowly spins the arena for the main menu background. Rotating the group turns the floor and
// the houses together; nothing else is affected because no gameplay runs in that state.
export function spinArena(delta) {
    map.rotation.z += MENU_ROTATION_SPEED * delta;
}

// Puts the arena's rotation back for gameplay. Colliders store world-space coordinates, so any
// leftover menu rotation would desync what is seen from what is collidable.
export function resetArenaRotation() {
    map.rotation.z = 0;
}
