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
  cubeToWorld,
  worldToCube,
  type CubeCoord,
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

/** One sample along a wall line: where it sits (`t`, 0 at `start`, 1 at
 * `end`) and the two cells either side of the line there. */
export interface LineSample {
  readonly t: number;
  readonly cells: readonly [string, string];
}

/** The line sampled every half hex, each sample with its two side cells. */
export function sampleBesideLine(
  start: WorldPos,
  end: WorldPos,
  hexSize: number
): LineSample[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    const key = cellKeyAt(start, hexSize);
    return [{ t: 0, cells: [key, key] }];
  }
  const nx = -dz / length;
  const nz = dx / length;
  const offset = SIDE_OFFSET * hexSize;
  const samples = Math.max(1, Math.ceil(length / (STEP * hexSize)));
  const out: LineSample[] = [];
  for (let i = 0; i <= samples; i++) {
    // Inset the ends a little so a wall ending on a corner does not claim
    // the hex diagonally beyond its end.
    const t = Math.min(0.98, Math.max(0.02, i / samples));
    const px = start.x + dx * t;
    const pz = start.z + dz * t;
    out.push({
      t,
      cells: [
        cellKeyAt({ x: px + nx * offset, z: pz + nz * offset }, hexSize),
        cellKeyAt({ x: px - nx * offset, z: pz - nz * offset }, hexSize),
      ],
    });
  }
  return out;
}

/** The cells on both sides of a straight wall from `start` to `end`. */
export function cellsBesideLine(
  start: WorldPos,
  end: WorldPos,
  hexSize: number
): Set<string> {
  if (start.x === end.x && start.z === end.z)
    return cellsAroundPoint(start, hexSize);
  return new Set(
    sampleBesideLine(start, end, hexSize).flatMap((s) => [...s.cells])
  );
}

/** A stretch of a wall line, `from`→`to` as fractions of its length, and the
 * brightest state of the cells beside that stretch. */
export interface LineStretch<S> {
  readonly from: number;
  readonly to: number;
  readonly state: S;
}

/**
 * The wall line split where the state of the cells beside it changes: each
 * stretch takes the brightest state of ITS OWN bordering cells (`stateOf` is
 * asked about one sample's two side cells). A uniform line is one stretch
 * covering 0→1. A split falls midway between the two samples that differ.
 * Attribution only: `stateOf` is a lookup in what the server sent.
 */
export function stretchesBesideLine<S>(
  start: WorldPos,
  end: WorldPos,
  hexSize: number,
  stateOf: (cells: readonly string[]) => S
): LineStretch<S>[] {
  const samples = sampleBesideLine(start, end, hexSize);
  const stretches: { from: number; to: number; state: S }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const state = stateOf(samples[i]!.cells);
    const last = stretches.at(-1);
    if (last && last.state === state) continue;
    const from = i === 0 ? 0 : (samples[i - 1]!.t + samples[i]!.t) / 2;
    if (last) last.to = from;
    stretches.push({ from, to: 1, state });
  }
  return stretches;
}

/** Cut points within this fraction of the line's length are one cut, and a
 * span covers its ends within it. Abutting hexes share a corner, but their
 * projected span ends differ by rounding; without the tolerance that
 * difference reads as a zero-width uncovered gap. */
const SAME_T = 1e-6;

/**
 * A wall line split by the cells its blocker footprint overlaps (fog of war
 * R9: a wall is known where sight reached its footprint). The server lists
 * the cells; this never re-derives them from the line.
 *
 * A hex covers a SPAN of the wall, not a point: each cell's six corners are
 * projected onto the line and `[min t, max t]`, clamped to 0–1, is the span
 * it covers. The state at any `t` is `stateOf` the cells whose span covers
 * it, so the brightest of them wins; where no span covers it, `stateOf` is
 * asked about no cells (`borderState`'s answer: absent once the server sends
 * per-cell knowledge). The line splits at the sorted span boundaries where
 * that state changes; equal neighbours merge. A cell wholly past an end
 * covers nothing. No cells, no stretches. Attribution only: `stateOf` is a
 * lookup in what the server sent.
 */
export function stretchesAlongCells<S>(
  line: { readonly start: WorldPos; readonly end: WorldPos },
  cells: readonly CubeCoord[],
  hexSize: number,
  stateOf: (cells: readonly string[]) => S
): LineStretch<S>[] {
  if (cells.length === 0) return [];
  const { start, end } = line;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const keys = cells.map(coordToKey);
  if (lengthSq === 0) return [{ from: 0, to: 1, state: stateOf(keys) }];
  const tOf = (x: number, z: number) =>
    ((x - start.x) * dx + (z - start.z) * dz) / lengthSq;
  const clamp = (t: number) => Math.min(1, Math.max(0, t));
  const spans = cells.map((cell, index) => {
    const centre = cubeToWorld(cell, hexSize);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 6; i++) {
      // Pointy-top corners lie at 30°, 90°, … from the +x axis.
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      const t = tOf(
        centre.x + Math.cos(angle) * hexSize,
        centre.z + Math.sin(angle) * hexSize
      );
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    return { from: clamp(lo), to: clamp(hi), key: keys[index]! };
  });
  const bounds = [0, 1, ...spans.flatMap((sp) => [sp.from, sp.to])]
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1]! > SAME_T);
  const stretches: { from: number; to: number; state: S }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const from = bounds[i]!;
    const to = bounds[i + 1]!;
    const mid = (from + to) / 2;
    const state = stateOf(
      spans
        .filter((sp) => sp.from - SAME_T <= mid && mid <= sp.to + SAME_T)
        .map((sp) => sp.key)
    );
    const last = stretches.at(-1);
    if (last && last.state === state) last.to = to;
    else stretches.push({ from, to, state });
  }
  if (stretches.length > 0) stretches.at(-1)!.to = 1;
  return stretches;
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
