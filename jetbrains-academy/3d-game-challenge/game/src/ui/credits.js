import { el } from './dom.js';

// Credits link: the credits live in the repository README's "credits" section. The button is
// shared by the main menu, the pause menu and the game-over screen, so the URL is defined once
// here.
const CREDITS_URL =
    'https://github.com/mephisto-inc/mephisto-inc/tree/main/jogos/3d-game-challenge#credits';

// Builds the credits button: styled like the other menu buttons and opens the URL in a new tab.
// 'noopener,noreferrer' keeps the opened page from getting a window handle back into the game.
export function createCreditsButton() {
    const button = el('button', 'btn', '💚 CREDITS');
    button.addEventListener('click', () => {
        window.open(CREDITS_URL, '_blank', 'noopener,noreferrer');
    });
    return button;
}
