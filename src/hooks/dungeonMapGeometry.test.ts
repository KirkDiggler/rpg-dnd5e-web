/**
 * Tests for dungeonMapGeometry's pure floor/wall/door geometry helpers.
 */

import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { DoorInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  PositionSchema as EncounterPositionSchema,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { openDoorWalkableKeys, wallKey } from './dungeonMapGeometry';

/** Helper to create a DoorInfo proto */
function createDoor(
  connectionId: string,
  x: number,
  y: number,
  z: number,
  isOpen = false
) {
  return create(DoorInfoSchema, {
    connectionId,
    position: create(PositionSchema, { x, y, z }),
    isOpen,
  });
}

describe('wallKey', () => {
  it('produces same key regardless of direction', () => {
    const wallAB = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
      to: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
    });
    const wallBA = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
      to: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
    });

    expect(wallKey(wallAB)).toBe(wallKey(wallBA));
  });

  it('produces different keys for different walls', () => {
    const wall1 = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
      to: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
    });
    const wall2 = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 1, y: -1, z: 0 }),
      to: create(EncounterPositionSchema, { x: 4, y: -4, z: 0 }),
    });

    expect(wallKey(wall1)).not.toBe(wallKey(wall2));
  });
});

describe('openDoorWalkableKeys', () => {
  it('returns only OPEN doors as walkable cube keys', () => {
    const closed = createDoor('conn-closed', 5, -5, 0, false);
    const open = createDoor('conn-open', 0, -17, 17, true);

    const keys = openDoorWalkableKeys([closed, open]);

    expect(keys.size).toBe(1);
    expect(keys.has('0,-17,17')).toBe(true);
    expect(keys.has('5,-5,0')).toBe(false);
  });

  it('returns empty set when no doors', () => {
    expect(openDoorWalkableKeys([]).size).toBe(0);
  });

  it('skips doors with no position', () => {
    const noPos = create(DoorInfoSchema, {
      connectionId: 'no-pos',
      isOpen: true,
    });
    const keys = openDoorWalkableKeys([noPos]);
    expect(keys.size).toBe(0);
  });

  it('bridges two separate floor-tile sets when a connecting door is open', () => {
    // Two rooms separated by a door tile that is in NEITHER room's floor
    // set. Room A tiles: {(0,0,0), (1,-1,0)}. Room B tiles: {(3,-3,0),
    // (4,-4,0)}. Door at (2,-2,0) bridges them. Without
    // openDoorWalkableKeys, the door tile is a "wall" to A* and pathing
    // fails.
    const roomAFloor = new Set(['0,0,0', '1,-1,0']);
    const roomBFloor = new Set(['3,-3,0', '4,-4,0']);
    const door = createDoor('conn-AB', 2, -2, 0, true);

    const walkable = openDoorWalkableKeys([door]);
    expect(walkable.has('2,-2,0')).toBe(true);

    // Combined walkable set is what HexGrid's isBlocked treats as passable.
    const combined = new Set<string>([
      ...roomAFloor,
      ...roomBFloor,
      ...walkable,
    ]);
    expect(combined.has('0,0,0')).toBe(true); // room A start
    expect(combined.has('1,-1,0')).toBe(true); // room A
    expect(combined.has('2,-2,0')).toBe(true); // open door
    expect(combined.has('3,-3,0')).toBe(true); // room B
    expect(combined.has('4,-4,0')).toBe(true); // room B end
  });
});
