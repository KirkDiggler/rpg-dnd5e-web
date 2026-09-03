/**
 * hexGeometry — the seven positions, the twelve directions, and what a
 * wall drawn between two of them costs (rpg-project#360 slice 2; design
 * §1.6, §1.7, §3.3, §3.5, §3.7, §4.2).
 *
 * A wall is a straight line between two POSITIONS, and the file holds
 * nothing else. A position is the midpoint of one of a hex's six sides
 * or its centre — seven per hex, written `{cell, offset}` in
 * bounding-box fractions (x east, y south). Everything else about a
 * wall — the cells it passes through, the crossings it blocks, the cells
 * it seals — is derived, here for the picker and by the compiler for
 * the record.
 *
 * # One integer lattice, two orientations
 *
 * Every position lands on one integer lattice, which is what makes the
 * set closed and the comparisons exact. Writing a hex's circumradius as
 * 1 and taking `u` along the row axis and `v` across it:
 *
 *     U = 4·(a + b/2 + oa)      V = (v axis) 2·b + (8/3)·ob
 *
 * where for pointy-top `a,b = q,r` and `oa,ob = x,y`, and for flat-top
 * the two axes swap (a flat-top grid is the pointy-top grid turned 30°,
 * so it is the SAME lattice read with q and r exchanged). Every one of
 * the seven offsets is a dyadic rational, so `4·oa ∈ {0,±1,±2}` and
 * `(8/3)·ob ∈ {0,±1}` are integers and no float ever decides whether
 * two authors named the same point:
 *
 * | U, V                          | what it is        |
 * |-------------------------------|-------------------|
 * | both odd                      | a side midpoint   |
 * | both even, `U−V ≡ 0 (mod 4)`  | a cell centre     |
 * | both even, `U−V ≡ 2 (mod 4)`  | a side midpoint   |
 * | otherwise                     | not a position    |
 *
 * A side midpoint is named from EITHER of the two cells that share the
 * side and is the same lattice point both times — which is why a corner
 * is "two ends with the same position" (F5) with no corner concept
 * anywhere, and why `latticeKey` and not the `{cell, offset}` spelling
 * is what compares two ends.
 *
 * # Thin and thick are what a line COSTS, not what it is
 *
 * The twelve directions are the twelve primitive lattice steps 30°
 * apart. In each direction the lines carrying positions alternate
 * between ones that pass through cell centres and ones that do not.
 * That is the whole of the distinction design §4.3 labels **thick** and
 * **thin**: a thick line halves every cell whose centre it runs
 * through, and half a hex is below the compiler's standability
 * threshold, so those cells are sealed. A thin line shaves at most 5/24
 * off a cell and seals nothing on its own.
 *
 * So `sealedBy` is not a mirror of the compiler's area rule (design C11,
 * a named empty shelf) — it is the closed-form fact §4.3 states, and it
 * is exact: **a single wall seals exactly the cells whose centres lie on
 * its segment**. What a wall seals in COMBINATION with another (a
 * hexagonal room's 7/12 corner) is the compiler's answer alone and
 * reaches the builder as `sealed` off the wire.
 */

import {
  axialNeighbors,
  type Axial,
  type Edge,
  type Orientation,
} from './hexOffset';

/** A within-cell displacement in BOUNDING-BOX FRACTIONS: x in widths,
 * east positive; y in heights, south positive (design §1.11 — the one
 * offset unit, shared with a prop's `offset`). */
export type Offset = [x: number, y: number];

/** One of the seven positions, named from a cell it belongs to. The
 * same side midpoint has two spellings (one per cell sharing the side)
 * and they are the same point — compare with `latticeKey`, never by
 * field. */
export interface PositionRef {
  cell: Axial;
  offset: Offset;
}

/** A point in the plane, x east and y south — SVG user space at the
 * board's size, and world space (with y read as z) at the game's. */
export interface PlanePoint {
  x: number;
  y: number;
}

