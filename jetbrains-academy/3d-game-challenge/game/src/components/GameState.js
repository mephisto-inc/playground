import player, { resetPlayer } from './Player.js';
import { getEnemies, resetEnemies } from './Enemy.js';
import { resetScore, getScore } from './Score.js';
import { requestAttack, resetAttack } from './Attack.js';
import { onAttackTap } from './Input.js';

// GameState component: the single owner of "are we playing or is it over?" (spec: Start, play,
// and Game Over). It watches for a bee touching the hero, flips to a frozen Game Over state with
// an overlay, and restarts the whole run when that overlay is clicked or tapped.
//
// It is deliberately the *only* module that imports the others' reset functions — the direction
// is one-way (GameState -> Player/Enemy/Score/Attack), so there is no import cycle. The contact
// itself is detected by the enemy system via an overlap test each frame (see Enemy.js) and this
// module polls that flag (see Enemy.js / Collision.js).
//
// Priority note (spec: "Game Over handling has higher priority than collision handling"): the
// main loop calls updateGameState() right after the enemies have moved and skips the rest of the
// frame's updates the moment the state flips, so nothing can override the defeat.

const STATE_PLAYING = 'playing';
const STATE_GAME_OVER = 'gameOver';

// --- State ------------------------------------------------------------------
let state = STATE_PLAYING;
let overlayElement = null;
let overlayScoreElement = null;

// Builds the Game Over overlay (hidden) and takes over the attack tap. Called once from main.js.
// While a run is live the routed tap forwards to the attack; while the overlay is up it is
// dropped, because the overlay's own click handler (below) is what restarts the run.
//
// Ordering note — why the overlay listens for `click` and not `pointerup`: a tap's pointerup
// reaches Input's window-level listener first (Input is the sole pointer owner), and only then
// does the click bubble from this overlay. At that moment the state is still GAME_OVER, so the
// routed tap no-ops and the restart follows cleanly afterwards. Swapping the overlay to pointerup
// would invert the order (the overlay is closer to the event target than `window`), the state
// would already be PLAYING, and the restart tap would fire a free attack on the fresh run.
export function initGameState() {
  overlayElement = document.createElement('div');
  overlayElement.className = 'game-over is-hidden';

  const title = document.createElement('div');
  title.className = 'game-over__title';
  title.textContent = 'Game Over';

  overlayScoreElement = document.createElement('div');
  overlayScoreElement.className = 'game-over__score';

  const hint = document.createElement('div');
  hint.className = 'game-over__hint';
  hint.textContent = 'Click or tap anywhere to restart';

  overlayElement.append(title, overlayScoreElement, hint);
  document.body.appendChild(overlayElement);

  // The overlay itself is the restart control (pointer-events stays on in style.css), so the
  // whole screen becomes a forgiving click/tap target.
  overlayElement.addEventListener('click', () => {
    if (state === STATE_GAME_OVER) resetGame();
  });

  // Input.js judges the stationary tap inside the hero zone; the routing decision stays here
  // because only this module knows the state. Taps while dead still reach this handler (window
  // listeners see events bubbling through the overlay) and are dropped — the click handler above
  // restarts instead.
  onAttackTap(() => {
    if (state === STATE_PLAYING) requestAttack();
  });

  // TODO (verify): an impatient double-click restart lands its second click after resetGame(),
  //       i.e. state is PLAYING and the pointer sits at the screen centre — inside the attack
  //       zone — so the fresh run opens with one cosmetic attack ring. Harmless (the spawn bee
  //       starts well outside the blast radius) but confirm in the browser; if it annoys,
  //       suppress attack taps for a moment after a reset.
}

// True while the run has ended and the player is waiting to restart. main.js uses this to freeze
// the world (skip every other update) while still rendering the frozen scene and the overlay.
export function isGameOver() {
  return state === STATE_GAME_OVER;
}

// Called every frame by main.js, after the enemies have moved. While playing, scan for any bee
// that reached the player this frame and end the game on the first one found. This runs every
// frame regardless of whether the player is moving, which is what lets a chasing bee trigger the
// defeat on its own (spec).
export function updateGameState() {
  if (state === STATE_GAME_OVER) return; // already ended; nothing left to watch

  for (const enemy of getEnemies()) {
    if (enemy.userData.touchingPlayer) {
      triggerGameOver();
      return; // one contact is enough; no need to inspect the rest
    }
  }
}

function triggerGameOver() {
  state = STATE_GAME_OVER;

  // The camera follows only the hero's ground position, so a hit taken mid-hop no longer needs
  // settling. Just hide him (spec: remove or make invisible); resetPlayer() restores him.
  player.visible = false;

  // Dismiss any attack ring caught mid-fade, since the loop stops updating the attack now and
  // the fading mesh would otherwise sit frozen on the ground.
  resetAttack();

  showOverlay();
}

// Restores every subsystem to a fresh starting state and resumes play. Triggered by the Game Over
// overlay's click handler (see initGameState); the guard there keeps it dead-state only.
function resetGame() {
  // Player first: it returns to the origin, which is where the enemies respawn around.
  resetPlayer();
  resetEnemies(); // clear the board and spawn the opening bee again
  resetScore();   // back to 0 and repaint the readout
  resetAttack();  // power recharged, no pending strike

  hideOverlay();
  state = STATE_PLAYING; // last: only now do the loop's updates run again
}

function showOverlay() {
  overlayScoreElement.textContent = `Score: ${getScore()}`; // final result, matching the HUD
  overlayElement.classList.remove('is-hidden');
}

function hideOverlay() {
  overlayElement.classList.add('is-hidden');
}
