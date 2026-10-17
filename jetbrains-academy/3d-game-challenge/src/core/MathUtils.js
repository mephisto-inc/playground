export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq > 0
      ? clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1)
      : 0;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
