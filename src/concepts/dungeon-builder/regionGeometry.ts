/**
 * regionGeometry — pure geometry for cell-authored semantic regions
 * (rpg-project#180, "cell-authored semantic room regions"). Kept separate
 * from `dungeonYaml.ts`'s CST layer, the same split `boardGeometry.ts`/
 * `creationGeometry.ts` already use for every other pure-math concern in
 * this concept: unit-testable without a CST document, and reusable by
 * both the creation board (rectangular canvas) and the edit-mode hex
 * board's read-only overlay, since a region's membership is expressed in
 * the same abstract absolute [col,row] cell space regardless of which
 * board renders it. Deliberately has NO dependency on `DungeonDoc`/
 * `RegionDoc` (dungeonYaml.ts) — every function here takes plain cell
 * arrays, so dungeonYaml.ts can import this module without creating a
 * cycle.
 */

export type Cell = [number, number];

function cellKey(c: Cell): string {
  return `${c[0]},${c[1]}`;
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Orthogonal (4-neighbor) adjacency — the same adjacency `walls:`'s own
 * "from/to must be orthogonally adjacent cells" rule assumes
 * (TARGET-YAML.md's annotated example), and the one `cellsAreContiguous`/
 * `sharedBoundaryEdges` below both build on. Diagonal neighbors don't
 * count: there is no orthogonal wall/door edge to author between two
 * cells that only touch at a corner. */
export function cellsAdjacent(a: Cell, b: Cell): boolean {
  const dc = Math.abs(a[0] - b[0]);
  const dr = Math.abs(a[1] - b[1]);
  return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
}

/** BFS connectivity over a cell list's own orthogonal adjacency —
 * rpg-project#180's own acceptance criterion: "Overlapping, disconnected,
 * empty, and invalid cell sets fail with author-facing validation
 * errors." A single cell is trivially contiguous; an empty list is
 * deliberately NOT contiguous here (there's nothing to connect) — callers
 * that need a distinct "empty" message should check `cells.length === 0`
 * separately (see `dungeonYaml.ts`'s `validateRegionCells`, which folds
 * both checks into one author-facing string). */
export function cellsAreContiguous(cells: readonly Cell[]): boolean {
  if (cells.length === 0) return false;
  const seen = new Set<string>([cellKey(cells[0])]);
  const stack: Cell[] = [cells[0]];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of cells) {
      const key = cellKey(c);
      if (seen.has(key)) continue;
      if (cellsAdjacent(cur, c)) {
        seen.add(key);
        stack.push(c);
      }
    }
  }
  return seen.size === cells.length;
}

export interface RegionEdge {
  /** The cell on the first region's side. */
  from: Cell;
  /** The cell on the second region's side, orthogonally adjacent to `from`. */
  to: Cell;
}

/** Every orthogonal edge with one cell in `cellsA` and the other in
 * `cellsB` — the candidate set for "attach these two regions with a door"
 * (TARGET-YAML.md's "region attachment" section). Deliberately does not
 * consult `walls:` at all: per the settled early-authoring model
 * (rpg-project#175), a region's membership carries no implied wall on its
 * own boundary — two regions can be adjacent with an open (wall-free)
 * boundary today, same as two hand-declared rooms can be. O(|cellsA| *
 * |cellsB|); both lists are small (a handful to a few dozen cells for any
 * region this concept has authored), so the brute-force pairing is simpler
 * to verify than a spatial index and cheap enough to run on every click. */
export function sharedBoundaryEdges(
  cellsA: readonly Cell[],
  cellsB: readonly Cell[]
): RegionEdge[] {
  const edges: RegionEdge[] = [];
  for (const a of cellsA) {
    for (const b of cellsB) {
      if (cellsAdjacent(a, b)) edges.push({ from: a, to: b });
    }
  }
  return edges;
}

/** Picks ONE edge from a shared boundary to place the "connect regions"
 * door on — the MIDPOINT edge along the boundary run, not an
 * author-clicked one. TARGET-YAML.md's "region attachment" section
 * records this as the deliberate first-pass choice: simplest to implement
 * and explain, at the cost of not letting the author pick a specific edge
 * when a boundary is long or L-shaped. Picking a specific edge
 * interactively (e.g. hovering the shared boundary and clicking one
 * segment) is a natural follow-up, not attempted this round.
 *
 * Deterministic: edges are sorted by their `to` cell's (row, then col) —
 * a stable, reproducible order for any given pair of regions, NOT a
 * physical-distance-along-the-boundary ordering (which would need the
 * boundary's own shape traced out as a path). This is a documented
 * simplification, good enough for the common case of one contiguous
 * straight or near-straight shared run; a boundary with multiple
 * disjoint segments (an author drew two regions that touch in two
 * separate places) will pick from whichever segment sorts into the
 * middle, not necessarily "the biggest" one. `null` when the two regions
 * share no boundary at all — the caller should surface this as a
 * rejection ("these regions aren't adjacent"), not a silent no-op. */
export function pickAttachmentEdge(
  edges: readonly RegionEdge[]
): RegionEdge | null {
  if (edges.length === 0) return null;
  const sorted = [...edges].sort((x, y) => {
    if (x.to[1] !== y.to[1]) return x.to[1] - y.to[1]; // row
    return x.to[0] - y.to[0]; // col
  });
  return sorted[Math.floor(sorted.length / 2)];
}

/** The centroid (arithmetic mean) of a region's cells — used for the
 * board's label placement only. Not a claim about the region's geometric
 * "center" for a non-rectangular shape: a mean is a reasonable, cheap
 * label anchor, but is not guaranteed to itself be a member cell for a
 * concave region — callers don't need it to be, since it's a label
 * position, not a click target. */
export function regionCentroid(cells: readonly Cell[]): {
  col: number;
  row: number;
} {
  if (cells.length === 0) return { col: 0, row: 0 };
  const sum = cells.reduce(
    (acc, c) => ({ col: acc.col + c[0], row: acc.row + c[1] }),
    { col: 0, row: 0 }
  );
  return { col: sum.col / cells.length, row: sum.row / cells.length };
}
