// Pure maths for the power gauge: a finger circling the centre of a photo turns
// rotation into a 0..100 score. Half a turn covers the whole range.
export const DEGREES_FOR_FULL_SCALE = 180;
export const DEAD_ZONE_RADIUS = 24; // px: too close to the centre and the angle is noise

export function angleAt(x: number, y: number, cx: number, cy: number): number | null {
  const dx = x - cx, dy = y - cy;
  if (Math.hypot(dx, dy) < DEAD_ZONE_RADIUS) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Smallest signed difference between two angles, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Clockwise movement raises the score, anticlockwise lowers it. */
export function applyRotation(score: number, fromAngle: number, toAngle: number, factor = 1, min = 0): number {
  const next = score + (angleDelta(fromAngle, toAngle) / DEGREES_FOR_FULL_SCALE) * 100 * factor;
  return Math.min(100, Math.max(min, next));
}

/** Rounded-rectangle outline starting at top centre, clockwise, plus its length. */
export function framePath(w: number, h: number, r: number, inset: number) {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const rr = Math.max(0, Math.min(r - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const d = [
    `M ${w / 2} ${y0}`, `H ${x1 - rr}`, `A ${rr} ${rr} 0 0 1 ${x1} ${y0 + rr}`,
    `V ${y1 - rr}`, `A ${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}`,
    `H ${x0 + rr}`, `A ${rr} ${rr} 0 0 1 ${x0} ${y1 - rr}`,
    `V ${y0 + rr}`, `A ${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}`, `H ${w / 2}`,
  ].join(' ');
  const length = 2 * (x1 - x0 - 2 * rr) + 2 * (y1 - y0 - 2 * rr) + 2 * Math.PI * rr;
  return { d, length };
}

/** Point on the frame outline at a distance along it (same path and direction as framePath). */
export function framePoint(w: number, h: number, r: number, inset: number, dist: number) {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const rr = Math.max(0, Math.min(r - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const q = (Math.PI * rr) / 2;
  const arc = (cx: number, cy: number, fromDeg: number) => (d: number) => {
    const a = ((fromDeg + (d / (q || 1)) * 90) * Math.PI) / 180;
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  };
  const line = (ax: number, ay: number, bx: number, by: number) => (d: number) => {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    return { x: ax + ((bx - ax) * d) / len, y: ay + ((by - ay) * d) / len };
  };
  const segs: [number, (d: number) => { x: number; y: number }][] = [
    [x1 - rr - w / 2, line(w / 2, y0, x1 - rr, y0)],
    [q, arc(x1 - rr, y0 + rr, -90)],
    [y1 - y0 - 2 * rr, line(x1, y0 + rr, x1, y1 - rr)],
    [q, arc(x1 - rr, y1 - rr, 0)],
    [x1 - x0 - 2 * rr, line(x1 - rr, y1, x0 + rr, y1)],
    [q, arc(x0 + rr, y1 - rr, 90)],
    [y1 - y0 - 2 * rr, line(x0, y1 - rr, x0, y0 + rr)],
    [q, arc(x0 + rr, y0 + rr, 180)],
    [w / 2 - x0 - rr, line(x0 + rr, y0, w / 2, y0)],
  ];
  let d = Math.max(0, dist);
  for (const [len, at] of segs) { if (d <= len) return at(d); d -= len; }
  return { x: w / 2, y: y0 };
}

/**
 * Turning near the centre is finer than turning near the edge: the closer your finger
 * is to the middle, the slower the Dial moves, down to about a third of full speed.
 */
export function precisionFactor(x: number, y: number, cx: number, cy: number, halfSize: number) {
  return Math.min(1, Math.max(0.35, Math.hypot(x - cx, y - cy) / (halfSize || 1)));
}

/** A word for where the Dial sits, shown under the number while turning. */
export function dialWord(v: number) {
  if (v >= 100) return 'Full Dial';
  if (v >= 85) return 'Wow';
  if (v >= 65) return 'Great';
  if (v >= 45) return 'Good';
  if (v >= 25) return 'Maybe';
  return 'Not for me';
}

/** A circle starting at the top, clockwise: the round Dial used for whole profiles. */
export function ringPath(size: number, inset: number) {
  const c = size / 2, r = c - inset;
  return { d: `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`, length: 2 * Math.PI * r };
}
export function ringPoint(size: number, inset: number, dist: number) {
  const c = size / 2, r = c - inset, a = -Math.PI / 2 + dist / r;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}
