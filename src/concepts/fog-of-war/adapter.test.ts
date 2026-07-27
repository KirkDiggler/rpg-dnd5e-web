/**
 * Fog of War adapter (rpg-dnd5e-web#605).
 *
 * The renderer boundary: knowledge in, exact HexGrid props out. Unseen is
 * omission, so the interesting assertions are as much about what is absent as
 * what is present.
 */

import { describe, expect, it } from 'vitest';
import { toHexGridProps } from './adapter';
import type { HexRecord, Placement, WallLike } from './events';
import { emptyKnowledge, fogReducer } from './reducer';

const at = (q: number, r: number) => ({ x: q, y: r, z: -q - r });

const skeleton = {
  entityId: 'skeleton-1',
  name: 'Skeleton',
  type: 'monster' as const,
};

const record = (
  q: number,
  r: number,
  state: HexRecord['state'],
  contents: Placement[] = [],
  edges: WallLike[] = []
): HexRecord => ({
  position: at(q, r),
  state,
  terrain: 0,
  zoneId: 'room-1',
  edges,
  contents,
});

const solidEdge = (
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }
): WallLike => ({ from, to, kind: 1 });

describe('fog adapter', () => {
  it('omits everything the viewer has no record for', () => {
    const knowledge = fogReducer(emptyKnowledge(), {
      hexes: [record(0, 0, 'VISIBLE')],
      entities: [],
    });

    const props = toHexGridProps(knowledge);

    expect([...props.floorTiles.keys()]).toEqual(['0,0,0']);
    expect(props.walls).toEqual([]);
    expect(props.entities).toEqual([]);
  });

  it('marks a remembered hex in both remembered key sets', () => {
    const knowledge = fogReducer(emptyKnowledge(), {
      hexes: [record(0, 0, 'REMEMBERED', [], [solidEdge(at(0, 0), at(1, 0))])],
      entities: [],
    });

    const props = toHexGridProps(knowledge);

    expect(props.rememberedFloorHexKeys.has('0,0,0')).toBe(true);
    expect(props.rememberedWallHexKeys.has('0,0,0')).toBe(true);
  });

  it('carries knowledgeState onto occupants', () => {
    const knowledge = fogReducer(emptyKnowledge(), {
      hexes: [
        record(0, 0, 'REMEMBERED', [{ entityId: 'skeleton-1', facing: 0 }]),
        record(1, 0, 'VISIBLE', [{ entityId: 'skeleton-1', facing: 3 }]),
      ],
      entities: [skeleton],
    });

    const props = toHexGridProps(knowledge);
    const byKey = Object.fromEntries(
      props.entities.map((e) => [`${e.position.x},${e.position.y}`, e])
    );

    expect(byKey['0,0']?.knowledgeState).toBe('remembered');
    expect(byKey['1,0']?.knowledgeState).toBe('visible');
  });

  it('a visible hex with empty contents emits no entity', () => {
    // The remembered skeleton is gone from the scene because the record that
    // replaced it stated the hex was empty — design.md case 8, seen from the
    // renderer's side.
    const remembered = fogReducer(emptyKnowledge(), {
      hexes: [
        record(0, 0, 'REMEMBERED', [{ entityId: 'skeleton-1', facing: 0 }]),
      ],
      entities: [skeleton],
    });
    expect(toHexGridProps(remembered).entities).toHaveLength(1);

    const resighted = fogReducer(remembered, {
      hexes: [record(0, 0, 'VISIBLE')],
      entities: [],
    });

    expect(toHexGridProps(resighted).entities).toEqual([]);
  });

  it('marks a remembered wall by the edge it belongs to, not the record', () => {
    // The renderer looks wall memory up by `wall.from`. Keying by the record's
    // own position happens to agree for every edge the authority emits, but an
    // edge authored against a neighbour would then read as visible and stay
    // clickable.
    const knowledge = fogReducer(emptyKnowledge(), {
      hexes: [record(0, 0, 'REMEMBERED', [], [solidEdge(at(1, 0), at(2, 0))])],
      entities: [],
    });

    const props = toHexGridProps(knowledge);

    expect(props.rememberedWallHexKeys.has('1,0,-1')).toBe(true);
    expect(props.rememberedWallHexKeys.has('0,0,0')).toBe(false);
  });

  it('deduplicates a wall carried by both hexes it separates', () => {
    // Records are self-contained, so the shared edge arrives twice. Neither
    // record knows about the other; the adapter collapses them.
    const knowledge = fogReducer(emptyKnowledge(), {
      hexes: [
        record(0, 0, 'VISIBLE', [], [solidEdge(at(0, 0), at(1, 0))]),
        record(1, 0, 'VISIBLE', [], [solidEdge(at(0, 0), at(1, 0))]),
      ],
      entities: [],
    });

    expect(toHexGridProps(knowledge).walls).toHaveLength(1);
  });
});
