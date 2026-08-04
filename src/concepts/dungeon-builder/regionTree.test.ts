import { describe, expect, it } from 'vitest';
import {
  buildRegionTree,
  flattenRegionTree,
  rootCellCount,
  type RegionLike,
} from './regionTree';

function region(
  id: string,
  cells: [number, number][],
  archetype = 'chamber'
): RegionLike {
  return { id, archetype, cells };
}

describe('buildRegionTree — flat forest (shipped dialect: no nesting authorable yet)', () => {
  it('puts every region at depth 1 with no children, any authoring order', () => {
    const regions = [
      region('north-alcove', [
        [0, 0],
        [1, 0],
      ]),
      region('east-annex', [
        [5, 5],
        [5, 6],
      ]),
      region('vault', [[10, 10]]),
    ];
    const tree = buildRegionTree(regions);
    expect(tree.overlaps).toEqual([]);
    expect(tree.roots).toHaveLength(3);
    for (const root of tree.roots) {
      expect(root.depth).toBe(1);
      expect(root.children).toEqual([]);
    }
    expect(tree.roots.map((r) => r.region.id).sort()).toEqual([
      'east-annex',
      'north-alcove',
      'vault',
    ]);
  });

  it('a single region alone is a single root, no overlaps', () => {
    const regions = [region('only', [[0, 0]])];
    const tree = buildRegionTree(regions);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].depth).toBe(1);
    expect(tree.overlaps).toEqual([]);
  });

  it('no regions at all is an empty forest', () => {
    const tree = buildRegionTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.overlaps).toEqual([]);
  });
});

