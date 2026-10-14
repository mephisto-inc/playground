import * as THREE from 'three';
import player, { isPlayerGrounded } from './Player.js';
import { getEnemies, removeEnemy } from './Enemy.js';
import { addKillScore } from './Score.js';

// Attack component: the player's close-range "blast". Space fires it, a cooldown limits how
// often, a yellow ring flashes on the ground as feedback, and every enemy whose body reaches
// that ring is removed from play. main.js calls initAttack(scene) once and updateAttack(delta)
// once per animation frame (after updateEnemies, so the sweep sees this frame's positions).
//
// Like the other systems, all of the per-frame work happens in the update phase: the key
// listener only *requests* a strike, and updateAttack decides whether it actually happens.

// --- Tuning -----------------------------------------------------------------
// Cooldown between strikes, in seconds (spec: a constant, default 1). Raise it to make the
// power a rare "get out of jail" button, lower it for a fast melee rhythm.
// TODO (difficulty, per task.md): 1s is the required default; expose it in some options object
//       if the game ever grows a difficulty/settings screen.
export const ATTACK_COOLDOWN = 1;

// Radius of the attack ring, in world units — the drawn circle's radius AND the base of the
// hit test. Raised from the original 25 to 50, which quadruples the swept area (area scales with
// the square of the radius) so the blast reliably clears a whole ring of bees rather than
// clipping a single one.
//
// IMPORTANT design constraint: COLLISION_DISTANCE keeps a chasing bee about
// playerRadius + enemyRadius + COLLISION_DISTANCE ≈ 10 + 12.8 + 2 ≈ 24.8 units away from the
// centre of the player, so an enemy can never get closer than that. The hit test below adds the
// enemy's own radius (the "edge" test): at 50 the ring reaches a bee whose centre is up to
// 50 + ~12.8 ≈ 62.8 units away — comfortably past the ~24.8 closest approach, so it connects
// even before a bee has closed all the way in.
// TODO: tune this. Lower it toward ~24 for a knife-edge strike, raise it for an even wider
//       shockwave that clears bees before they arrive. Changing it changes the ring visual too.
export const ATTACK_RADIUS = 50;

// How long the ring stays up before it has faded away, in seconds. short = a snappy pop.
// The spec allows "disappear or fade out"; this fades. Set to 0 for an instant flash.
// TODO (polish): a scale-up "shockwave" tween, or a colour pulse, would add impact here.
export const ATTACK_FLASH_DURATION = 0.25;

// The ring sits just above the ground plane so it never z-fights the grid at z = 0 (spec: 0.25).
const ATTACK_Z_OFFSET = 0.25;

const ATTACK_COLOR = 0xffff00; // yellow (spec)
const ATTACK_CIRCLE_SEGMENTS = 32; // smoothness of the ring; 32 is plenty at this radius

// --- State ------------------------------------------------------------------
let cooldownRemaining = 0; // seconds until another strike is allowed (0 = ready)
let flashRemaining = 0;    // seconds left in the ring's fade
let attackRequested = false; // a Space press that passed the keydown guards, awaiting the update
let attackCircle = null;    // the reusable ring mesh