/** The seven positions of any cell, per orientation (design §3.3).
 * Centre first, then the six side midpoints. Every value is dyadic, so
 * the set compares exactly as floats and a 60° rotation maps it onto
 * itself. */
export const POSITIONS: Record<Orientation, readonly Offset[]> = {
  pointy: [
    [0, 0],
    [0.5, 0],
    [-0.5, 0],
    [0.25, -0.375],
    [-0.25, -0.375],
    [0.25, 0.375],
    [-0.25, 0.375],
  ],
  flat: [
    [0, 0],
    [0, 0.5],
    [0, -0.5],
    [0.375, 0.25],
    [0.375, -0.25],
    [-0.375, 0.25],
    [-0.375, -0.25],
  ],
};

/** Whether `offset` is one of the seven for this orientation (F8's
 * check, the shape the builder can represent). Exact equality, not a
 * tolerance: every legal value is dyadic. */
export function isPositionOffset(o: Orientation, offset: Offset): boolean {
  return POSITIONS[o].some(([x, y]) => x === offset[0] && y === offset[1]);
}

/** A position's address on the integer lattice — see the module doc. */
export interface Lattice {
  u: number;
  v: number;
}

/** What a lattice point is, or null when it is no position at all. */
export type PositionKind = 'side' | 'centre';

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The (a, b, oa, ob) reading of a cell+offset: pointy-top takes
 * (q, r, x, y); flat-top is the same lattice with the axes exchanged. */
function axes(
  o: Orientation,
  cell: Axial,
  offset: Offset
): { a: number; b: number; oa: number; ob: number } {
  return o === 'pointy'
    ? { a: cell.q, b: cell.r, oa: offset[0], ob: offset[1] }
    : { a: cell.r, b: cell.q, oa: offset[1], ob: offset[0] };
}

/**
 * A position's lattice address. `(ob * 8) / 3` and not `ob * (8/3)`:
 * 8/3 is not representable, and the product with 0.375 comes back
 * 0.9999999999999999 — an integer lattice decided by float noise is
 * exactly the defect this lattice exists to rule out. Multiplying by 8
 * first is exact (0.375 is dyadic) and the division by 3 is then exact
 * too.
 */
export function latticeOf(o: Orientation, p: PositionRef): Lattice {
  const { a, b, oa, ob } = axes(o, p.cell, p.offset);
  return { u: 4 * a + 2 * b + 4 * oa, v: 2 * b + (ob * 8) / 3 };
}

/** The lattice point as a string — the identity of a position, so the
 * two spellings of one side midpoint are one key (F5's corner). */
export const latticeKey = (l: Lattice): string => `${l.u},${l.v}`;

export const positionKey = (o: Orientation, p: PositionRef): string =>
  latticeKey(latticeOf(o, p));

export const samePosition = (
  o: Orientation,
  a: PositionRef,
  b: PositionRef
): boolean => positionKey(o, a) === positionKey(o, b);

/** What sits at a lattice point, by the module doc's table. */
export function latticeKind(l: Lattice): PositionKind | null {
  if (!Number.isInteger(l.u) || !Number.isInteger(l.v)) return null;
  const uOdd = mod(l.u, 2) === 1;
  const vOdd = mod(l.v, 2) === 1;
  if (uOdd && vOdd) return 'side';
  if (uOdd || vOdd) return null;
  return mod(l.u - l.v, 4) === 0 ? 'centre' : 'side';
}

/** A cell+offset spelling from (a, b, oa, ob), undoing `axes`. */
function refOf(
  o: Orientation,
  a: number,
  b: number,
  oa: number,
  ob: number
): PositionRef {
  return o === 'pointy'
    ? { cell: { q: a, r: b }, offset: [oa, ob] }
    : { cell: { q: b, r: a }, offset: [ob, oa] };
}

/**
 * Every cell that can name this lattice point: one for a centre, two
 * for a side midpoint (the pair the side separates). Order is stable —
 * the first is the canonical spelling `positionAt` writes.
 */
