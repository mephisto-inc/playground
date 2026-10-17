const root = document.createElement("div");
root.id = "ui-root";
document.body.appendChild(root);

const layer = document.createElement("div");
layer.className = "ui-layer";
root.appendChild(layer);

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function mount(...nodes) {
  for (const node of nodes) layer.appendChild(node);
  return nodes[nodes.length - 1];
}

export function list(className, items) {
  const node = el("ul", className);
  for (const item of items) node.appendChild(el("li", "", item));
  return node;
}

const tooltip = el("div", "badge-tooltip");
tooltip.style.display = "none";
document.body.appendChild(tooltip);

let tooltipOwner = null;

export function attachTooltip(target, titleHtml, bodyText) {
  target.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") showTooltip(target, titleHtml, bodyText);
  });
  target.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && tooltipOwner === target) hideTooltip();
  });

  target.addEventListener("click", () => {
    if (tooltipOwner === target) hideTooltip();
    else showTooltip(target, titleHtml, bodyText);
  });
}

document.addEventListener(
  "pointerdown",
  (event) => {
    if (!tooltipOwner) return;
    if (tooltipOwner.contains(event.target) || tooltip.contains(event.target))
      return;
    hideTooltip();
  },
  true,
);

function showTooltip(target, titleHtml, bodyText) {
  tooltip.replaceChildren(
    el("div", "badge-tooltip-title", titleHtml),
    el("div", "badge-tooltip-body", bodyText),
  );
  tooltipOwner = target;
  tooltip.style.display = "block";

  const rect = target.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();

  const left = Math.max(
    8,
    Math.min(
      rect.left + rect.width / 2 - tipRect.width / 2,
      window.innerWidth - tipRect.width - 8,
    ),
  );

  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideTooltip() {
  tooltipOwner = null;
  tooltip.style.display = "none";
}

export function formatClock(seconds) {
  const total =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
}
