/**
 * regionTree — derives the containment forest for cell-authored semantic
 * regions (rpg-project#180, "cell-authored semantic room regions"). This
 * is the "regions are scopes" model settled across four consumer-position
 * comments on that issue (2026-08-04):
 *
 * 1. **Implicit root region** — every cell belongs to exactly one region;
 *    unpainted floor belongs to the implicit generic/root region. The
 *    model is total, no "regionless" special case.
 * 2. **Nesting is strict containment ONLY, resolved innermost-wins** —
 *    like lexical scopes. Overlap is forbidden except strict containment
 *    (Venn/partial overlap is invalid).
 * 3. **The YAML stays flat — nesting is derived, never written.** A
 *    region is inside another because its cells are a strict SUBSET of
 *    the outer region's own declared cells (the outer region's `cells:`
 *    list literally includes the inner one's cells — no `parent:` field,
 *    ever: a field would duplicate what the cell sets already say, and
 *    duplicated truth drifts).
 * 4. **Containment forms chains, so parent and innermost are unique and
 *    cheap.** Because overlap is allowed only by containment, all regions
 *    containing a given cell form a chain — any two that share a cell
 *    must be nested, hence comparable. The parent of a region R is its
 *    smallest strict superset (unique; none exists means the implicit
 *    root).
 *
 * Kept separate from `dungeonYaml.ts`'s CST layer and deliberately has NO
 * dependency on `DungeonDoc`/`RegionDoc` — the same discipline
 * `regionGeometry.ts` already follows (see its own header comment): every
 * function here takes a plain `RegionLike[]`, so both boards and
 * `dungeonYaml.ts` itself can import this module without creating a
 * cycle, and it's unit-testable without a CST document.
 *
 * **Dialect note**: the SHIPPED client-side validation
 * (`dungeonYaml.ts`'s `validateRegionCells`) still enforces flat
 * non-overlap — ANY shared cell is rejected, including a valid strict
 * containment. Nested authoring isn't wired up yet (no paint-a-region-
 * inside-another affordance), so every document the creation board itself
 * can currently produce is a flat one-level forest (every region a direct
 * child of the implicit root). This module handles arbitrary nesting
 * depth regardless, so it renders correctly the day validation allows
 * painting a nested region, and so it can render a HAND-EDITED YAML
 * document (pasted into the YAML pane) that already nests today — the
 * parser doesn't reject it, only the interactive brush does.
 */
import type { Cell } from './regionGeometry';

function cellKey(c: Cell): string {
  return `${c[0]},${c[1]}`;
}

function toCellSet(cells: readonly Cell[]): Set<string> {
  return new Set(cells.map(cellKey));
}

/** The minimal shape `buildRegionTree`/`rootCellCount` need — structurally
 * compatible with `dungeonYaml.ts`'s `RegionDoc` without importing it (see
 * this file's own header comment for why). */
export interface RegionLike {
  id: string;
  name?: string;
  archetype: string;
  cells: Cell[];
}

export interface RegionTreeNode<T extends RegionLike = RegionLike> {
  region: T;
  /** 1 = a direct child of the implicit root (what a flat, un-nested
   * document's regions all are today); 2 = nested one level inside a
   * depth-1 region; and so on. The implicit root itself is depth 0 and is
   * NOT a `RegionTreeNode` — it has no `RegionLike` to hold (see
   * `rootCellCount` for its cell count instead). */
  depth: number;
  /** Regions whose smallest strict superset is this one. Empty for a leaf
   * — every region in a flat document is a leaf. */
  children: RegionTreeNode<T>[];
}

/** Two regions overlap without either strictly containing the other — a
 * Venn/partial overlap, forbidden by the settled model (nesting is
 * strict-containment-only). The interactive brush can't produce this
 * today (`validateRegionCells` rejects ANY overlap, containment
 * included), but a hand-edited YAML document pasted into the YAML pane
 * can, since the parser itself doesn't enforce it — this is exactly the
 * case this warning exists to surface. */
export interface RegionOverlapWarning {
  regionAId: string;
  regionBId: string;
  /** The intersecting cells, capped to `OVERLAP_SAMPLE_CELLS` — a
   * "sample," not a complete accounting, since a large overlap's full
   * cell list isn't more useful for an author-facing message than a
   * representative handful. */
  cells: Cell[];
  /** True count of intersecting cells — may exceed `cells.length` when
   * capped. */
  cellCount: number;
}

