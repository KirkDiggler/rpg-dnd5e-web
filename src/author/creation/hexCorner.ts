/**
 * hexCorner — corner-lattice addressing for the wall gesture's endpoints
 * (rpg-dnd5e-web#804, design: rpg-project#267 `wall-authoring-gesture.md`).
 *
 * Resurrected from this repo's own history (the pre-restart builder's
 * `hexCorner.ts`, `git show 6503936^:src/author/creation/hexCorner.ts`)
 * rather than re-derived — the corner-anchoring lesson it encodes is
 * Kirk's own, live: "it always hangs over a little." Cell-CENTER
 * anchoring overshoots by up to half a hex at each end by construction,
 * no matter how carefully a wall is drawn; corners are the finest honest
 * lattice a hex grid has, and a corner is where a real wall's own
 * boundary already lives (`edgeSegment`'s edge geometry is
 * corner-to-corner). The adaptation: the old copy addressed corners as
 * `{cell: [col,row], corner}` over the pointy-only `hexLayout` module;
 * this one is AXIAL over `canvasGeometry.ts`'s orientation-aware SVG
 * space, like everything else in `src/author/` (`hexOffset.ts`: nothing
 * outside parse/emit holds a `[col,row]`).
 *
 * **Dedup convention.** Every interior corner is shared by exactly 3 hex
 * cells (verified by `hexCorner.test.ts`'s `cornerOwners` cases, not
 * assumed), so the same physical point has up to 3 equally valid
 * `{cell, corner}` representations, and two chains (or one drag's own
 * A/B addressed from either side) must serialize the SAME physical
 * corner IDENTICALLY for equality and Map keys to work without an
 * epsilon comparison at every call site. The rule: **canonical = the
 * owner with the smallest `(r, q)`** (`compareAxial`'s own order), ties
 * broken by the smaller corner index. The old copy ordered by
 * `[col, row]` and excluded negative cells (its grid started at 0);
 * this canvas's bounds GROW in every direction (`growBounds`), so the
 * rule is axial and unbounded — any deterministic total order works,
 * this one is the module's own `compareAxial`, reused not invented.
 *
 * The lattice-topology helpers (`cornerNeighbors`, `latticeEdgeCells`)
 * are new with #804: the taut-path walk steps corner-to-corner and
 * needs, at each corner, its 3 incident lattice edges and the one
 * adjacent cell pair each edge separates. They live here, not in
 * `wallGesture.ts`, because they are corner-lattice facts, not gesture
 * policy.
 */
import type { Point } from '../../concepts/session-tomb/atlas';
import {
  axialNeighbors,
  compareAxial,
  normalizeEdge,
  type Axial,
  type Edge,
  type Orientation,
} from '../hexOffset';
import { cellCorners } from './canvasGeometry';

/** One (cell, corner-index) address of a hex-lattice vertex. `corner`
 * is 0-5 in `hexCorners`' own convention (`atlas.ts`: angle
 * `offset + 60°·i`, offset −30° pointy / 0° flat) — the SAME indexing
 * every corner consumer of `canvasGeometry` already uses. */
export interface CornerRef {
  cell: Axial;
  corner: number;
}

/** Two floating-point evaluations of the same real corner (via
 * `hexCenter`'s trig from different owner cells) agree to ~1e-12 at
 * this board's scale; different corners sit a full hex side apart.
 * Scaled by `size` so the tolerance means the same thing at any board
 * scale. */
const CORNER_MATCH_EPSILON = 1e-6;

function normalizeCornerIndex(i: number): number {
  return ((i % 6) + 6) % 6;
}

/** The SVG user-space point `ref` addresses. */
export function cornerPoint(
  ref: CornerRef,
  size: number,
  o: Orientation
): Point {
  return cellCorners(ref.cell, size, o)[normalizeCornerIndex(ref.corner)];
}

/**
 * Every `{cell, corner}` pair whose corner point coincides with `ref`'s
 * own — geometric neighbors only (`ref.cell` plus its 6 hex neighbors,
 * the only cells that CAN share a vertex with it). Unbounded: the
 * canvas grows in every direction, so unlike the old copy there is no
 * in-grid filter — every geometric owner is a legal address.
 */
export function cornerOwners(
  ref: CornerRef,
  size: number,
  o: Orientation
): CornerRef[] {
  const target = cornerPoint(ref, size, o);
  const eps = CORNER_MATCH_EPSILON * size;
  const owners: CornerRef[] = [];
  for (const cell of [ref.cell, ...axialNeighbors(ref.cell)]) {
    cellCorners(cell, size, o).forEach((p, ci) => {
      if (Math.hypot(p.x - target.x, p.y - target.y) < eps) {
        owners.push({ cell, corner: ci });
      }
    });
  }
  return owners;
}

/** The one canonical `{cell, corner}` representation of the point `ref`
 * addresses — smallest `(r, q)` owner cell (`compareAxial`), then the
 * smaller corner index. Always returns at least `ref` itself
 * (canonicalized): `ref.cell` is one of its own owners. */
export function canonicalCorner(
  ref: CornerRef,
  size: number,
  o: Orientation
): CornerRef {
  const normalized: CornerRef = {
    cell: ref.cell,
    corner: normalizeCornerIndex(ref.corner),
  };
  const owners = cornerOwners(normalized, size, o);
  let best = owners[0] ?? normalized;
  for (const owner of owners) {
    if (
      compareAxial(owner.cell, best.cell) < 0 ||
      (compareAxial(owner.cell, best.cell) === 0 && owner.corner < best.corner)
    ) {
      best = owner;
    }
  }
  return best;
}

