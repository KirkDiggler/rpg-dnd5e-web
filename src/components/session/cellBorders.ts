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

/** Two footprint cells whose centres project within this fraction of the
 * line's length of each other are one sample: the pair a line runs between
 * lands at the same `t` up to rounding. */
const SAME_T = 1e-6;

/**
 * A wall line split by the cells its blocker footprint overlaps (fog of war
 * R9: a wall is known where sight reached its footprint). The server lists
 * the cells; this never re-derives them from the line.
 *
 * Each cell is a sample at its centre's projection onto the line (`t`,
 * clamped 0–1). Samples are sorted by `t`; cells at the same `t` (a pair the
 * line runs between) are one sample and `stateOf` is asked about both, so it
 * takes the brighter. Stretches split midway between samples whose state
 * differs, the rule `stretchesBesideLine` uses. No cells, no stretches.
 * Attribution only: `stateOf` is a lookup in what the server sent.
 */
export function stretchesAlongCells<S>(
  line: { readonly start: WorldPos; readonly end: WorldPos },
  cells: readonly CubeCoord[],
  hexSize: number,
  stateOf: (cells: readonly string[]) => S
): LineStretch<S>[] {
  const { start, end } = line;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const projected = cells
    .map((cell) => {
      const centre = cubeToWorld(cell, hexSize);
      const t =
        lengthSq === 0
          ? 0
          : ((centre.x - start.x) * dx + (centre.z - start.z) * dz) / lengthSq;
      return { t: Math.min(1, Math.max(0, t)), key: coordToKey(cell) };
    })
    .sort((a, b) => a.t - b.t);
  const samples: { t: number; keys: string[] }[] = [];
  for (const { t, key } of projected) {
    const last = samples.at(-1);
    if (last && t - last.t <= SAME_T) last.keys.push(key);
    else samples.push({ t, keys: [key] });
  }
  const stretches: { from: number; to: number; state: S }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const state = stateOf(samples[i]!.keys);
    const last = stretches.at(-1);
    if (last && last.state === state) continue;
    const from = i === 0 ? 0 : (samples[i - 1]!.t + samples[i]!.t) / 2;
    if (last) last.to = from;
    stretches.push({ from, to: 1, state });
  }
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
