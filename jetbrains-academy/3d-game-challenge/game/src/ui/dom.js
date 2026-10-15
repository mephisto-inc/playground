// UI DOM helper: one overlay root for every screen and a tiny element factory, so all UI modules
// build their DOM the same way. The root covers the viewport with pointer-events: none, so the
// game canvas keeps receiving steering input everywhere except on the elements that explicitly
// re-enable pointer events (buttons, cards, sliders — see index.css).

const root = document.createElement('div');
root.id = 'ui-root';
document.body.appendChild(root);

// Creates an element with an optional class and inner HTML (emoji/text content is set through it).
export function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

// Appends elements to the UI root in order; returns the last one for chaining convenience.
export function mount(...nodes) {
    for (const node of nodes) root.appendChild(node);
    return nodes[nodes.length - 1];
}

// --- Tooltips (round 5) -------------------------------------------------------

// One shared tooltip bubble for the whole UI. It is appended to <body> (not the UI root) and
// pointer-events: none (see index.css), so it can never swallow a tap meant for the badge under
// it. It works for both input styles:
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

export { root };