export function positionSpellings(
  o: Orientation,
  l: Lattice
): readonly PositionRef[] {
  const kind = latticeKind(l);
  if (kind === null) return [];
  if (kind === 'centre') {
    return [refOf(o, (l.u - l.v) / 4, l.v / 2, 0, 0)];
  }
  if (mod(l.v, 2) === 1) {
    // A slanted side: the two cells sit one row apart.
    const spell = (sign: 1 | -1): PositionRef => {
      const b = (l.v - sign) / 2;
      const rest = l.u - 2 * b;
      const oa = mod(rest, 4) === 1 ? 0.25 : -0.25;
      return refOf(o, (rest - 4 * oa) / 4, b, oa, sign * 0.375);
    };
    return [spell(1), spell(-1)];
  }
  // A side square to the row: the two cells sit side by side.
  const b = l.v / 2;
  return [
    refOf(o, (l.u - l.v - 2) / 4, b, 0.5, 0),
    refOf(o, (l.u - l.v + 2) / 4, b, -0.5, 0),
  ];
}

/** The canonical `{cell, offset}` for a lattice point, or null when the
 * point is no position. One spelling per point, so emitted files are
 * deterministic and a corner writes byte-identical ends. */
export function positionAt(o: Orientation, l: Lattice): PositionRef | null {
  return positionSpellings(o, l)[0] ?? null;
}

/** The cells a position belongs to: one for a centre, the two the side
 * separates for a midpoint. */
export const positionCells = (o: Orientation, l: Lattice): Axial[] =>
  positionSpellings(o, l).map((p) => p.cell);

/**
 * The crossing a door on this position opens (F11): the hex-to-hex step
 * across the side it is the midpoint of. A centre is the midpoint of no
 * side, so it opens nothing and answers null.
 */
export function positionCrossing(o: Orientation, l: Lattice): Edge | null {
  const cells = positionCells(o, l);
  return cells.length === 2 ? [cells[0], cells[1]] : null;
}

/** The seven positions of one cell, as the picker offers them. */
export const cellPositions = (o: Orientation, cell: Axial): PositionRef[] =>
  POSITIONS[o].map((offset) => ({ cell, offset }));

// ---------------------------------------------------------------------------
// The plane
// ---------------------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

/**
 * A lattice point in the plane at hex circumradius `size`. The `u` axis
 * runs along the rows and the `v` axis across them — for pointy-top
 * that is (x, y); for flat-top the grid is turned, so it is (y, x).
 *
 * These are the SAME standard axial formulas `hexMath.cubeToWorld` and
 * `atlas.hexCenter` place cells with (x = size·√3·(q + r/2),
 * y = size·3/2·r for pointy-top), reached through the lattice — pinned
 * against both by a pixel-formula test rather than trusted from this
 * comment (the symmetric-bug lesson, rpg-toolkit#1150).
 */
export function latticePoint(
  o: Orientation,
  l: Lattice,
  size: number
): PlanePoint {
  const along = (size * SQRT3 * l.u) / 4;
  const across = size * 0.75 * l.v;
  return o === 'pointy' ? { x: along, y: across } : { x: across, y: along };
}

/**
 * A lattice point as FRACTIONAL AXIAL — the frame the wire's
 * `AtlasSegment` carries (design §5.2: "the client's axial-to-world
 * formula already accepts fractions; no unit and no second basis
 * crosses the wire").
 *
 * Inverting `latticePoint` against the standard axial placement gives
 * `q = (u − v)/4, r = v/2` for pointy-top, and the two exchanged for
 * flat-top — the same axis swap the lattice itself is built on.
 */
export function latticeAxial(
  o: Orientation,
  l: Lattice
): { q: number; r: number } {
  const along = (l.u - l.v) / 4;
  const across = l.v / 2;
  return o === 'pointy' ? { q: along, r: across } : { q: across, r: along };
}