describe('buildRegionTree — nested chain (hand-authored YAML; not paintable via the brush yet)', () => {
  it('crypt ⊃ vault ⊃ reliquary nests three deep, innermost as a leaf', () => {
    const crypt = region('crypt', [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    const vault = region('vault', [
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const reliquary = region('reliquary', [[0, 0]]);
    const tree = buildRegionTree([crypt, vault, reliquary]);

    expect(tree.overlaps).toEqual([]);
    expect(tree.roots).toHaveLength(1);
    const cryptNode = tree.roots[0];
    expect(cryptNode.region.id).toBe('crypt');
    expect(cryptNode.depth).toBe(1);
    expect(cryptNode.children).toHaveLength(1);

    const vaultNode = cryptNode.children[0];
    expect(vaultNode.region.id).toBe('vault');
    expect(vaultNode.depth).toBe(2);
    expect(vaultNode.children).toHaveLength(1);

    const reliquaryNode = vaultNode.children[0];
    expect(reliquaryNode.region.id).toBe('reliquary');
    expect(reliquaryNode.depth).toBe(3);
    expect(reliquaryNode.children).toEqual([]);
  });

  it('parent is the SMALLEST strict superset, not just any containing region', () => {
    // crypt is the big chamber; vault is the tight nested subset. A third
    // region, "wing", is a superset of crypt too (an even bigger outer
    // area) — vault's parent must resolve to crypt (the tighter fit), not
    // wing, even though wing also strictly contains vault transitively.
    const wing = region('wing', [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 0],
      [3, 1],
    ]);
    const crypt = region('crypt', [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    const vault = region('vault', [
      [0, 0],
      [1, 0],
    ]);
    const tree = buildRegionTree([wing, crypt, vault]);
    expect(tree.overlaps).toEqual([]);

    const wingNode = tree.roots.find((r) => r.region.id === 'wing')!;
    expect(wingNode.depth).toBe(1);
    expect(wingNode.children.map((c) => c.region.id)).toEqual(['crypt']);

    const cryptNode = wingNode.children[0];
    expect(cryptNode.depth).toBe(2);
    expect(cryptNode.children.map((c) => c.region.id)).toEqual(['vault']);

    const vaultNode = cryptNode.children[0];
    expect(vaultNode.depth).toBe(3);
  });
});

describe('buildRegionTree — multi-child (siblings under one parent)', () => {
  it('two disjoint inner regions both nest directly under the same outer one', () => {
    const hall = region('hall', [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    const innerLeft = region('inner-left', [[0, 0]]);
    const innerRight = region('inner-right', [[4, 0]]);
    const tree = buildRegionTree([hall, innerLeft, innerRight]);

    expect(tree.overlaps).toEqual([]);
    expect(tree.roots).toHaveLength(1);
    const hallNode = tree.roots[0];
    expect(hallNode.region.id).toBe('hall');
    expect(hallNode.children).toHaveLength(2);
    expect(hallNode.children.map((c) => c.region.id).sort()).toEqual([
      'inner-left',
      'inner-right',
    ]);
    for (const child of hallNode.children) {
      expect(child.depth).toBe(2);
      expect(child.children).toEqual([]);
    }
  });
});

describe('buildRegionTree — partial-overlap detection (Venn, forbidden by the settled model)', () => {
  it('flags two regions sharing cells with neither a strict subset of the other', () => {
    const a = region('room-a', [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const b = region('room-b', [
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    const tree = buildRegionTree([a, b]);

    // Neither region nests — both fall out as roots, since an invalid
    // Venn pair has no containment relationship to place one under the
    // other.
    expect(tree.roots).toHaveLength(2);
    expect(tree.overlaps).toHaveLength(1);
    const warning = tree.overlaps[0];
    expect([warning.regionAId, warning.regionBId].sort()).toEqual([
      'room-a',
      'room-b',
    ]);
    expect(warning.cellCount).toBe(2);
    expect(warning.cells).toEqual(
      expect.arrayContaining([
        [1, 0],
        [2, 0],
      ])
    );
  });

  it('flags two regions painted onto the exact same cells (no genuine containment either way)', () => {
    const a = region('dup-a', [
      [5, 5],
      [6, 5],
    ]);
    const b = region('dup-b', [
      [5, 5],
      [6, 5],
    ]);
    const tree = buildRegionTree([a, b]);
    expect(tree.overlaps).toHaveLength(1);
    expect(tree.overlaps[0].cellCount).toBe(2);
    // Neither is placed under the other — both surface as roots alongside
    // the warning, not silently nested.
    expect(tree.roots).toHaveLength(2);
  });

  it('caps the sample cells but reports the true count', () => {
    const big1: [number, number][] = [];
    const big2: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      big1.push([i, 0]);
      big2.push([i, 1]); // no overlap on this row
    }
    // Force a real 8-cell overlap with leftovers on both sides so it's a
    // genuine Venn case, not containment.
    const a = region('wide-a', [...big1, [0, 5], [1, 5]]);
    const b = region('wide-b', [...big1, [0, 6], [1, 6]]);
    const tree = buildRegionTree([a, b]);
    expect(tree.overlaps).toHaveLength(1);
    expect(tree.overlaps[0].cellCount).toBe(10);
    expect(tree.overlaps[0].cells.length).toBe(6); // OVERLAP_SAMPLE_CELLS cap
  });

  it('leaves disjoint regions with no warning and no containment relation', () => {
    const a = region('far-a', [[0, 0]]);
    const b = region('far-b', [[50, 50]]);
    const tree = buildRegionTree([a, b]);
    expect(tree.overlaps).toEqual([]);
    expect(tree.roots).toHaveLength(2);
  });
});

describe('flattenRegionTree', () => {
  it('is pre-order (parent immediately before its children)', () => {
    const crypt = region('crypt', [
      [0, 0],
      [1, 0],
    ]);
    const vault = region('vault', [[0, 0]]);
    const otherRoot = region('other', [[9, 9]]);
    const tree = buildRegionTree([otherRoot, crypt, vault]);
    const flat = flattenRegionTree(tree);
    const ids = flat.map((n) => n.region.id);
    const cryptIdx = ids.indexOf('crypt');
    const vaultIdx = ids.indexOf('vault');
    expect(cryptIdx).toBeGreaterThanOrEqual(0);
    expect(vaultIdx).toBe(cryptIdx + 1);
  });

  it('flattens a flat 3-region document into 3 depth-1 entries', () => {
    const regions = [
      region('a', [[0, 0]]),
      region('b', [[1, 0]]),
      region('c', [[2, 0]]),
    ];
    const tree = buildRegionTree(regions);
    const flat = flattenRegionTree(tree);
    expect(flat).toHaveLength(3);
    expect(flat.every((n) => n.depth === 1)).toBe(true);
  });
});

describe('rootCellCount', () => {
  it('is the full floor when no regions are authored', () => {
    const floor: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    expect(rootCellCount(floor, [])).toBe(4);
  });

  it('subtracts a single region’s cells from the floor', () => {
    const floor: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const regions = [
      region('r1', [
        [0, 0],
        [1, 0],
      ] as [number, number][]),
    ];
    expect(rootCellCount(floor, regions)).toBe(2);
  });

  it('unions overlapping/nested regions rather than double-subtracting shared cells', () => {
    const floor: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    // crypt ⊃ vault — vault's cells are a literal subset of crypt's own
    // declared cells (the representation decision), so the union of both
    // regions' cells is exactly crypt's cells, not crypt's + vault's
    // double-counted.
    const crypt = region('crypt', [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const vault = region('vault', [[0, 0]]);
    expect(rootCellCount(floor, [crypt, vault])).toBe(1); // just [3,0]
  });

  it('is zero when regions cover the entire floor', () => {
    const floor: [number, number][] = [
      [0, 0],
      [1, 0],
    ];
    const regions = [
      region('r1', [
        [0, 0],
        [1, 0],
      ] as [number, number][]),
    ];
    expect(rootCellCount(floor, regions)).toBe(0);
  });
});
