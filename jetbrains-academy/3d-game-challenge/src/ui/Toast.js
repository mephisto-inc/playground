import { attachTooltip, el, hideTooltip, mount } from "./dom.js";
import { onUnlock } from "../systems/Achievements.js";
import { MENU } from "../config/tuning.js";

let container = null;

export function initToast() {
  container = el("div", "toast-container");
  mount(container);
  onUnlock(showAchievementToast);
}

function showAchievementToast(achievement) {
  const toast = el("div", "toast");
  toast.appendChild(el("div", "toast-icon", achievement.icon));
  const text = el("div", "toast-text");
  text.appendChild(el("div", "toast-title", "ACHIEVEMENT UNLOCKED"));
  text.appendChild(el("div", "toast-name", achievement.name));
  toast.appendChild(text);
  container.appendChild(toast);

  attachTooltip(
    toast,
    `${achievement.icon} ${achievement.name}`,
    achievement.description || "Achievement unlocked.",
  );

  void toast.offsetWidth;
  toast.classList.add("visible");

  let dismissTimer = null;
  const scheduleDismiss = () => {
    dismissTimer = setTimeout(() => {
      dismissTimer = null;
      toast.classList.remove("visible");
      setTimeout(() => {
        hideTooltip();
        toast.remove();
      }, MENU.toastFade);
    }, MENU.toastLife);
  };
  toast.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  });
  toast.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && !dismissTimer) scheduleDismiss();
  });
  scheduleDismiss();
}
