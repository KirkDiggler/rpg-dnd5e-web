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
export const GRID_MARGIN = 4;

/** The paintable grid: every floor cell's offset bounding box, grown by
 * a margin of void so the author can always paint outward, never
 * smaller than a starter area around the origin. Enumerated in OFFSET
 * so it reads as a rectangle under either orientation, then handed back
 * in axial like everything else. */
export function paintableGrid(floor: Axial[], o: Orientation): Axial[] {
  return cellsInBounds(neededBounds(floor, o), o);
}

/** The grid's offset bounds: the paintable rectangle in `[col,row]`. */
export interface GridBounds {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

/** The bounds the floor needs: its offset bounding box grown by the
 * margin, never smaller than the starter area. */
export function neededBounds(floor: Axial[], o: Orientation): GridBounds {
  const b: GridBounds = {
    minC: 0,
    maxC: MIN_GRID_COLS - 1,
    minR: 0,
    maxR: MIN_GRID_ROWS - 1,
  };
  for (const cell of floor) {
    const [c, r] = toOffset(o, cell);
    b.minC = Math.min(b.minC, c - GRID_MARGIN);
    b.maxC = Math.max(b.maxC, c + GRID_MARGIN);
    b.minR = Math.min(b.minR, r - GRID_MARGIN);
    b.maxR = Math.max(b.maxR, r + GRID_MARGIN);
  }
  return b;
}

/** Bounds only ever GROW while the author works (Kirk's walk, 2026-08-23:
 * "a little of a wild west when painting regions near the edges"): the
 * grid extends to fit, it never re-fits, so erasing at an edge does not
 * pull the canvas in under the pointer. `null` previous = first layout. */
export function growBounds(
  prev: GridBounds | null,
  needed: GridBounds
): GridBounds {
  if (!prev) return needed;
  const next = {
    minC: Math.min(prev.minC, needed.minC),
    maxC: Math.max(prev.maxC, needed.maxC),
    minR: Math.min(prev.minR, needed.minR),
    maxR: Math.max(prev.maxR, needed.maxR),
  };
  return next.minC === prev.minC &&
    next.maxC === prev.maxC &&
    next.minR === prev.minR &&
    next.maxR === prev.maxR
    ? prev
    : next;
}

export function cellsInBounds(b: GridBounds, o: Orientation): Axial[] {
  const cells: Axial[] = [];
  for (let r = b.minR; r <= b.maxR; r += 1) {
    for (let c = b.minC; c <= b.maxC; c += 1) cells.push(fromOffset(o, [c, r]));
  }
  return cells;
}

/** The SVG user-space rectangle that frames `cells` with padding. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function viewRectFor(
  cells: Axial[],
  size: number,
  o: Orientation
): ViewRect {
  if (cells.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
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
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + 2 * pad,
    height: maxY - minY + 2 * pad,
  };
}

export function viewBoxFor(
  cells: Axial[],
  size: number,
  o: Orientation
): string {
  const r = viewRectFor(cells, size, o);
  return `${r.x} ${r.y} ${r.width} ${r.height}`;
}