/** A cell's bounding box at circumradius `size` — THE offset unit
 * (design §1.11): a wall position, a door position and a prop offset are
 * all fractions of these two numbers. A pointy-top hex measures `√3·size`
 * flat to flat and `2·size` point to point; flat-top is the two
 * exchanged. */
export function cellBoundingBox(
  o: Orientation,
  size: number
): { width: number; height: number } {
  return o === 'pointy'
    ? { width: SQRT3 * size, height: 2 * size }
    : { width: 2 * size, height: SQRT3 * size };
}

export const positionPoint = (
  o: Orientation,
  p: PositionRef,
  size: number
): PlanePoint => latticePoint(o, latticeOf(o, p), size);

/** A cell's centre in the plane. */
export const centrePoint = (
  o: Orientation,
  cell: Axial,
  size: number
): PlanePoint => positionPoint(o, { cell, offset: [0, 0] }, size);

/** A cell's six corners, counter-clockwise in a y-down plane. */
export function cellCorners(
  o: Orientation,
  cell: Axial,
  size: number
): PlanePoint[] {
  const c = centrePoint(o, cell, size);
  const first = o === 'pointy' ? -90 : 0;
  return Array.from({ length: 6 }, (_, i) => {
    const rad = ((first + 60 * i) * Math.PI) / 180;
    return { x: c.x + size * Math.cos(rad), y: c.y + size * Math.sin(rad) };
  });
}

/** The cell containing a point — the standard axial rounding, written
 * once for both orientations. */
export function cellAtPoint(
  o: Orientation,
  p: PlanePoint,
  size: number
): Axial {
  const qf =
    o === 'pointy'
      ? ((SQRT3 / 3) * p.x - p.y / 3) / size
      : ((2 / 3) * p.x) / size;
  const rf =
    o === 'pointy'
      ? ((2 / 3) * p.y) / size
      : (-p.x / 3 + (SQRT3 / 3) * p.y) / size;
  return axialRound(qf, rf);
}

function axialRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

// ---------------------------------------------------------------------------
// The twelve directions
// ---------------------------------------------------------------------------

/** One of the twelve steps, as a primitive lattice vector. */
export interface Direction {
  du: number;
  dv: number;
}

/**
 * The twelve directions 30° apart (design §1.7): six along rows of
 * neighbours and six along hex sides. In lattice terms they are the
 * twelve primitive vectors whose plane angle is a multiple of 30°, and
 * they are listed here in pointy-top angle order starting due east.
 */
export const DIRECTIONS: readonly Direction[] = [
  { du: 1, dv: 0 },
  { du: 3, dv: 1 },
  { du: 1, dv: 1 },
  { du: 0, dv: 1 },
  { du: -1, dv: 1 },
  { du: -3, dv: 1 },
  { du: -1, dv: 0 },
  { du: -3, dv: -1 },
  { du: -1, dv: -1 },
  { du: 0, dv: -1 },
  { du: 1, dv: -1 },
  { du: 3, dv: -1 },
];

/** A direction's angle in the plane, in degrees, y-down (so 90° points
 * south). Always a multiple of 30 by construction. */
export function directionDegrees(o: Orientation, d: Direction): number {
  const along = (SQRT3 * d.du) / 4;
  const across = 0.75 * d.dv;
  const [dx, dy] = o === 'pointy' ? [along, across] : [across, along];
  const raw = mod((Math.atan2(dy, dx) * 180) / Math.PI, 360);
  // Snapped to the multiple of 30 it already is. `atan2` of an exact
  // ratio still lands on 209.99999999999997, and a label a streamer
  // reads — and a test that names the twelve — should not carry that.
  // This is a SPELLING fix on a value the lattice makes exact, not a
  // tolerance: a direction is one of the twelve or it is not a
  // direction, and `DIRECTIONS` is the closed list.
  return mod(Math.round(raw / 30) * 30, 360);
}

/**
 * Whether the line through `from` in direction `d` passes through any
 * cell centre — the whole of the thin/thick distinction (design §4.3,
 * F16a). Testing four steps is exhaustive: the classification depends
 * only on (u, v) mod 4, and four steps of an integer direction return
 * every residue the line visits.
 */
