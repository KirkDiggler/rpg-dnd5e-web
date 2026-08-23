/**
 * hexOffset — the ONE place the builder turns an axial cell into the
 * file's offset `[col,row]` and back (rpg-project#256, design §2).
 *
 * The builder thinks in axial (q, r) — the same frame the wire's
 * `Position` carries and `positionBridge.ts` turns into `hexMath.ts`'s
 * cube coordinates. The YAML is written in offset `[col,row]` under the
 * dungeon's declared `orientation`, and the toolkit's `HexCellAt` turns
 * that back into axial with exactly these two schemes:
 *
 * - `pointy` (pointy-top) shifts its ROWS — odd-r.
 * - `flat` (flat-top) shifts its COLUMNS — odd-q.
 *
 * (`rpg-toolkit/tools/spatial/position.go`, pinned there by
 * `hex_offset_law_test.go`.) `toOffset` is called at emit time only and
 * `fromOffset` at parse time only; nothing else in `src/author/` holds a
 * `[col,row]`. The symmetric-bug lesson (rpg-toolkit#1150): a conversion
 * swapped identically both ways passes every round-trip test, so the
 * discriminator in `hexOffset.test.ts` is a PIXEL formula per scheme, not
 * `fromOffset(toOffset(x)) === x`.
 */

export type Orientation = 'pointy' | 'flat';

/** An axial hex cell: q along the columns, r along the rows. */
export interface Axial {
  q: number;
  r: number;
}

/** The file's `[col,row]` pair. */
export type OffsetPair = [col: number, row: number];

/** `x & 1` as Go computes it for negative ints too (two's complement) —
 * `-3 & 1 === 1` in both languages, so this is the same parity the
 * toolkit uses. Spelled out so the intent is visible. */
const odd = (n: number): number => n & 1;

export function toOffset(orientation: Orientation, cell: Axial): OffsetPair {
  if (orientation === 'flat') {
    // odd-q: columns are straight, odd columns shift down.
    return [cell.q, cell.r + (cell.q - odd(cell.q)) / 2];
  }
  // odd-r: rows are straight, odd rows shift right.
  return [cell.q + (cell.r - odd(cell.r)) / 2, cell.r];
}

export function fromOffset(
  orientation: Orientation,
  [col, row]: OffsetPair
): Axial {
  if (orientation === 'flat') {
    return { q: col, r: row - (col - odd(col)) / 2 };
  }
  return { q: col - (row - odd(row)) / 2, r: row };
}

export const axialKey = (cell: Axial): string => `${cell.q},${cell.r}`;

export function parseAxialKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export const sameCell = (a: Axial, b: Axial): boolean =>
  a.q === b.q && a.r === b.r;

/** The six axial neighbour offsets — the same topology under either
 * orientation (axial fixes adjacency; orientation only fixes the
 * picture). */
export const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialNeighbors(cell: Axial): Axial[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: cell.q + d.q, r: cell.r + d.r }));
}

export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const areAdjacent = (a: Axial, b: Axial): boolean =>
  axialDistance(a, b) === 1;

/** An undirected edge between two cells, keyed so `[a,b]` and `[b,a]`
 * are the same edge. */
export type Edge = [Axial, Axial];

export function normalizeEdge([a, b]: Edge): Edge {
  return compareAxial(a, b) <= 0 ? [a, b] : [b, a];
}

export function edgeKey(edge: Edge): string {
  const [a, b] = normalizeEdge(edge);
  return `${axialKey(a)}|${axialKey(b)}`;
}

/** Stable in-memory ordering (by r then q). The emitter re-sorts in
 * OFFSET terms per orientation (`dungeonYaml.ts`), so this is only for
 * edge normalization and deterministic iteration. */
export function compareAxial(a: Axial, b: Axial): number {
  return a.r - b.r || a.q - b.q;
}
