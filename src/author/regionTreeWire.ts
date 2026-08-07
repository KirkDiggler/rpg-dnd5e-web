/**
 * regionTreeWire — v0.3 wire consumption for the region containment forest
 * (this unit, 2026-08-05). `regionTree.ts`'s `buildRegionTree` INFERS
 * containment from cell-subset comparison; this module instead builds the
 * SAME `RegionTree` shape directly from `FloorPlanRegion.parent_id`
 * (rpg-api-protos v0.1.120, spec.md §4.10.4) when a live response carries
 * one — the wire's `parent_id` field comment says it plainly ("Toolkit-derived
 * direct declared parent ID"), so once it's present there is nothing left
 * to infer: recomputing it client-side would just be re-deriving what the
 * producer already computed authoritatively.
 *
 * Kept as a SEPARATE module from `regionTree.ts` rather than adding a
 * `FloorPlan`-typed function there — `regionTree.ts`'s own header comment
 * documents itself as deliberately dependency-free (no `DungeonDoc`/
 * `RegionDoc`, let alone a wire proto type), reusable by both boards
 * without pulling in this concept's network layer. This module is the one
 * place that DOES import the wire type, the same split
 * `creation/canvasFloor.ts`'s `resolveCanvasFloor` follows for the canvas
 * floor's own wire-vs-derived choice.
 *
 * **Rollout discipline (rpg-api-protos#214 conformance review, finding
 * A4)**: regions (spec.md §1 group (d), rpg-project#180/Wave 1) is not
 * shipped server-side yet — a live server today always answers with an
 * empty `FloorPlan.regions`, which this module treats identically to no
 * `floorPlan` at all (never "the document declares zero regions").
 *
 * **Dangling `parent_id` (finding A2)**: the conformance review flagged
 * that referential closure — `parent_id` resolving to another declared
 * region's `id` — is a producer expectation the proto never states as a
 * MUST, so a client has to defensively handle a dangling reference. This
 * module treats a dangling `parent_id` as root for TREE-BUILDING purposes
 * (same graceful behavior an absent `parent_id` gets) but still surfaces
 * it as a named warning — a dangling parent is a real drift signal, not
 * something to silently swallow.
 */
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  buildRegionTree,
  type RegionLike,
  type RegionTree,
  type RegionTreeNode,
} from './regionTree';

export type RegionTreeSource = 'server' | 'derived';

/** One region where the wire's authoritative parent (once present)
 * disagrees with what `regionTree.ts`'s own cell-subset inference would
 * derive for the SAME region set — a server/client containment
 * disagreement is exactly the drift class worth surfacing loudly rather
 * than silently preferring one side. `undefined` on either side means
 * "root" on that side. */
export interface RegionParentMismatch {
  regionId: string;
  wireParentId: string | undefined;
  derivedParentId: string | undefined;
}

/** A wire region's `parent_id` that does not resolve to another wire
 * region's `id` (conformance review finding A2). */
export interface DanglingParentWarning {
  regionId: string;
  danglingParentId: string;
}

export interface ResolvedRegionTree<T extends RegionLike = RegionLike> {
  tree: RegionTree<T>;
  source: RegionTreeSource;
  /** Populated only when `source === 'server'` — the VERIFICATION
   * comparison against `regionTree.ts`'s own derivation for the same
   * regions. Empty when `source === 'derived'` (nothing to compare
   * against — there is no second source). */
  mismatches: RegionParentMismatch[];
  /** Populated only when `source === 'server'`. */
  dangling: DanglingParentWarning[];
}

function buildTreeFromParentPointers<T extends RegionLike>(
  regions: readonly T[],
  parentIdOf: (id: string) => string | undefined
): { tree: RegionTree<T>; dangling: DanglingParentWarning[] } {
  const nodeOf = new Map<string, RegionTreeNode<T>>();
  for (const r of regions) {
    nodeOf.set(r.id, { region: r, depth: 0, children: [] });
  }

  const dangling: DanglingParentWarning[] = [];
  const roots: RegionTreeNode<T>[] = [];
  for (const r of regions) {
    const node = nodeOf.get(r.id)!;
    const parentId = parentIdOf(r.id);
    if (parentId === undefined) {
      roots.push(node);
      continue;
    }
    const parentNode = nodeOf.get(parentId);
    if (!parentNode) {
      // A4/A2: the wire named a parent that isn't one of the declared
      // regions on this SAME response — treat as root (same graceful
      // fallback an absent parent_id gets) but keep the warning so the
      // caller can surface it, not swallow it.
      dangling.push({ regionId: r.id, danglingParentId: parentId });
      roots.push(node);
      continue;
    }
    parentNode.children.push(node);
  }

  // Same depth convention as regionTree.ts's own buildRegionTree: a
  // direct child of the implicit root is depth 1.
  function assignDepth(node: RegionTreeNode<T>, depth: number): void {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  }
  for (const root of roots) assignDepth(root, 1);

  return { tree: { roots, overlaps: [] }, dangling };
}

/** Walks a `RegionTree` into a flat `regionId -> parentId` map
 * (`undefined` = root) — used to compare `regionTree.ts`'s own derivation
 * against the wire's `parent_id`s one region at a time. */
function parentMapOf<T extends RegionLike>(
  tree: RegionTree<T>
): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  function walk(node: RegionTreeNode<T>, parentId: string | undefined): void {
    out.set(node.region.id, parentId);
    for (const child of node.children) walk(child, node.region.id);
  }
  for (const root of tree.roots) walk(root, undefined);
  return out;
}

/**
 * The consumption entry point `RegionPanel.tsx` calls: prefers the wire's
 * `FloorPlanRegion.parent_id` (`floorPlan.regions`) the moment a live
 * response carries a non-empty list, falling back to `regionTree.ts`'s own
 * `buildRegionTree(regions)` otherwise.
 *
 * `regions` is always the CALLER's own authored `doc.regions` (the
 * document being edited) — `floorPlan.regions`, when present, is that
 * SAME document's server-compiled projection, not an independent region
 * set. A region id present in `regions` but absent from
 * `floorPlan.regions` (or vice versa) is a distinct drift class this
 * function does not itself flag — out of scope for this pass, since a
 * matching id set is exactly what a same-document round-trip should
 * produce and no live server projects regions at all yet to observe
 * otherwise.
 */
export function resolveRegionTree<T extends RegionLike>(
  regions: readonly T[],
  floorPlan: FloorPlan | null
): ResolvedRegionTree<T> {
  if (!floorPlan || floorPlan.regions.length === 0) {
    return {
      tree: buildRegionTree(regions),
      source: 'derived',
      mismatches: [],
      dangling: [],
    };
  }

  const wireById = new Map(floorPlan.regions.map((r) => [r.id, r] as const));
  const { tree, dangling } = buildTreeFromParentPointers(
    regions,
    (id) => wireById.get(id)?.parentId
  );

  const derivedParentOf = parentMapOf(buildRegionTree(regions));
  const mismatches: RegionParentMismatch[] = [];
  for (const r of regions) {
    const wireRegion = wireById.get(r.id);
    if (!wireRegion) continue; // id-set drift — see this function's own doc comment.
    const wireParentId = wireRegion.parentId;
    const derivedParentId = derivedParentOf.get(r.id);
    if (wireParentId !== derivedParentId) {
      mismatches.push({ regionId: r.id, wireParentId, derivedParentId });
    }
  }

  return { tree, source: 'server', mismatches, dangling };
}
