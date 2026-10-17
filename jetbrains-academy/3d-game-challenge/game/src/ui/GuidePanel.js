import {el, list, mount} from './dom.js';

// Guide panel: the how-to-play window, reachable from the main menu ONLY (the 🎮 GUIDE button
// sits next to the credits one). It is a passive overlay that never changes the game state —
// a short bullet list of the controls, the run's loop and the meta goals — with the same
// CLOSE/Esc/backdrop behavior as the achievements and compendium panels.

// The guide text, in play order: controls first, then the run's loop, then the meta goals.
const GUIDE_LINES = [
    '🖱️ Use the mouse to move — touch the screen on mobile. Tode hops toward your pointer.',
    '⚡ Double click / double tap to use your class ability (Pusher or Dasher).',
    '🃏 Pick a power-up after every wave — stack cards to build your run.',
    '🐸 Survive as long as you can — the waves only get harder, and Wave 5 never ends.',
    '🏆 Get all achievements and fill the compendium.',
    '🐛 Try to break the game or crash it.',
];

let overlay = null;

export function initGuidePanel() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel guide-panel');

    panel.appendChild(el('div', 'guide-title', '🎮 GUIDE'));
    const listNode = el('div', 'guide-list');
    listNode.appendChild(list('guide-bullets', GUIDE_LINES));
    panel.appendChild(listNode);

    const footer = el('div', 'guide-footer');
    const closeButton = el('button', 'btn', '✖ CLOSE');
    closeButton.addEventListener('click', closeGuide);
    footer.appendChild(closeButton);
    panel.appendChild(footer);

    // Clicking the dim backdrop (not the panel) also closes.
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeGuide();
    });

    // Esc closes the panel first if it is open (capture phase, so the Esc key never also
    // reaches whatever screen the panel is covering).
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('visible')) {
            event.stopPropagation();
            event.preventDefault();
            closeGuide();
        }
    }, true);

    overlay.appendChild(panel);
    mount(overlay);
}

// Shows the panel (the content is static, so there is nothing to rebuild).
export function openGuide() {
    overlay.classList.add('visible');
}

// Closes the panel.
function closeGuide() {
    overlay.classList.remove('visible');
}
