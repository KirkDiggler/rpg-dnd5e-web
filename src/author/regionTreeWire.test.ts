import { create } from '@bufbuild/protobuf';
import {
  FloorPlanSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import {
  buildRegionTree,
  flattenRegionTree,
  type RegionLike,
} from './regionTree';
import { resolveRegionTree } from './regionTreeWire';

function region(
  id: string,
  cells: [number, number][],
  archetype = 'chamber'
): RegionLike {
  return { id, archetype, cells };
}

function floorPlanWithRegions(
  regions: { id: string; parentId?: string }[]
): FloorPlan {
  return create(FloorPlanSchema, {
    rooms: [],
    connectors: [],
    height: 0,
    doorRow: 0,
    floorCells: [],
    regions: regions.map((r) => ({
      id: r.id,
      cells: [],
      parentId: r.parentId,
    })),
  });
}

// v0.3 wire consumption unit (2026-08-05) — resolveRegionTree prefers a
// live FloorPlan.regions (FloorPlanRegion.parent_id, rpg-api-protos
// v0.1.120) over regionTree.ts's own client-derived containment. No live
// server carries this field yet (rpg-api-protos#214 conformance review's
// finding A4 — regions is spec.md §1 group (d), Wave 1, not started
// server-side): every FloorPlan fixture below is hand-constructed to
// exercise the shape the wire will carry once it ships, not a real
// recorded response. Marked SYNTHETIC per this concept's existing
// fixtures.ts convention.
describe('resolveRegionTree — v0.3 wire consumption (SYNTHETIC fixtures, no live server carries these fields yet)', () => {
  it('null floorPlan falls back to regionTree.ts derivation, labeled "derived"', () => {
    const regions = [region('a', [[0, 0]]), region('b', [[5, 5]])];
    const result = resolveRegionTree(regions, null);
    expect(result.source).toBe('derived');
    expect(result.mismatches).toEqual([]);
    expect(result.dangling).toEqual([]);
    expect(result.tree).toEqual(buildRegionTree(regions));
  });

  it('a live response with EMPTY regions falls back to derived — rollout gap (A4), not "declares none"', () => {
    const regions = [region('a', [[0, 0]])];
    const result = resolveRegionTree(regions, floorPlanWithRegions([]));
    expect(result.source).toBe('derived');
  });

  it('a live response with non-empty regions renders the tree from parent_id, agreeing case has no mismatches', () => {
    // Two regions whose cell sets ALSO nest (a strict subset), so the
    // wire's parent_id and regionTree.ts's own cell-subset inference
    // agree — the "everything lines up" baseline case.
    const outer = region('shrine', [
      [9, 2],
      [9, 3],
      [9, 4],
      [10, 2],
      [10, 3],
      [10, 4],
    ]);
    const inner = region('shrine-altar', [
      [9, 3],
      [9, 4],
    ]);
    const regions = [outer, inner];
    const floorPlan = floorPlanWithRegions([
      { id: 'shrine' }, // absent parentId = root
      { id: 'shrine-altar', parentId: 'shrine' },
    ]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.source).toBe('server');
    expect(result.mismatches).toEqual([]);
    expect(result.dangling).toEqual([]);
    const rows = flattenRegionTree(result.tree);
    expect(rows.map((r) => ({ id: r.region.id, depth: r.depth }))).toEqual([
      { id: 'shrine', depth: 1 },
      { id: 'shrine-altar', depth: 2 },
    ]);
  });

  it('an absent parent_id on the wire means root, matching an un-nested derived sibling', () => {
    const regions = [region('a', [[0, 0]]), region('b', [[5, 5]])];
    const floorPlan = floorPlanWithRegions([{ id: 'a' }, { id: 'b' }]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.source).toBe('server');
    expect(result.tree.roots).toHaveLength(2);
    expect(result.mismatches).toEqual([]);
  });

  it('flags a mismatch when the wire parent disagrees with the cell-subset derivation', () => {
    // Two SIBLING (disjoint) cell sets — regionTree.ts's own derivation
    // puts both at root. A wire response that (incorrectly, for this
    // test) claims "b" is a child of "a" is exactly the drift class A2/A3
    // name: the proto's derivation rule isn't parser-enforced, so an
    // implementer — or a stale fixture — can produce a parent_id that
    // disagrees with the cell sets.
    const a = region('a', [
      [0, 0],
      [0, 1],
    ]);
    const b = region('b', [
      [5, 5],
      [5, 6],
    ]);
    const regions = [a, b];
    const floorPlan = floorPlanWithRegions([
      { id: 'a' },
      { id: 'b', parentId: 'a' },
    ]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.source).toBe('server');
    expect(result.mismatches).toEqual([
      { regionId: 'b', wireParentId: 'a', derivedParentId: undefined },
    ]);
    // The tree still renders from the WIRE (parent_id authoritative) —
    // "b" nests under "a" in the rendered tree despite the derived
    // disagreement; the mismatch is a surfaced warning, not a silent
    // override of the wire.
    const rows = flattenRegionTree(result.tree);
    expect(rows.map((r) => r.region.id)).toEqual(['a', 'b']);
    expect(rows.find((r) => r.region.id === 'b')!.depth).toBe(2);
  });

  it('flags a mismatch the other direction too — derived says nested, wire says root', () => {
    const outer = region('shrine', [
      [9, 2],
      [9, 3],
    ]);
    const inner = region('shrine-altar', [[9, 3]]); // a real subset of outer
    const regions = [outer, inner];
    // Wire (incorrectly) claims shrine-altar has no parent.
    const floorPlan = floorPlanWithRegions([
      { id: 'shrine' },
      { id: 'shrine-altar' },
    ]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.mismatches).toEqual([
      {
        regionId: 'shrine-altar',
        wireParentId: undefined,
        derivedParentId: 'shrine',
      },
    ]);
  });

  it('a dangling parent_id (points to a region not on this response) is treated as root AND warned', () => {
    const regions = [region('a', [[0, 0]])];
    const floorPlan = floorPlanWithRegions([
      { id: 'a', parentId: 'ghost-region' },
    ]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.source).toBe('server');
    expect(result.dangling).toEqual([
      { regionId: 'a', danglingParentId: 'ghost-region' },
    ]);
    // Treated as root for tree-building purposes — no crash, no orphaned
    // subtree, just a plain root row plus the warning.
    expect(result.tree.roots).toHaveLength(1);
    expect(result.tree.roots[0].region.id).toBe('a');
    expect(result.tree.roots[0].depth).toBe(1);
  });

  it('a region present locally but absent from the wire response is skipped for mismatch-checking (not a false mismatch)', () => {
    const regions = [region('a', [[0, 0]]), region('local-only', [[9, 9]])];
    const floorPlan = floorPlanWithRegions([{ id: 'a' }]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.mismatches).toEqual([]);
  });

  it('handles a 3-deep nesting chain from the wire, matching flattenRegionTree depth semantics', () => {
    const regions = [
      region('outer', [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ]),
      region('mid', [
        [0, 1],
        [0, 2],
      ]),
      region('inner', [[0, 1]]),
    ];
    const floorPlan = floorPlanWithRegions([
      { id: 'outer' },
      { id: 'mid', parentId: 'outer' },
      { id: 'inner', parentId: 'mid' },
    ]);
    const result = resolveRegionTree(regions, floorPlan);
    expect(result.mismatches).toEqual([]);
    const rows = flattenRegionTree(result.tree);
    expect(rows.map((r) => ({ id: r.region.id, depth: r.depth }))).toEqual([
      { id: 'outer', depth: 1 },
      { id: 'mid', depth: 2 },
      { id: 'inner', depth: 3 },
    ]);
  });
});
