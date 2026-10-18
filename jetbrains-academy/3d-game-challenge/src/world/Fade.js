import {CAMERA} from "../config/tuning.js";

const azimuth = (CAMERA.azimuthDeg * Math.PI) / 180;

const FADE_FORWARD_X = -Math.cos(azimuth);
const FADE_FORWARD_Y = -Math.sin(azimuth);
const FADE_RIGHT_X = FADE_FORWARD_Y;
const FADE_RIGHT_Y = -FADE_FORWARD_X;

export function updateFade(
  entries,
  delta,
  playerPosition,
  {radius, lateral, targetOpacity, duration},
) {
  if (entries.length === 0) return;

  const radiusSq = radius * radius;
  const step = duration > 0 ? delta / duration : 1;

  for (const entry of entries) {
    const dx = entry.object.position.x - playerPosition.x;
    const dy = entry.object.position.y - playerPosition.y;

    let target = 1;
    if (dx * dx + dy * dy <= radiusSq) {
      const along = dx * FADE_FORWARD_X + dy * FADE_FORWARD_Y;
      if (along < 0) {
        const lateralOffset = Math.abs(dx * FADE_RIGHT_X + dy * FADE_RIGHT_Y);
        if (lateralOffset <= lateral) target = targetOpacity;
      }
    }

    if (entry.opacity === target) continue;
    entry.opacity =
      target < entry.opacity
        ? Math.max(target, entry.opacity - step)
        : Math.min(target, entry.opacity + step);

    const transparent = entry.opacity < 1;
    for (const material of entry.materials) {
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = entry.opacity;
    }
  }
}
