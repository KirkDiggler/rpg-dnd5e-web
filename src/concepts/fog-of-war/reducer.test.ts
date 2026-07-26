/**
 * Fog of War reducer contract (rpg-dnd5e-web#605).
 *
 * These cases map one-to-one onto the required-behavior table in
 * rpg-project/ideas/fog-of-war/design.md. Every input here is a literal
 * event: the reducer has no other input, and a test file that can drive it
 * completely is the proof of that.
 */

import { describe, expect, it } from 'vitest';
import type {
  FogEntity,
  HexKnowledgeChanged,
  HexRecord,
  Placement,
} from './events';
import { emptyKnowledge, fogReducer } from './reducer';

const at = (q: number, r: number) => ({ x: q, y: r, z: -q - r });

const goblin: FogEntity = {
  entityId: 'goblin-1',
  name: 'Goblin',
  type: 'monster',
};

/** A VISIBLE record. `contents` defaults to [] — which is a positive claim
 * that the hex is empty, not an omission. */
const visible = (
  q: number,
  r: number,
  contents: Placement[] = []
): HexRecord => ({
  position: at(q, r),
  state: 'VISIBLE',
  terrain: 0,
  zoneId: '',
  edges: [],
  contents,
});

const remembered = (record: HexRecord): HexRecord => ({
  ...record,
  state: 'REMEMBERED',
});

const facingNorth: Placement = { entityId: 'goblin-1', facing: 0 };

describe('fog reducer', () => {
  it('first sight adds a visible hex', () => {
    const next = fogReducer(emptyKnowledge(), {
      hexes: [visible(0, 0)],
      entities: [],
    });

    expect(next.hexes.get('0,0,0')?.state).toBe('VISIBLE');
  });

  it('a remembered record carries its own frozen observation', () => {
    const seen = fogReducer(emptyKnowledge(), {
      hexes: [visible(0, 0, [facingNorth])],
      entities: [goblin],
    });

    const lost = fogReducer(seen, {
      hexes: [remembered(visible(0, 0, [facingNorth]))],
      entities: [],
    });

    // The server sends what the viewer observed; the client never freezes.
    expect(lost.hexes.get('0,0,0')?.state).toBe('REMEMBERED');
    expect(lost.hexes.get('0,0,0')?.contents).toEqual([facingNorth]);
    expect(lost.entities.get('goblin-1')).toBeDefined();
  });

  it('re-sight replaces memory wholesale, deleting a remembered occupant', () => {
    // design.md case 8 — the load-bearing one. Nothing "forgets" the goblin;
    // it is gone because the arriving record states the hex is empty.
    const believesGoblinIsThere = fogReducer(emptyKnowledge(), {
      hexes: [remembered(visible(0, 0, [facingNorth]))],
      entities: [goblin],
    });

    const walksUp = fogReducer(believesGoblinIsThere, {
      hexes: [visible(0, 0)],
      entities: [],
    });

    expect(walksUp.hexes.get('0,0,0')?.state).toBe('VISIBLE');
    expect(walksUp.hexes.get('0,0,0')?.contents).toEqual([]);
  });

  it('a hidden mutation changes nothing', () => {
    const before = fogReducer(emptyKnowledge(), {
      hexes: [remembered(visible(1, 0))],
      entities: [],
    });

    // The world changed where the viewer cannot see, so no record arrives.
    const after = fogReducer(before, { hexes: [], entities: [] });

    expect(after.hexes.get('1,0,-1')).toEqual(before.hexes.get('1,0,-1'));
  });

  it('freezes the facing that was observed, not one seen later', () => {
    // This viewer saw the goblin facing 0 and lost sight. The goblin later
    // turned and another viewer saw that. Facing rides on the placement, so
    // no other viewer's sighting can reach into this viewer's memory.
    const memory = fogReducer(emptyKnowledge(), {
      hexes: [remembered(visible(0, 0, [facingNorth]))],
      entities: [goblin],
    });

    // The goblin is re-disclosed, but no record arrives for the remembered
    // hex — nothing about that memory may move.
    const later = fogReducer(memory, { hexes: [], entities: [goblin] });

    expect(later.hexes.get('0,0,0')?.contents).toEqual([facingNorth]);
  });

  it('applying the same record twice is idempotent', () => {
    const event: HexKnowledgeChanged = {
      hexes: [visible(0, 0, [facingNorth])],
      entities: [goblin],
    };

    const once = fogReducer(emptyKnowledge(), event);
    const twice = fogReducer(once, event);

    expect(twice).toEqual(once);
  });

  it('drops a placement whose entity was never disclosed', () => {
    // Fail closed: the viewer cannot be shown something they were not told
    // about. A failed perception check looks exactly like this.
    const next = fogReducer(emptyKnowledge(), {
      hexes: [visible(0, 0, [{ entityId: 'undisclosed-trap', facing: 0 }])],
      entities: [],
    });

    expect(next.hexes.get('0,0,0')?.contents).toEqual([]);
  });

  it('is a pure function of the events applied', () => {
    const session: HexKnowledgeChanged[] = [
      {
        hexes: [visible(0, 0, [{ entityId: 'goblin-1', facing: 2 }])],
        entities: [goblin],
      },
      {
        hexes: [
          remembered(visible(0, 0, [{ entityId: 'goblin-1', facing: 2 }])),
        ],
        entities: [],
      },
      { hexes: [visible(0, 0)], entities: [] },
    ];

    const replay = session.reduce(fogReducer, emptyKnowledge());
    const again = session.reduce(fogReducer, emptyKnowledge());

    expect(replay).toEqual(again);
  });
});
