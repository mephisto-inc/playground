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

export { root };
