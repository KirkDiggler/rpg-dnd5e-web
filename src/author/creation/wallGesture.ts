/**
 * wallGesture — what is left of the wall tool's pointer maths once the
 * wall stopped being a drag.
 *
 * # What was here, and why it went
 *
 * The wall tool used to be a press–drag–release. Because a wall on disk
 * was a list of hex-to-hex crossings, the drag had to turn a straight
 * line the author aimed into the chain of crossings nearest it: the
 * corner lattice (`hexCorner.ts`), the TAUT PATH walking it, angle
 * magnetism onto four seam families within ~6°, vertex magnetism onto
 * existing chain ends, and a reshape that re-derived every incident
 * chain when a shared corner moved. All of it is deleted
 * (rpg-project#360 slice 2).
 *
 * A wall is a line between two of the seven positions now, and the
 * author PICKS both. There is no angle to snap, because the twelve
 * directions are all there are; no chain to derive, because the file
 * holds the line; and no magnetism, because picking a position another
 * wall already ends at IS the corner (design §2.7, F5) rather than a
 * radius that has to be tuned. Kirk's complaint that the old magnetism
 * was aimed at the wrong point — *"I cannot get that upper right corner
 * to snap in"* — cannot recur: an offered end is a dot the author
 * clicks.
 *
 * What survives is hit-testing: which drawn wall is under the pointer.
 */
import type { Point } from '../../concepts/session-tomb/atlas';

/** Hit radius around a drawn wall, as a fraction of the board's hex
 * size — "select the thing you see", the one tuning constant the wall
 * tool has left. */
export const WALL_HIT_RADIUS = 0.25;

/**
 * The index into `walls` of the wall whose drawn line `point` is within
 * `WALL_HIT_RADIUS` of (nearest wins), or null. Walls are the board's
 * own projected lines, so this hits exactly what the author sees.
 */
export function nearestWallIndex(
  walls: readonly { a: Point; b: Point }[],
  point: Point,
  size: number
): number | null {
  const radius = WALL_HIT_RADIUS * size;
  let best: number | null = null;
  let bestDist = Infinity;
  walls.forEach((wall, i) => {
    const d = distanceToSegment(point, wall.a, wall.b);
    if (d <= radius && d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Distance from a point to a closed segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
  return Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y);
}
