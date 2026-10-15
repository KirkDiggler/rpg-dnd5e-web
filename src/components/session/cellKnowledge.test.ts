// @vitest-environment node
import { coordToKey } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import {
  brightestBorderState,
  cellKnowledge,
  EDGE_WEIGHTS,
  litWeight,
} from './cellKnowledge';
import {
  ATLAS_CELLS,
  BEHIND_JAMB,
  CORRIDOR,
  FRAMED,
  VISIBLE_AFTER_LEAVING,
  VISIBLE_AT_ARCHWAY,
} from './fogCellBlock.fixture';
import { positionToCube } from './positionBridge';

const key = (c: { x: number; y: number }) => coordToKey(positionToCube(c));

describe('cellKnowledge — the per-cell state map (fog of war, rpg-project#586)', () => {
  it('seen, remembered and absent for a three-cell line', () => {
    const k = cellKnowledge(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [{ x: 0, y: 0 }]
    );
    expect(k.state.get(key({ x: 0, y: 0 }))).toBe('seen');
    expect(k.state.get(key({ x: 1, y: 0 }))).toBe('remembered');
    // The third cell is not in the atlas: absent, so it has no entry at all.
    expect(k.state.has(key({ x: 2, y: 0 }))).toBe(false);
  });

  it('visible ⊂ atlas: a visible cell the atlas does not list is never drawn', () => {
    const k = cellKnowledge(
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 9, y: 9 },
      ]
    );
    expect(k.state.has(key({ x: 9, y: 9 }))).toBe(false);
    expect([...k.state.keys()]).toEqual([key({ x: 0, y: 0 })]);
  });

  it('remembered = known − visible on the castle cell block', () => {
    const k = cellKnowledge(ATLAS_CELLS, VISIBLE_AFTER_LEAVING);
    const remembered = [...k.state]
      .filter(([, s]) => s === 'remembered')
      .map(([kk]) => kk)
      .sort();
    expect(remembered).toEqual(FRAMED.map(key).sort());
    for (const c of CORRIDOR) expect(k.state.get(key(c))).toBe('seen');
  });

  it('absent cells are never drawn: the hexes behind the jamb have no state', () => {
    for (const visible of [VISIBLE_AT_ARCHWAY, VISIBLE_AFTER_LEAVING]) {
      const k = cellKnowledge(ATLAS_CELLS, visible);
      for (const c of BEHIND_JAMB) expect(k.state.has(key(c))).toBe(false);
      expect(k.state.size).toBe(ATLAS_CELLS.length);
    }
  });

  it('a view with no visible cells draws every atlas cell lit', () => {
    // proto3 cannot tell an absent field from an empty one: empty means the
    // server does not know, never "sees nothing", so the fallback is never grey.
    const k = cellKnowledge(ATLAS_CELLS, []);
    expect(k.state.size).toBe(ATLAS_CELLS.length);
    expect([...k.state.values()].every((s) => s === 'seen')).toBe(true);
    for (const c of ATLAS_CELLS) expect(litWeight(k, key(c))).toBe(1);
    expect(k.edge.size).toBe(0);
    // Absent cells stay absent.
    for (const c of BEHIND_JAMB) expect(k.state.has(key(c))).toBe(false);
  });
});

describe('the soft edge — at most two cells, never into absent', () => {
  const line = [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 }));

  it('weights at distance 1 and 2, and zero at 3', () => {
    const k = cellKnowledge(line, [{ x: 0, y: 0 }]);
    expect(k.edge.get(key({ x: 1, y: 0 }))).toBe(EDGE_WEIGHTS[0]);
    expect(k.edge.get(key({ x: 2, y: 0 }))).toBe(EDGE_WEIGHTS[1]);
    expect(k.edge.has(key({ x: 3, y: 0 }))).toBe(false);
    expect(litWeight(k, key({ x: 0, y: 0 }))).toBe(1);
    expect(litWeight(k, key({ x: 3, y: 0 }))).toBe(0);
    expect(EDGE_WEIGHTS).toHaveLength(2);
    expect(EDGE_WEIGHTS[0]).toBeGreaterThan(EDGE_WEIGHTS[1]);
    expect(EDGE_WEIGHTS[1]).toBeGreaterThan(0);
  });

  it('an absent neighbour receives no weight, and the gradient does not cross it', () => {
    // (1,0) is absent; (2,0) is two hexes from the seen cell but only through it.
    const k = cellKnowledge(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      [{ x: 0, y: 0 }]
    );
    expect(k.edge.has(key({ x: 1, y: 0 }))).toBe(false);
    expect(litWeight(k, key({ x: 1, y: 0 }))).toBeUndefined();
    expect(k.edge.has(key({ x: 2, y: 0 }))).toBe(false);
  });

  it('only remembered cells carry an edge weight', () => {
    const k = cellKnowledge(ATLAS_CELLS, VISIBLE_AFTER_LEAVING);
    for (const kk of k.edge.keys()) expect(k.state.get(kk)).toBe('remembered');
  });
});

describe('brightestBorderState', () => {
  const k = cellKnowledge(ATLAS_CELLS, VISIBLE_AFTER_LEAVING);
  it('is seen when any bordering cell is seen', () => {
    expect(
      brightestBorderState(k, [key({ x: 3, y: 0 }), key({ x: 4, y: 0 })])
    ).toBe('seen');
  });
  it('is remembered when the bordering cells are remembered or absent', () => {
    expect(
      brightestBorderState(k, [key({ x: 4, y: 0 }), key(BEHIND_JAMB[0]!)])
    ).toBe('remembered');
  });
});
