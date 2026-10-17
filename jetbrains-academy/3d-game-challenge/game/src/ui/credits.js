import { el } from './dom.js';

// Credits link: the credits live in the "creditos" section of the 3d-game-challenge README in
// the jogos repository. The button is used by the main menu (paired with the guide button in
// the info row), so the URL is defined once here.
const CREDITS_URL =
    'https://github.com/mephisto-inc/jogos/tree/main/3d-game-challenge#creditos';

// Builds the credits button: styled like the other menu buttons and opens the URL in a new tab.
// 'noopener,noreferrer' keeps the opened page from getting a window handle back into the game.
export function createCreditsButton() {
    const button = el('button', 'btn', '💚 CREDITS');
    button.addEventListener('click', () => {
        window.open(CREDITS_URL, '_blank', 'noopener,noreferrer');
    });
    return button;
}