export function lineIsThick(from: Lattice, d: Direction): boolean {
  for (let k = 0; k < 4; k += 1) {
    if (
      latticeKind({ u: from.u + k * d.du, v: from.v + k * d.dv }) === 'centre'
    )
      return true;
  }
  return false;
}

/**
 * The positions along the ray from `from` in direction `d`, nearest
 * first, up to `count` of them. `from` itself is never included: these
 * are the ends a wall starting there may take.
 */
export function positionsAlongRay(
  from: Lattice,
  d: Direction,
  count: number
): Lattice[] {
  const out: Lattice[] = [];
  // Four steps is the longest gap between positions on any of the
  // twelve rays (the along-row rays skip every other lattice point), so
  // this bound never truncates a ray that still has ends to give.
  const limit = count * 4 + 4;
  for (let k = 1; k <= limit && out.length < count; k += 1) {
    const l = { u: from.u + k * d.du, v: from.v + k * d.dv };
    if (latticeKind(l) !== null) out.push(l);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What a wall does
// ---------------------------------------------------------------------------

interface Seg {
  a: PlanePoint;
  b: PlanePoint;
}

const cross = (o: PlanePoint, a: PlanePoint, b: PlanePoint): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Whether two closed segments meet, endpoints and collinear overlap
 * included. `EPS` is scaled by the segment lengths so it stays a
 * relative tolerance at any `size`. */
export function segmentsIntersect(s: Seg, t: Seg): boolean {
  const scale =
    Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) +
    Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  const eps = 1e-9 * (scale || 1);
  const d1 = cross(t.a, t.b, s.a);
  const d2 = cross(t.a, t.b, s.b);
  const d3 = cross(s.a, s.b, t.a);
  const d4 = cross(s.a, s.b, t.b);
  const straddles =
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  if (straddles) return true;
  const onSeg = (p: PlanePoint, q: PlanePoint, r: PlanePoint): boolean =>
    Math.abs(cross(p, q, r)) <= eps &&
    r.x >= Math.min(p.x, q.x) - eps &&
    r.x <= Math.max(p.x, q.x) + eps &&
    r.y >= Math.min(p.y, q.y) - eps &&
    r.y <= Math.max(p.y, q.y) + eps;
  return (
    onSeg(t.a, t.b, s.a) ||
    onSeg(t.a, t.b, s.b) ||
    onSeg(s.a, s.b, t.a) ||
    onSeg(s.a, s.b, t.b)
  );
}

/** Whether a point is inside a convex polygon (its boundary counts). */
function pointInPolygon(p: PlanePoint, poly: PlanePoint[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const c = cross(poly[i], poly[(i + 1) % poly.length], p);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/** Whether the closed segment meets the closed hex of `cell` (C8's
 * test). */
export function segmentMeetsCell(
  o: Orientation,
  seg: Seg,
  cell: Axial,
  size: number
): boolean {
  const corners = cellCorners(o, cell, size);
  if (pointInPolygon(seg.a, corners) || pointInPolygon(seg.b, corners))
    return true;
  for (let i = 0; i < 6; i += 1) {
    if (segmentsIntersect(seg, { a: corners[i], b: corners[(i + 1) % 6] }))
      return true;
  }
  return false;
}

/** Every cell within `rings` steps of `cell`, itself included. */
function neighbourhood(cell: Axial, rings: number): Axial[] {
  let frontier = [cell];
  const seen = new Map<string, Axial>([[`${cell.q},${cell.r}`, cell]]);
  for (let i = 0; i < rings; i += 1) {
    const next: Axial[] = [];
    for (const c of frontier) {
      for (const n of axialNeighbors(c)) {
        const key = `${n.q},${n.r}`;
        if (seen.has(key)) continue;
        seen.set(key, n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return [...seen.values()];
}

/** The lattice points from `a` to `b` inclusive, when the two lie on one
 * of the twelve directions; null when they do not (F13's refusal is the
 * caller's to phrase). */
export function latticeWalk(a: Lattice, b: Lattice): Lattice[] | null {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  if (du === 0 && dv === 0) return null;
  if (!Number.isInteger(du) || !Number.isInteger(dv)) return null;
  const steps = gcd(Math.abs(du), Math.abs(dv));
  const d = { du: du / steps, dv: dv / steps };
  if (!DIRECTIONS.some((x) => x.du === d.du && x.dv === d.dv)) return null;
  return Array.from({ length: steps + 1 }, (_, k) => ({
    u: a.u + k * d.du,
    v: a.v + k * d.dv,
  }));
}

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/** The direction a wall runs in, or null when its ends do not lie on
 * one of the twelve (F13). */
export function wallDirection(a: Lattice, b: Lattice): Direction | null {
  const walk = latticeWalk(a, b);
  if (!walk || walk.length < 2) return null;
  return { du: walk[1].u - walk[0].u, dv: walk[1].v - walk[0].v };
}

/**
 * The cells a wall from `a` to `b` seals: exactly the cell centres its
 * closed segment runs through (design §4.3 — see this module's header
 * for why that is the whole answer for ONE wall and why combinations
 * are the compiler's). Empty for every thin wall.
 */
export function sealedBy(o: Orientation, a: Lattice, b: Lattice): Axial[] {
  const walk = latticeWalk(a, b);
  if (!walk) return [];
  const out: Axial[] = [];
  for (const l of walk) {
    if (latticeKind(l) !== 'centre') continue;
    const cell = positionAt(o, l);
    if (cell) out.push(cell.cell);
  }
  return out;
}

/**
 * Every cell the wall's closed segment passes through (C8), in no
 * particular order. Candidates come from the lattice points along the
 * wall grown by two rings — a cell the segment meets has its centre
 * within one circumradius of the segment, and every point of the
 * segment is within 0.75 circumradii of a lattice point on it, so two
 * rings (√3 each) covers the 2.75 worst case with room to spare — and
 * each candidate is then tested exactly.
 */
export function wallFootprint(
  o: Orientation,
  a: Lattice,
  b: Lattice,
  size = 1
): Axial[] {
  const walk = latticeWalk(a, b);
  if (!walk) return [];
  const seg: Seg = {
    a: latticePoint(o, a, size),
    b: latticePoint(o, b, size),
  };
  const candidates = new Map<string, Axial>();
  for (const l of walk) {
    for (const cell of neighbourhood(
      cellAtPoint(o, latticePoint(o, l, size), size),
      2
    )) {
      candidates.set(`${cell.q},${cell.r}`, cell);
    }
  }
  const out: Axial[] = [];
  for (const cell of candidates.values()) {
    if (segmentMeetsCell(o, seg, cell, size)) out.push(cell);
  }
  return out;
}

/**
 * The crossings a wall blocks (C7): a step between adjacent cells P and
 * Q is blocked when the closed segment centre(P)→centre(Q) meets the
 * closed wall segment. Derived from the wall alone; the caller decides
 * which of the pairs are floor.
 */
export function wallCrossings(
  o: Orientation,
  a: Lattice,
  b: Lattice,
  size = 1
): Edge[] {
  const seg: Seg = {
    a: latticePoint(o, a, size),
    b: latticePoint(o, b, size),
  };
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const cell of wallFootprint(o, a, b, size)) {
    const from = centrePoint(o, cell, size);
    for (const n of axialNeighbors(cell)) {
      const key =
        cell.q < n.q || (cell.q === n.q && cell.r < n.r)
          ? `${cell.q},${cell.r}|${n.q},${n.r}`
          : `${n.q},${n.r}|${cell.q},${cell.r}`;
      if (seen.has(key)) continue;
      const to = centrePoint(o, n, size);
      if (!segmentsIntersect(seg, { a: from, b: to })) continue;
      seen.add(key);
      out.push([cell, n]);
    }
  }
  return out;
}