export interface RegionTree<T extends RegionLike = RegionLike> {
  /** Regions with no strict superset among `regions` — direct children of
   * the implicit root. A flat, un-nested document (everything shipped
   * today produces) has every region here, none nested under another. */
  roots: RegionTreeNode<T>[];
  overlaps: RegionOverlapWarning[];
}

/** Exported so `dungeonYaml.ts`'s own overlap-evidence helper
 * (`findRegionCellOverlap`, region-brush honesty round, 2026-08-06) caps
 * its sample the same way — one "representative handful" convention for
 * every region-overlap surface in this concept, not two independently
 * chosen numbers. */
export const OVERLAP_SAMPLE_CELLS = 6;

/** How two regions' cell sets relate, given their sizes and shared-cell
 * count — the one comparison every pairwise check in this module reduces
 * to. `sizeA <= sizeB` is NOT assumed; the caller passes both sizes as
 * measured. */
function relate(
  sizeA: number,
  sizeB: number,
  shared: number
): 'disjoint' | 'a-in-b' | 'b-in-a' | 'overlap' {
  if (shared === 0) return 'disjoint';
  // Strict containment requires the smaller set to be FULLY covered by
  // the bigger one AND a genuine size difference — two regions painted
  // with the exact same cells (shared === sizeA === sizeB) are neither's
  // strict subset, so they fall through to 'overlap' below, same as a
  // true Venn intersection. That's deliberate: an author who somehow
  // produces two same-cells regions (hand-edited YAML; the brush's own
  // overlap check would reject it) gets the same "these don't nest"
  // warning a partial overlap would, not a silently-accepted containment.
  if (shared === sizeA && sizeA < sizeB) return 'a-in-b';
  if (shared === sizeB && sizeB < sizeA) return 'b-in-a';
  return 'overlap';
}

/** Derives the containment forest from a flat `regions` list — parent =
 * smallest strict superset by cell-subset check (rpg-project#180's
 * settled model, see this file's own header comment). O(n^2) pairwise
 * comparisons; fine for the handful-to-dozens of regions this concept
 * authors. Order of `regions` doesn't affect the result — the forest
 * shape is purely a function of cell-set relationships. */
export function buildRegionTree<T extends RegionLike>(
  regions: readonly T[]
): RegionTree<T> {
  const sets = new Map<string, Set<string>>();
  for (const r of regions) sets.set(r.id, toCellSet(r.cells));

  const overlaps: RegionOverlapWarning[] = [];
  // For each region, every OTHER region that strictly contains it, with
  // that ancestor's cell-set size — the parent is whichever candidate has
  // the SMALLEST size (the tightest-fitting superset). Chains guarantee
  // this is well-defined: any two ancestors of the same region must
  // themselves be comparable (both contain this region's cells, so they
  // share cells, so under the settled model they must nest), which is
  // exactly why a unique smallest one exists rather than several
  // incomparable candidates tying for "closest."
  const ancestorCandidates = new Map<string, { id: string; size: number }[]>();
  for (const r of regions) ancestorCandidates.set(r.id, []);

  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      const setA = sets.get(a.id)!;
      const setB = sets.get(b.id)!;
      let shared = 0;
      // Iterate the smaller set for the intersection count — cheap, and
      // this loop runs O(n^2) times across the whole region list.
      const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
      for (const k of small) if (big.has(k)) shared++;

      const rel = relate(setA.size, setB.size, shared);
      if (rel === 'a-in-b') {
        ancestorCandidates.get(a.id)!.push({ id: b.id, size: setB.size });
      } else if (rel === 'b-in-a') {
        ancestorCandidates.get(b.id)!.push({ id: a.id, size: setA.size });
      } else if (rel === 'overlap') {
        const sharedCells = a.cells.filter((c) => setB.has(cellKey(c)));
        overlaps.push({
          regionAId: a.id,
          regionBId: b.id,
          cells: sharedCells.slice(0, OVERLAP_SAMPLE_CELLS),
          cellCount: sharedCells.length,
        });
      }
      // 'disjoint' pairs need no record — they simply don't constrain
      // each other's parent.
    }
  }

  const parentOf = new Map<string, string | null>();
  for (const r of regions) {
    const candidates = ancestorCandidates.get(r.id)!;
    if (candidates.length === 0) {
      parentOf.set(r.id, null);
      continue;
    }
    let best = candidates[0];
    for (const c of candidates) if (c.size < best.size) best = c;
    parentOf.set(r.id, best.id);
  }

  const nodeOf = new Map<string, RegionTreeNode<T>>();
  for (const r of regions)
    nodeOf.set(r.id, { region: r, depth: 0, children: [] });

  const roots: RegionTreeNode<T>[] = [];
  for (const r of regions) {
    const node = nodeOf.get(r.id)!;
    const parentId = parentOf.get(r.id)!;
    if (parentId === null) {
      roots.push(node);
    } else {
      nodeOf.get(parentId)!.children.push(node);
    }
  }

  // Depths: a direct child of the implicit root is depth 1 (the implicit
  // root itself, uninstantiated as a node, is depth 0) — chosen so "flat
  // docs: all at depth 1" reads naturally rather than needing a +1
  // everywhere a caller renders depth.
  function assignDepth(node: RegionTreeNode<T>, depth: number): void {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  }
  for (const root of roots) assignDepth(root, 1);

  return { roots, overlaps };
}

