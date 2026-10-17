// Viewport component: owns the letterboxed game rect. The game always renders on a landscape
// rectangle whose aspect ratio is the window's, clamped into [4:3 .. 16:9] — windows inside that
// range (including common 16:10 desktops) fill edge to edge, wider or taller ones get black bars
// on the sides or top/bottom. The rect is published as CSS variables (--game-left/top/width/
// height) so the canvas and the whole UI root share it, and as plain numbers for the renderer
// and the camera. It also publishes --ui-scale: the uniform fit factor of the whole UI against
// the reference screen below — ui/dom.js applies it through the .ui-layer transform, so every
// fixed-px panel keeps fitting the game rect on small screens (phones). It is a leaf module —
// it imports nothing — so Renderer, Camera and Input can all read it without dependency cycles.

// The aspect-ratio range the view is clamped to: narrower than 4:3 would show a tall column,
// wider than 16:9 a flat strip. Inside the range the window's own ratio is used.
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 16 / 9;

// UI reference screen: the design size every fixed-px panel is laid out for. 700px is the width
// of the widest screen (the character select); 560px covers the tallest one (the game-over recap
// with its achievement list capped in ui/GameOverScreen.js). The UI scale never exceeds 1 —
// desktops keep the design size exactly — and shrinks only when the game rect is smaller.
const UI_REF_WIDTH = 700;
const UI_REF_HEIGHT = 560;

let aspect = 1; // the clamped aspect actually in use
let rect = { left: 0, top: 0, width: 0, height: 0 }; // the centered game rect, in CSS px

// Recomputes the game rect from the current window size and publishes it. Called once at module
// load and again from Renderer's resize listener (the single owner of resize handling).
export function applyViewport() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, windowWidth / windowHeight));

    // Largest rect of `aspect` that fits the window, centered: it fills one axis and is
    // pillarboxed (side bars) or letterboxed (top/bottom bars) on the other.
    let width = windowWidth;
    let height = width / aspect;
    if (height > windowHeight) {
        height = windowHeight;
        width = height * aspect;
    }
    rect = {
        left: (windowWidth - width) / 2,
        top: (windowHeight - height) / 2,
        width,
        height,
    };

    const style = document.documentElement.style;
    style.setProperty('--game-left', `${rect.left}px`);
    style.setProperty('--game-top', `${rect.top}px`);
    style.setProperty('--game-width', `${rect.width}px`);
    style.setProperty('--game-height', `${rect.height}px`);

    // Uniform UI fit factor: 1 on every game rect at least as large as the reference, smaller on
    // small bands (phones). Clamped away from zero so the .ui-layer's 100%/scale sizing stays
    // valid even while the window is collapsed to nothing.
    const uiScale = Math.max(
        0.05,
        Math.min(1, rect.width / UI_REF_WIDTH, rect.height / UI_REF_HEIGHT),
    );
    style.setProperty('--ui-scale', `${uiScale}`);
    return rect;
}

// The clamped aspect ratio the camera frustum and the renderer use.
export function getAspect() {
    return aspect;
}

// Publish immediately: module load happens before Renderer and Camera read the values.
applyViewport();