/** The canonical corner as a Map/Set key — exact string equality for
 * the same physical vertex, whichever owner cell addressed it. */
export function cornerKey(
  ref: CornerRef,
  size: number,
  o: Orientation
): string {
  const c = canonicalCorner(ref, size, o);
  return `${c.cell.q},${c.cell.r}#${c.corner}`;
}

/** Two `CornerRef`s addressing the identical physical vertex, regardless
 * of which of their (up to 3) equally valid owner cells each uses —
 * exact integer comparison of canonical forms, not an epsilon-tolerant
 * float comparison at every call site. */
export function sameCorner(
  a: CornerRef,
  b: CornerRef,
  size: number,
  o: Orientation
): boolean {
  const ca = canonicalCorner(a, size, o);
  const cb = canonicalCorner(b, size, o);
  return compareAxial(ca.cell, cb.cell) === 0 && ca.corner === cb.corner;
}

/**
 * The axial cell containing an SVG point — the exact inverse of
 * `cellCenter`'s two layout formulas plus standard cube rounding
 * (round q/r/s, then recompute the component with the largest rounding
 * error from the other two, so the result is always a real cell). The
 * gesture needs a true inverse because angle magnetism PROJECTS the
 * pointer onto a seam line: over a long drag the projected point can
 * land hexes away from the cell the pointer event fired on, so an
 * anchor-cell-plus-neighbors search is not enough.
 */
export function cellAtPoint(point: Point, size: number, o: Orientation): Axial {
  const qf =
    o === 'pointy'
      ? point.x / (size * Math.sqrt(3)) - point.y / (3 * size)
      : point.x / (1.5 * size);
  const rf =
    o === 'pointy'
      ? point.y / (1.5 * size)
      : point.y / (size * Math.sqrt(3)) - point.x / (3 * size);
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const sr = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(sr - sf);
  if (dq > dr && dq > ds) q = -r - sr;
  else if (dr > ds) r = -q - sr;
  // Math.round(-0.2) is -0; +0 normalizes it so axialKey/toEqual never
  // see two spellings of the same cell.
  return { q: q + 0, r: r + 0 };
}

/**
 * Nearest corner-lattice point to an SVG point, canonicalized — what a
 * gesture endpoint snaps to. Anchored by `cellAtPoint`: the true
 * nearest corner to a point inside a cell is always a corner of that
 * cell or of one of its 6 neighbors, and all of those are checked by
 * real distance — a point near a cell boundary can have its nearest
 * corner belong to the neighbor first.
 */
export function nearestCorner(
  point: Point,
  size: number,
  o: Orientation
): CornerRef {
  const anchorCell = cellAtPoint(point, size, o);
  let best: CornerRef = { cell: anchorCell, corner: 0 };
  let bestDistSq = Infinity;
  for (const cell of [anchorCell, ...axialNeighbors(anchorCell)]) {
    cellCorners(cell, size, o).forEach((p, ci) => {
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = { cell, corner: ci };
      }
    });
  }
  return canonicalCorner(best, size, o);
}

/**
 * The 3 lattice corners adjacent to `ref` — the far ends of its
 * incident lattice edges (every interior honeycomb vertex has exactly
 * 3). Computed from the owners: within each owner cell, the two
 * corners flanking `ref`'s own index are lattice-adjacent to it;
 * deduped across owners by canonical key.
 */
export function cornerNeighbors(
  ref: CornerRef,
  size: number,
  o: Orientation
): CornerRef[] {
  const neighbors: CornerRef[] = [];
  const seen = new Set<string>();
  for (const owner of cornerOwners(ref, size, o)) {
    for (const delta of [-1, 1]) {
      const candidate: CornerRef = {
        cell: owner.cell,
        corner: normalizeCornerIndex(owner.corner + delta),
      };
      const key = cornerKey(candidate, size, o);
      if (seen.has(key)) continue;
      seen.add(key);
      neighbors.push(canonicalCorner(candidate, size, o));
    }
  }
  return neighbors;
}

/**
 * The one adjacent cell pair the lattice edge `v`–`w` separates — the
 * `walls[]` edge that lattice edge authors (design: "each lattice edge
 * walked separates exactly one adjacent cell pair"). The pair is the
 * intersection of the two corners' owner cells: a lattice edge is a
 * shared hex side, and exactly its two flanking cells own both of its
 * endpoints. Returns null when `v` and `w` are not lattice-adjacent
 * (no cell pair shares both corners — a caller's mistake surfaced as
 * absence, mirroring `edgeBetween`'s own adjacency-is-checked rule).
 */
export function latticeEdgeCells(
  v: CornerRef,
  w: CornerRef,
  size: number,
  o: Orientation
): Edge | null {
  const wOwnerKeys = new Set(
    cornerOwners(w, size, o).map((owner) => `${owner.cell.q},${owner.cell.r}`)
  );
  const shared: Axial[] = [];
  for (const owner of cornerOwners(v, size, o)) {
    const key = `${owner.cell.q},${owner.cell.r}`;
    if (wOwnerKeys.has(key)) {
      wOwnerKeys.delete(key); // each cell counted once
      shared.push(owner.cell);
    }
  }
  if (shared.length !== 2) return null;
  return normalizeEdge([shared[0], shared[1]]);
}
