import { el, mount } from './dom.js';
import { STATE, onStateChange, setState } from '../core/StateMachine.js';
import { PLAYER } from '../config/tuning.js';
import { getGameOverSummary } from '../systems/Run.js';
import { getPowerup } from '../config/powerups.js';
import { ACHIEVEMENTS } from '../systems/Achievements.js';
import { openAchievements } from './AchievementsPanel.js';

// Game-over screen (GDD 1 state 6 + GDD 7): appears after the defeat animation finishes, showing
// the final score, the record status, a recap of the collected power-up cards and the
// achievements unlocked during the run. Play Again returns to the character-select modal
// (choosing the class starts the next run); Main Menu returns to the title.

let overlay = null;
let scoreNode = null;
let bestNode = null;
let recordNode = null;
let cardsNode = null;
let achievementsNode = null;
let revealTimer = null;

export function initGameOverScreen() {
    overlay = el('div', 'overlay');
    const panel = el('div', 'panel gameover-panel');

    panel.appendChild(el('div', 'gameover-title', 'GAME OVER'));
    scoreNode = el('div', 'final-score');
    bestNode = el('div', 'best-score');
    recordNode = el('div', 'record-badge');
    panel.appendChild(scoreNode);
    panel.appendChild(bestNode);
    panel.appendChild(recordNode);

    panel.appendChild(el('div', 'summary-label', 'Power-ups collected'));
    cardsNode = el('div', 'recap-cards');
    panel.appendChild(cardsNode);

    panel.appendChild(el('div', 'summary-label', 'Unlocked this run'));
    achievementsNode = el('div', 'recap-achievements');
    panel.appendChild(achievementsNode);

    const playAgainButton = el('button', 'btn', '▶ PLAY AGAIN');
    playAgainButton.addEventListener('click', () => setState(STATE.CHARACTER_SELECTION));
    panel.appendChild(playAgainButton);

    const menuButton = el('button', 'btn', '⌂ MAIN MENU');
    menuButton.addEventListener('click', () => setState(STATE.MAIN_MENU));
    panel.appendChild(menuButton);

    // The achievements panel is available at any time (GDD 7), including from this screen.
    const achievementsButton = el('button', 'btn', '🏆 ACHIEVEMENTS');
    achievementsButton.addEventListener('click', () => openAchievements());
    panel.appendChild(achievementsButton);

    overlay.appendChild(panel);
    mount(overlay);

    onStateChange((state) => {
        if (state === STATE.GAME_OVER) {
            render();
            // Let the defeat animation (GDD state 6) play before revealing the panel.
            overlay.classList.remove('revealed');
            clearTimeout(revealTimer);
            revealTimer = setTimeout(() => {
                overlay.classList.add('visible', 'revealed');
            }, PLAYER.deathAnimDuration * 1000);
        } else {
            clearTimeout(revealTimer);
            overlay.classList.remove('visible', 'revealed');
        }
    });
}

// Fills every field from the run's summary (see Run.getGameOverSummary()).
function render() {
    const summary = getGameOverSummary();

    scoreNode.textContent = `⭐ ${summary.score.toLocaleString()}`;
    bestNode.textContent = `Best: ${summary.best.toLocaleString()}`;
    recordNode.textContent = summary.isRecord ? '🏆 NEW RECORD!' : '';

    // Cards recap: one badge per collected card, in pickup order.
    cardsNode.innerHTML = '';
    if (summary.cards.length === 0) {
        cardsNode.appendChild(el('span', 'summary-label', '— none —'));
    } else {
        for (const id of summary.cards) {
            const powerup = getPowerup(id);
            cardsNode.appendChild(el('span', 'build-badge', powerup ? powerup.icon : '❔'));
        }
    }

    // Achievements unlocked during this run (by id, looked up for icon + name).
    achievementsNode.innerHTML = '';
    if (summary.unlocked.length === 0) {
        achievementsNode.appendChild(el('div', 'summary-label', '— none —'));
    } else {
        for (const id of summary.unlocked) {
            const definition = ACHIEVEMENTS.find((entry) => entry.id === id);
            if (!definition) continue;
            achievementsNode.appendChild(
                el('div', '', `${definition.icon} ${definition.name}`),
            );
        }
    }
}
