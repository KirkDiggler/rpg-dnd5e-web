/**
 * The fixture's sightlines (rpg-dnd5e-web#605).
 *
 * Pinned explicitly because the authority tests depend on this geometry, and
 * "which hexes can you see from here" is not obvious by reading the map. If
 * the world changes, this fails first and says so plainly.
 */

import { describe, expect, it } from 'vitest';
import { visibleFrom } from './los';
import { at, DOOR_OPEN, key, twoRoomCrypt, VIEWER_START } from './world';

const seen = (world: ReturnType<typeof twoRoomCrypt>, from = VIEWER_START) =>
  visibleFrom(world, from);

describe('fixture line of sight', () => {
  it('a closed door shows the door but nothing beyond it', () => {
    const visible = seen(twoRoomCrypt());

    // All nine Room A hexes, plus the doorway itself.
    expect(visible.size).toBe(10);
    expect(visible.has(key(at(3, 1)))).toBe(true);
    expect(visible.has(key(at(4, 1)))).toBe(false);
  });

  it('an open door reveals a shaft into Room B, not Room B', () => {
    const world = twoRoomCrypt();
    world.doors.set(key(at(3, 1)), DOOR_OPEN);

    const visible = seen(world);
    const roomB = [...visible].filter(
      (k) => world.hexes.get(k)?.zoneId === 'room-b'
    );

    // Four of Room B's nine hexes — the ones the doorway lines up with.
    expect(roomB).toHaveLength(4);
    expect(visible.has(key(at(4, 1)))).toBe(true);
    expect(visible.has(key(at(4, 0)))).toBe(false);
    expect(visible.has(key(at(6, 2)))).toBe(false);
  });

  it('the doorway hex is visible from anywhere in Room A', () => {
    // Which is why closing the door, not walking away, is what takes Room B
    // out of sight in this fixture.
    const world = twoRoomCrypt();
    world.doors.set(key(at(3, 1)), DOOR_OPEN);

    for (const origin of [at(0, 0), at(0, 2), at(2, 1), at(1, 1)]) {
      expect(seen(world, origin).has(key(at(4, 1)))).toBe(true);
    }
  });
});