// Builds the reusable ring and parks it in the scene. One mesh is created and recoloured/
// repositioned per strike rather than allocating a new circle each time.
export function initAttack(scene) {
  // CircleGeometry is authored in the XY plane with its normal along +Z, which is exactly the
  // Z-up ground plane this project uses — so unlike the GridHelper (built in XZ, rotated to
  // lie flat) this needs NO rotation.
  const geometry = new THREE.CircleGeometry(ATTACK_RADIUS, ATTACK_CIRCLE_SEGMENTS);

  // MeshBasicMaterial is unlit, so the ring reads as a flat, solid colour — the "UI" look the
  // spec wants. transparent + opacity lets it fade; depthWrite is off so the fading disc does
  // not fight other transparent draws.
  const material = new THREE.MeshBasicMaterial({
    color: ATTACK_COLOR,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  attackCircle = new THREE.Mesh(geometry, material);
  attackCircle.visible = false;
  scene.add(attackCircle);
}

// Requests a strike. The guards here reject presses we can never honour (mid-air, still cooling
// down); everything else is deferred to updateAttack so the actual hit detection runs in the
// normal update phase.
//
// NOTE: this used to be a raw `window` keydown listener for Space. GameState now owns that
// listener (Space doubles as the "reset" key on the Game Over screen), so a single listener can
// decide between attacking and restarting. That is deliberate: with two independent Space
// listeners, a press while dead could both queue a stale attack AND trigger the reset, and the
// stale request would fire on the first live frame. Here, only a live game ever calls this.
export function requestAttack() {
  if (!isPlayerGrounded()) return; // spec: no attacking while airborne (the press is dropped)
  if (cooldownRemaining > 0) return; // still recovering; ignore rather than queue a buffered hit
  attackRequested = true;
}

// Called every frame. Ticks the cooldown and the ring fade, then resolves a pending request.
export function updateAttack(delta) {
  // Count the cooldown down to zero, which is what eventually re-enables the Space listener.
  if (cooldownRemaining > 0) cooldownRemaining = Math.max(0, cooldownRemaining - delta);

  // Fade the ring. Colour is constant, so simply ramp opacity from 1 to 0 across the duration.
  if (flashRemaining > 0) {
    flashRemaining = Math.max(0, flashRemaining - delta);
    if (attackCircle) {
      attackCircle.material.opacity =
        ATTACK_FLASH_DURATION > 0 ? flashRemaining / ATTACK_FLASH_DURATION : 0;
      if (flashRemaining === 0) attackCircle.visible = false; // fully faded: stop drawing it
    }
  }

  if (!attackRequested) return;
  attackRequested = false;

  // Re-check the guards at fire time. The keydown already filtered these, but the frame runs a
  // moment later, so the player could have left the ground (or a prior strike could have eked
  // out the cooldown) in between. Cheaper to be sure than to trust the earlier check.
  if (!isPlayerGrounded() || cooldownRemaining > 0) return;

  performAttack();
}

// Runs one strike: restarts the cooldown, flashes the ring, and removes every enemy in range.
function performAttack() {
  cooldownRemaining = ATTACK_COOLDOWN;

  // Show the ring on the ground at the player's current spot. x/y only — the player group's z
  // is the hop height, and the ring must stay on the ground even if the player is moving.
  // NOTE: the ring does not follow the player during the fade; it marks where the blast landed.
  if (attackCircle) {
    attackCircle.position.set(player.position.x, player.position.y, ATTACK_Z_OFFSET);
    attackCircle.visible = true;
    attackCircle.material.opacity = 1;
    flashRemaining = ATTACK_FLASH_DURATION;
  }

  const x = player.position.x;
  const y = player.position.y;

  // Snapshot the list before touching it: removeEnemy() splices the live array, so looping over
  // it directly would skip entries as they shift down.
  const targets = getEnemies().slice();
  for (const enemy of targets) {
    const distance = Math.hypot(enemy.position.x - x, enemy.position.y - y);

    // "Edge" hit test: the enemy's body counts, not just its centre, so the small ring can
    // still reach a bee that has closed to the collision limit (see ATTACK_RADIUS). Falls back
    // to a centre test if the collider is somehow missing.
    const enemyRadius = enemy.userData.collider ? enemy.userData.collider.radius : 0;
    if (distance <= ATTACK_RADIUS + enemyRadius) {
      // Credit the kill only when the enemy was really removed (removeEnemy returns false for
      // one already gone), so a double-count can never inflate the score.
      if (removeEnemy(enemy)) addKillScore();
    }
  }

  // TODO (feedback): a one-shot sound, screen shake, or a particle burst would sell the hit —
  //       out of scope for this task.
}

// Wipes the attack's transient state for a new run. Called by GameState.resetGame() and also at
// the moment of Game Over (so a ring caught mid-fade does not stay frozen on screen, since the
// loop stops calling updateAttack while the game is frozen). Clearing the cooldown too means a
// fresh run always starts with the power ready.
export function resetAttack() {
  attackRequested = false;
  cooldownRemaining = 0;
  flashRemaining = 0;
  if (attackCircle) {
    attackCircle.visible = false;
    attackCircle.material.opacity = 0;
  }
}
