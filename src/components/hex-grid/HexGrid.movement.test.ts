import { doorHexKinds } from '@/hooks/dungeonMapGeometry';
import { create } from '@bufbuild/protobuf';
import {
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { isHexBlocked } from './HexGrid';
import { findPath } from './hexMath';

const start = { x: 0, y: 0, z: 0 };
const door = { x: 1, y: -1, z: 0 };
const destination = { x: 2, y: -2, z: 0 };

function pathForDoor(kind: WallKind) {
  const walls = [
    create(WallSchema, { from: door, to: destination, kind, id: 'boss-door' }),
  ];
  const floorTiles = new Set(['0,0,0', '1,-1,0', '2,-2,0']);
  const doorKinds = doorHexKinds(walls);
  return findPath(start, destination, (coord) =>
    isHexBlocked(coord, floorTiles, [], undefined, doorKinds)
  );
}

describe('HexGrid door movement boundary', () => {
  it.each([WallKind.DOOR_CLOSED, WallKind.DOOR_LOCKED])(
    '%s blocks A* traversal through the door hex',
    (kind) => {
      expect(pathForDoor(kind)).toEqual([]);
    }
  );

  it('allows A* traversal through an open door hex outside revealed floor tiles', () => {
    expect(pathForDoor(WallKind.DOOR_OPEN)).toEqual([start, door, destination]);
  });
});
