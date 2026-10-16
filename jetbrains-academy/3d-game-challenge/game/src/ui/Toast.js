import { attachTooltip, el, hideTooltip, mount } from './dom.js';
import { onUnlock } from '../systems/Achievements.js';

// Achievement toasts: when an achievement unlocks, a small banner fades in at the top-center of
// the screen (just below the HUD's top row), stacks under any banner already showing, and
// auto-dismisses. The container ignores pointer events, but the banner itself accepts them so
// hovering it (or tapping on touch) shows the achievement's description in the shared tooltip;
// the auto-dismiss countdown pauses while the mouse hovers the banner.

const TOAST_LIFE_MS = 3500; // how long a banner stays fully visible before fading out
const FADE_MS = 300;        // must match the CSS transition duration on .toast

let container = null;

export function initToast() {
    container = el('div', 'toast-container');
    mount(container);
    onUnlock(showAchievementToast);
}

// Builds one banner for an unlocked achievement and schedules its removal.
function showAchievementToast(achievement) {
    const toast = el('div', 'toast');
    toast.appendChild(el('div', 'toast-icon', achievement.icon));
    const text = el('div', 'toast-text');
    text.appendChild(el('div', 'toast-title', 'ACHIEVEMENT UNLOCKED'));
    text.appendChild(el('div', 'toast-name', achievement.name));
    toast.appendChild(text);
    container.appendChild(toast);

    // Hover (or tap) shows what the achievement actually required, using the shared tooltip.
    attachTooltip(
        toast,
        `${achievement.icon} ${achievement.name}`,
        achievement.description || 'Achievement unlocked.',
    );

    // Force a style flush so the .visible class below always animates from the hidden state,
    // even when several toasts are appended in the same frame.
    void toast.offsetWidth;
    toast.classList.add('visible');

    // Auto-dismiss, pausable: while the mouse hovers the banner the countdown stops (reading the
    // tooltip must not race the fade), and leaving restarts it from the top.
    let dismissTimer = null;
    const scheduleDismiss = () => {
        dismissTimer = setTimeout(() => {
            dismissTimer = null;
            toast.classList.remove('visible');
            setTimeout(() => {
                hideTooltip(); // never leave the banner's tooltip floating after it is gone
                toast.remove();
            }, FADE_MS);
        }, TOAST_LIFE_MS);
    };
    toast.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse' && dismissTimer) {
            clearTimeout(dismissTimer);
            dismissTimer = null;
        }
    });
    toast.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse' && !dismissTimer) scheduleDismiss();
    });
    scheduleDismiss();
}
