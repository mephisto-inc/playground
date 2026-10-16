import { el, mount } from './dom.js';
import { onUnlock } from '../systems/Achievements.js';

// Achievement toasts: when an achievement unlocks, a small banner fades in at the top-center of
// the screen (just below the HUD's top row), stacks under any banner already showing, and
// auto-dismisses. The container ignores pointer events (see index.css), so gameplay input passes
// straight through.

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

    // Force a style flush so the .visible class below always animates from the hidden state,
    // even when several toasts are appended in the same frame.
    void toast.offsetWidth;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), FADE_MS);
    }, TOAST_LIFE_MS);
}
