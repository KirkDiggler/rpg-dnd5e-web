/**
 * canvasGeometry — the 2D board's picture of an axial cell under the
 * dungeon's orientation. Thin over `concepts/session-tomb/atlas.ts`'s
 * `hexCenter`/`hexCorners`/`edgeBetween` (the SVG geometry the session
 * concept page already draws both layouts with) so the builder has no
 * hex formula of its own: for pointy, `hexCenter` IS `cubeToWorld` (the
 * identity `atlasToScene3D.test.ts` pins over the whole tomb), so the
 * board and the 3D preview place a cell identically.
 */
import {
  edgeBetween,
  hexCenter,
  hexCorners,
  type HexLayout,
  type Point,
} from '../../concepts/session-tomb/atlas';
import {
  axialNeighbors,
  fromOffset,
  toOffset,
  type Axial,
  type Edge,
  type Orientation,
} from '../hexOffset';

const asPosition = (a: Axial) => ({ x: a.q, y: a.r }) as never;

export function cellCenter(a: Axial, size: number, o: Orientation): Point {
  return hexCenter(asPosition(a), size, o as HexLayout);
}

export function cellCorners(a: Axial, size: number, o: Orientation): Point[] {
  return hexCorners(cellCenter(a, size, o), size, o as HexLayout);
}

export function cornersPath(a: Axial, size: number, o: Orientation): string {
  return cellCorners(a, size, o)
    .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(' ');
}

export function edgeSegment(
  e: Edge,
  size: number,
  o: Orientation
): { a: Point; b: Point } | null {
  return edgeBetween(asPosition(e[0]), asPosition(e[1]), size, o as HexLayout);
}

/** Of `cell`'s six edges, the one whose midpoint is nearest `point`. */
export function nearestEdge(
  cell: Axial,
  point: Point,
  size: number,
  o: Orientation
): Edge {
  const c = cellCenter(cell, size, o);
  let best: Edge = [cell, axialNeighbors(cell)[0]];
  let bestDist = Infinity;
  for (const n of axialNeighbors(cell)) {
    const nc = cellCenter(n, size, o);
    const mid = { x: (c.x + nc.x) / 2, y: (c.y + nc.y) / 2 };
    const d = (mid.x - point.x) ** 2 + (mid.y - point.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = [cell, n];
    }
  }
  return best;
}

export const MIN_GRID_COLS = 14;
export const MIN_GRID_ROWS = 9;
export const GRID_MARGIN = 2;

/** The paintable grid: every floor cell's offset bounding box, grown by
 * a margin of void so the author can always paint outward, never
 * smaller than a starter area around the origin. Enumerated in OFFSET
 * so it reads as a rectangle under either orientation, then handed back
 * in axial like everything else. */
export function paintableGrid(floor: Axial[], o: Orientation): Axial[] {
  let minC = 0;
  let maxC = MIN_GRID_COLS - 1;
  let minR = 0;
  let maxR = MIN_GRID_ROWS - 1;
  for (const cell of floor) {
    const [c, r] = toOffset(o, cell);
    minC = Math.min(minC, c - GRID_MARGIN);
    maxC = Math.max(maxC, c + GRID_MARGIN);
    minR = Math.min(minR, r - GRID_MARGIN);
    maxR = Math.max(maxR, r + GRID_MARGIN);
  }
  const cells: Axial[] = [];
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) cells.push(fromOffset(o, [c, r]));
  }
  return cells;
}

export function viewBoxFor(
  cells: Axial[],
  size: number,
  o: Orientation
): string {
  if (cells.length === 0) return '0 0 1 1';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const c = cellCenter(cell, size, o);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  const pad = size * 1.5;
  return `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
}
