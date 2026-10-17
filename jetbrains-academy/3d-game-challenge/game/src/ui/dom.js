// UI DOM helper: one overlay root (with an inner scaling layer) for every screen and a tiny
// element factory, so all UI modules build their DOM the same way. The root covers the game rect
// with pointer-events: none, so the game canvas keeps receiving steering input everywhere except
// on the elements that explicitly re-enable pointer events (buttons, cards, sliders — see
// index.css).

const root = document.createElement('div');
root.id = 'ui-root';
document.body.appendChild(root);

// Inner scaling layer: every screen mounts here (see mount() below) instead of directly on the
// root. core/Viewport.js publishes --ui-scale — the fit factor of the game rect against the UI
// reference screen. The layer is sized 100%/scale and scaled back down around its center, so its
// layout space is never smaller than the reference and every fixed-px panel fits; on phones the
// whole UI (HUD included) shrinks uniformly instead of overflowing. The vignette and the version
// tag stay outside it on the root, so they always cover the full game rect unscaled.
const layer = document.createElement('div');
layer.className = 'ui-layer';
root.appendChild(layer);

// Creates an element with an optional class and inner HTML (emoji/text content is set through it).
export function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

// Appends elements to the scaling layer in order; returns the last one for chaining convenience.
export function mount(...nodes) {
    for (const node of nodes) layer.appendChild(node);
    return nodes[nodes.length - 1];
}

// Builds a <ul> with one <li> per item — the compact bullet-list form used for the class
// descriptions (character-select card and compendium class rows both render them this way).
export function list(className, items) {
    const node = el('ul', className);
    for (const item of items) node.appendChild(el('li', '', item));
    return node;
}

// --- Tooltips -----------------------------------------------------------------

// One shared tooltip bubble for the whole UI. It is appended to <body> (not the UI root) and
// pointer-events: none (see index.css), so it can never swallow a tap meant for the badge under
// it; because it lives outside the scaling layer it is scaled separately through the same
// --ui-scale variable (see index.css .badge-tooltip). It works for both input styles:
//   * mouse: shows on hover, hides on leave;
//   * touch: first tap opens it, tapping the badge again or tapping anywhere else closes it.

const tooltip = el('div', 'badge-tooltip');
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

// The badge the tooltip currently describes, or null when hidden.
let tooltipOwner = null;

// Wires hover/tap tooltip behavior onto `target`. `titleHtml` may contain markup (the card icon
// emoji), `bodyText` is plain text (the card description + any stack count).
export function attachTooltip(target, titleHtml, bodyText) {
    target.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') showTooltip(target, titleHtml, bodyText);
    });
    target.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse' && tooltipOwner === target) hideTooltip();
    });
    // Tapping the badge toggles it (for touch screens, where there is no hover).
    target.addEventListener('click', () => {
        if (tooltipOwner === target) hideTooltip();
        else showTooltip(target, titleHtml, bodyText);
    });
}

// A tap anywhere outside the badge (and outside the tooltip) closes the tooltip. Registered once
// in the capture phase so it works no matter what other handlers exist.
document.addEventListener('pointerdown', (event) => {
    if (!tooltipOwner) return;
    if (tooltipOwner.contains(event.target) || tooltip.contains(event.target)) return;
    hideTooltip();
}, true);

// Shows the tooltip bubble for `target`, filling it and placing it near the badge.
function showTooltip(target, titleHtml, bodyText) {
    tooltip.replaceChildren(
        el('div', 'badge-tooltip-title', titleHtml),
        el('div', 'badge-tooltip-body', bodyText),
    );
    tooltipOwner = target;
    tooltip.style.display = 'block';
    // Measure only after display:block, otherwise the rect is 0x0.
    const rect = target.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    // Center over the badge, clamped to the viewport.
    const left = Math.max(8, Math.min(
        rect.left + rect.width / 2 - tipRect.width / 2,
        window.innerWidth - tipRect.width - 8,
    ));
    // Prefer above the badge; flip below when the top bar leaves no room.
    let top = rect.top - tipRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

// Hides the tooltip. Exported so screens can call it when they rebuild or tear down the badges
// the tooltip might be attached to (otherwise it would float over removed elements).
export function hideTooltip() {
    tooltipOwner = null;
    tooltip.style.display = 'none';
}

// --- Formatting ----------------------------------------------------------------

// Formats seconds as a clock string: mm:ss, or h:mm:ss once past an hour. Used by the wave-5
// survival chronometer (HUD) and the game-over recap. Invalid or negative input reads as 0:00.
export function formatClock(seconds) {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
}
