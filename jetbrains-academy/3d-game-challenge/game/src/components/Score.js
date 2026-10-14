// Score component: owns the running score, the on-screen readout, and the survival reward.
// The attack system reports each defeat through addKillScore(); main.js calls initScore() once
// and updateScore(delta) once per animation frame. Everything else (rounding, DOM writes) is
// kept inside this module so nothing else has to know how the score is displayed.

// --- Tuning -----------------------------------------------------------------
// Survival reward, in points per second (spec: SCORE_PER_SECOND = 0.1, i.e. 1 point per 10s).
// Surviving is deliberately cheaper than fighting: see SCORE_PER_KILL below.
// TODO (difficulty, per task.md): tweak alongside SCORE_PER_KILL to change the scoring rhythm;
//       if the game grows a settings screen, surface both rather than hard-coding them here.
export const SCORE_PER_SECOND = 0.1;

// Kill reward, in points per enemy defeated (spec: SCORE_PER_KILL = 10). Heftier than survival
// because landing a hit is the risky part — fleeing should not out-score fighting.
export const SCORE_PER_KILL = 10;

// --- State ------------------------------------------------------------------
let score = 0;      // running total, kept as a float (survival ticks in fractional points)
let lastShown = -1; // last integer we rendered; -1 forces the first paint even at 0
let scoreElement = null; // the on-screen <div class="score">

// --- Clock note -------------------------------------------------------------
// The spec suggests a THREE.Clock. We do NOT use one here: main.js already owns a clock and
// passes each frame's `delta` to every system, so updateScore(delta) reuses that same value and
// stays consistent with the rest of the components (which all take `delta`).
// TODO: if scoring ever needs its own independent time source (e.g. a bonus countdown that
//       should keep running while the game clock is paused), give Score its own THREE.Clock
//       and switch updateScore() to read clock.getDelta() itself.

// Builds the readout element and drops it into the page. Called once from main.js.
export function initScore() {
  // The spec asks for a <div class="score">. We create it here rather than in index.html so
  // this component is self-contained; the visual placement lives in style.css under `.score`.
  scoreElement = document.createElement('div');
  scoreElement.className = 'score';
  document.body.appendChild(scoreElement);

  renderScore(); // paint the initial "Score: 0"
}

// Called every frame: bank the survival reward, then refresh the readout if the whole number
// changed. `delta` is the seconds since the previous frame (from main.js's clock).
export function updateScore(delta) {
  score += delta * SCORE_PER_SECOND;
  renderScore();
}

// Called by the attack system once per enemy defeated. Public because the kill happens over in
// Attack.js; this keeps the score state private while still letting attackers credit a kill.
// TODO (decoupling): if enemies ever die from something other than the attack, consider a small
//       event/observer so Score subscribes to defeats instead of Attack calling in directly.
export function addKillScore() {
  score += SCORE_PER_KILL;
  renderScore();
}

// Writes the floored score to the DOM, but only when the displayed integer actually changes.
// At 0.1/s the survival total moves every frame but the visible number only ticks every 10s, so
// this guard turns ~60 DOM writes a second into one every 10 seconds (or per kill).
function renderScore() {
  const shown = Math.floor(score); // spec: always round down
  if (shown === lastShown) return;
  lastShown = shown;
  if (scoreElement) scoreElement.textContent = `Score: ${shown}`;
}

// Zeroes the run and repaints. Called by GameState.resetGame() so a new attempt starts from 0.
// `lastShown = -1` is important: it is the sentinel that forces the next renderScore() to paint
// even if the new value happens to equal the old one, so the readout can never stay stale.
export function resetScore() {
  score = 0;
  lastShown = -1;
  renderScore();
}

// The current score as a whole number. Used by GameState to show the final result on the Game
// Over overlay. Floored so the overlay matches the on-screen readout exactly.
export function getScore() {
  return Math.floor(score);
}

// TODO (game over / reset done): resetScore()/getScore() above now back the Game Over flow. The
//       survival tick is stopped from the outside — main.js skips updateScore() entirely while
//       the game is frozen — so the dead player does not keep accruing idle time. If the pause
//       is ever modelled by a `delta`/`paused` flag inside Score instead, guard the tick here.