/** Pre-order (parent-before-children) flattening of a `RegionTree` — the
 * natural render order for an indented list ("root row first ... then
 * children indented under parents"). Each node's own `depth` (set by
 * `buildRegionTree`) carries the indentation a caller needs. */
export function flattenRegionTree<T extends RegionLike>(
  tree: RegionTree<T>
): RegionTreeNode<T>[] {
  const out: RegionTreeNode<T>[] = [];
  function walk(node: RegionTreeNode<T>): void {
    out.push(node);
    for (const child of node.children) walk(child);
  }
  for (const root of tree.roots) walk(root);
  return out;
}

/** The implicit root region's own cell count — rpg-project#180's
 * regions-are-scopes refinement: unpainted floor belongs to the implicit
 * generic/root region, so every document is total (no "regionless"
 * special case). Root's cells are exactly `totalFloorCells` minus every
 * cell claimed by ANY authored region, at any depth.
 *
 * Unions ALL regions regardless of nesting depth, not just top-level
 * ones — for a VALID nested document these are the same set (a child's
 * cells are always a literal subset of its parent's own declared `cells:`
 * list, per the representation decision in this file's header comment),
 * but unioning everything keeps this correct even for a malformed
 * document `buildRegionTree` would also flag with an overlap warning.
 *
 * `totalFloorCells` is caller-supplied rather than derived here because
 * "the floor" means something different for a creation-mode canvas
 * (`creation/canvasFloor.ts`'s `deriveCanvasFloorCells` — the canvas
 * grid's bounds minus holes) than for a compiled/edit-mode document (the
 * server-generated `FloorPlan`'s room geometry, which this concept has no
 * single flattened cell-list helper for yet). Only creation mode has a
 * regions panel to show a root row in this round (`RegionPanel.tsx`);
 * this function stays floor-source-agnostic so an edit-mode consumer can
 * reuse it later without this module needing to know about `FloorPlan` at
 * all. */
/** Biggest-cell-count-first paint order for `doc.regions` — the settled
 * "regions are scopes" model nests strictly by cell-subset, so a child
 * region's cell count is always LESS than its parent's (see this file's
 * own header comment). Painting the biggest first and the smallest last
 * means a nested (inner) region's tint/stroke always lands on top of its
 * container's, "innermost visible," WITHOUT a renderer needing the actual
 * containment forest (`buildRegionTree`) just to get paint order right —
 * both `Board.tsx`'s read-only overlay and `creation/CreationBoard.tsx`'s
 * interactive one use this. Previously each simply iterated `doc.regions`
 * in authoring/array order, which only drew correctly by accident (an
 * author happening to declare the outer region before the inner one in
 * the YAML) — no nested document exists in the wild yet (shipped
 * validation is flat non-overlap), but a hand-typed one pasted into the
 * YAML pane shouldn't depend on declaration order to render sanely. A
 * stable sort: two same-size regions (siblings, or a still-invalid Venn
 * overlap) keep their original relative order. */
export function regionsByPaintOrder<T extends { cells: unknown[] }>(
  regions: readonly T[]
): T[] {
  return [...regions].sort((a, b) => b.cells.length - a.cells.length);
}

export function rootCellCount<T extends RegionLike>(
  totalFloorCells: readonly Cell[],
  regions: readonly T[]
): number {
  const claimed = new Set<string>();
  for (const r of regions) for (const c of r.cells) claimed.add(cellKey(c));
  let count = 0;
  for (const c of totalFloorCells) if (!claimed.has(cellKey(c))) count++;
  return count;
}
