/**
 * Fixture geometry (rpg-dnd5e-web#605).
 *
 * These are rendering-correctness tests written as data assertions, so a
 * broken scene is caught by `npm test` instead of by someone squinting at a
 * screenshot.
 *
 * The wall renderer draws a room's envelope from its column/row bounding box
 * (`wallRuns.envelopeRunsForRegion`). A region that is not a solid rectangle
 * in that space gets walls that do not fit its floor — which is exactly the
 * bug this fixture shipped with first time round.
 */

import { cubeAtColRow, hexColumn, hexRow } from '@/hooks/wallRuns';
import { describe, expect, it } from 'vitest';
import { at, key, twoRoomCrypt } from './world';

describe('fixture geometry', () => {
  it('uses the same column/row convention as the renderer', () => {
    // The authority keeps its own copy of the toolkit's offset formula, the
    // way the server would. This pins the two from drifting apart.
    for (let col = -2; col <= 6; col++) {
      for (let row = -2; row <= 4; row++) {
        expect(at(col, row)).toEqual(cubeAtColRow(col, row));
      }
    }
  });

  it('every room is a solid rectangle in column/row space', () => {
    const world = twoRoomCrypt();
    const byZone = new Map<string, { x: number; y: number; z: number }[]>();
    for (const hex of world.hexes.values()) {
      if (!hex.zoneId) continue; // the doorway belongs to no room, by design
      const list = byZone.get(hex.zoneId) ?? [];
      list.push(hex.position);
      byZone.set(hex.zoneId, list);
    }

    expect([...byZone.keys()].sort()).toEqual(['room-a', 'room-b']);

    for (const [zoneId, hexes] of byZone) {
      const cols = hexes.map(hexColumn);
      const rows = hexes.map(hexRow);
      const width = Math.max(...cols) - Math.min(...cols) + 1;
      const height = Math.max(...rows) - Math.min(...rows) + 1;

      // A solid rectangle has exactly width * height cells and no duplicates.
      expect(hexes.length, `${zoneId} fills its bounding box`).toBe(
        width * height
      );
      expect(new Set(hexes.map(key)).size).toBe(hexes.length);
    }
  });

  it('the doorway bridges the two rooms and belongs to neither', () => {
    const world = twoRoomCrypt();
    const doorway = world.hexes.get(key(at(3, 1)));

    expect(doorway?.zoneId).toBe('');
    // Adjacent to a Room A cell on one side and a Room B cell on the other.
    const neighbours = [at(2, 1), at(4, 2)].map((hex) =>
      world.hexes.get(key(hex))
    );
    expect(neighbours.map((hex) => hex?.zoneId)).toEqual(['room-a', 'room-b']);
  });
});
