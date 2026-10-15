/**
 * cellBorders — which cells a fixed wall or door stands beside, so it can take
 * the brightest state of those cells (fog of war, design Law "The client draws
 * three states and nothing else").
 *
 * This is ATTRIBUTION, not visibility. A wall the atlas already presented is a
 * line in scene space; the cells beside it are the cells whose hexes lie half a
 * hex either side of that line. Nothing here asks whether anything can see
 * anything: the per-cell state still comes only from `cellKnowledge`, i.e. from
 * what the server sent.
 */

import {
  coordToKey,
  worldToCube,
  type WorldPos,
} from '@/components/hex-grid/hexMath';

/** How far either side of a wall line the bordering cells are sampled, as a
 * fraction of the hex size. Half a hex lands inside the hex on each side of a
 * hex edge and never in the hex beyond it. */
const SIDE_OFFSET = 0.5;
/** The radius sampled around a point, as a fraction of the hex size: under the
 * half-edge length (0.5), so it never reaches an edge's end vertex. */
const POINT_OFFSET = 0.4;
/** Sample spacing along a line, as a fraction of the hex size. */
const STEP = 0.5;

const cellKeyAt = (point: WorldPos, hexSize: number): string =>
  coordToKey(worldToCube(point, hexSize));

/** The cells on both sides of a straight wall from `start` to `end`. */
export function cellsBesideLine(
  start: WorldPos,
  end: WorldPos,
  hexSize: number
): Set<string> {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const keys = new Set<string>();
  if (length === 0) {
    for (const key of cellsAroundPoint(start, hexSize)) keys.add(key);
    return keys;
  }
  const nx = -dz / length;
  const nz = dx / length;
  const offset = SIDE_OFFSET * hexSize;
  const samples = Math.max(1, Math.ceil(length / (STEP * hexSize)));
  for (let i = 0; i <= samples; i++) {
    // Inset the ends a little so a wall ending on a corner does not claim
    // the hex diagonally beyond its end.
    const t = Math.min(0.98, Math.max(0.02, i / samples));
    const px = start.x + dx * t;
    const pz = start.z + dz * t;
    keys.add(cellKeyAt({ x: px + nx * offset, z: pz + nz * offset }, hexSize));
    keys.add(cellKeyAt({ x: px - nx * offset, z: pz - nz * offset }, hexSize));
  }
  return keys;
}

/** The cells around a door or fixed thing standing at `point` when no wall
 * line is known for it: its own hex and the hexes `POINT_OFFSET` away in each
 * of six directions. Orientation-free on purpose, so a yaw convention can never
 * put a door's bordering cells on the wrong side. From an edge midpoint the
 * offset reaches the two hexes the edge separates and stops short of the edge's
 * end vertices, so the hexes meeting only at those corners are not claimed. */
export function cellsAroundPoint(
  point: WorldPos,
  hexSize: number
): Set<string> {
  const offset = POINT_OFFSET * hexSize;
  const keys = new Set<string>([cellKeyAt(point, hexSize)]);
  for (let i = 0; i < 6; i++) {
    // Pointy-top hex neighbours lie at 0°, 60°, … from the +x axis.
    const angle = (Math.PI / 3) * i;
    keys.add(
      cellKeyAt(
        {
          x: point.x + Math.cos(angle) * offset,
          z: point.z + Math.sin(angle) * offset,
        },
        hexSize
      )
    );
  }
  return keys;
}
