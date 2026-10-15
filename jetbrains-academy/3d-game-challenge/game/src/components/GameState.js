import player, { resetPlayer } from './Player.js';
import { getEnemies, resetEnemies } from './Enemy.js';
import { resetScore, getScore } from './Score.js';
import { requestAttack, resetAttack } from './Attack.js';
import { onDoubleActivation } from './Input.js';

// GameState component: the single owner of "are we playing or is it over?" (spec: Start, play,
// and Game Over). It watches for a bee touching the hero, flips to a frozen Game Over state with
// an overlay, and restarts the whole run on a double click / double tap.
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

// Builds the Game Over overlay (hidden) and takes over the double activation. Called once from
// main.js. This is where the activation is centralised: on a live game it forwards to the attack,
// on the Game Over screen it restarts. A single handler avoids the two-listener race where a
// press while dead could both queue a stale attack AND trigger the reset (see the note in
// Attack.js).
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
  hint.textContent = 'Double-click / double-tap to restart';

  overlayElement.append(title, overlayScoreElement, hint);
  document.body.appendChild(overlayElement);

  // Input.js counts the two quick taps/clicks; the routing decision stays here because only this
  // module knows the state.
  onDoubleActivation(() => {
    if (state === STATE_GAME_OVER) resetGame();
    else requestAttack();
  });
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

// Restores every subsystem to a fresh starting state and resumes play. Triggered by a double
// click / double tap while in the Game Over state (see onDoubleActivation in initGameState).
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
