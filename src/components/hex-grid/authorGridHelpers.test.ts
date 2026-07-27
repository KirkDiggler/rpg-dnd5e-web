/**
 * Tests for authorGridHelpers — the `?authorGrid=1` overlay's pure
 * geometry. Real reference-tomb-shaped fixture (entrance width 6 ->
 * connector -> hall width 10, height 8, door at row 4 per
 * rpg-toolkit's generateDungeonLayout — same widths wallRuns.test.ts
 * verifies against), so the local [col,row] this module produces is
 * checked against the SAME real dungeon shape dungeon-content YAML
 * authors against, not an arbitrary toy rectangle.
 */

import {
  cubeAtColRow,
  type ConnectorDoorInput,
  type RegionInput,
} from '@/hooks/wallRuns';
import { describe, expect, it } from 'vitest';
import {
  authorGridRoom,
  authorGridRooms,
  doorRowsForRegion,
  facingDirection,
  HEX_FACING_LABELS,
  regionBounds,
} from './authorGridHelpers';
import { cubeToWorld, HEX_DIRECTIONS, HEX_SIZE } from './hexMath';

const HEIGHT = 8;
const DOOR_ROW = 4; // height / 2, per rpg-toolkit's generateDungeonLayout
const ENTRANCE_WIDTH = 6;
const HALL_WIDTH = 10;
const ENTRANCE_CONNECTOR_COL = ENTRANCE_WIDTH; // 6 — reserved, belongs to no region
const HALL_START_COL = ENTRANCE_CONNECTOR_COL + 1; // 7

function regionCubes(width: number, height: number, offsetX: number) {
  const hexes = [];
  for (let col = offsetX; col < offsetX + width; col++) {
    for (let row = 0; row < height; row++) {
      hexes.push(cubeAtColRow(col, row));
    }
  }
  return hexes;
}

const entrance: RegionInput = {
  id: 'entrance',
  hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, 0),
};
const hall: RegionInput = {
  id: 'hall',
  hexes: regionCubes(HALL_WIDTH, HEIGHT, HALL_START_COL),
};
const entranceHallDoor: ConnectorDoorInput = {
  id: 'reference-tomb-door-entrance-hall',
  position: cubeAtColRow(ENTRANCE_CONNECTOR_COL, DOOR_ROW),
};

describe('regionBounds', () => {
  it('computes col/row extremes from hex membership', () => {
    expect(regionBounds(entrance.hexes)).toEqual({
      minCol: 0,
      maxCol: ENTRANCE_WIDTH - 1,
      minRow: 0,
      maxRow: HEIGHT - 1,
    });
  });

  it('returns undefined for an empty hex list', () => {
    expect(regionBounds([])).toBeUndefined();
  });
});

describe('doorRowsForRegion', () => {
  it('marks the door row for the region left of the connector', () => {
    const bounds = regionBounds(entrance.hexes)!;
    // entrance's own maxCol (5) + 1 === the connector column (6) the door sits on.
    expect(doorRowsForRegion(bounds, [entranceHallDoor])).toEqual(
      new Set([DOOR_ROW])
    );
  });

  it('marks the door row for the region right of the connector', () => {
    const bounds = regionBounds(hall.hexes)!;
    // hall's own minCol (7) - 1 === the connector column (6) the door sits on.
    expect(doorRowsForRegion(bounds, [entranceHallDoor])).toEqual(
      new Set([DOOR_ROW])
    );
  });

  it('ignores a door that borders neither region', () => {
    const farDoor: ConnectorDoorInput = {
      position: cubeAtColRow(99, DOOR_ROW),
    };
    const bounds = regionBounds(entrance.hexes)!;
    expect(doorRowsForRegion(bounds, [farDoor])).toEqual(new Set());
  });
});

describe('authorGridRoom', () => {
  it("labels the region's own top-left corner hex [0,0]", () => {
    const room = authorGridRoom(entrance, [entranceHallDoor], HEX_SIZE);
    const corner = room!.labels.find(
      (l) => l.localCol === 0 && l.localRow === 0
    );
    expect(corner).toBeDefined();
    expect(corner!.world).toEqual(cubeToWorld(cubeAtColRow(0, 0), HEX_SIZE));
  });

  it('matches dungeonspec LocalHex{Col,Row} for an interior cell', () => {
    // A hex at world col/row (9, 3) inside hall (minCol=7, minRow=0) is
    // local [2, 3] — exactly the {at: [2, 3]} an author would write in
    // dungeon-content YAML to place something there.
    const room = authorGridRoom(hall, [entranceHallDoor], HEX_SIZE);
    const label = room!.labels.find(
      (l) => l.localCol === 2 && l.localRow === 3
    );
    expect(label).toBeDefined();
    expect(label!.world).toEqual(cubeToWorld(cubeAtColRow(9, 3), HEX_SIZE));
  });

  it('flags labels on the door row and only that row', () => {
    const room = authorGridRoom(entrance, [entranceHallDoor], HEX_SIZE);
    for (const label of room!.labels) {
      expect(label.isDoorRow).toBe(label.localRow === DOOR_ROW);
    }
  });

  it('returns undefined for a region with no hexes', () => {
    expect(
      authorGridRoom({ id: 'empty', hexes: [] }, [], HEX_SIZE)
    ).toBeUndefined();
  });
});

describe('authorGridRooms', () => {
  it('builds one room per non-empty region and skips empty ones', () => {
    const rooms = authorGridRooms(
      [entrance, hall, { id: 'unrevealed', hexes: [] }],
      [entranceHallDoor],
      HEX_SIZE
    );
    expect(rooms.map((r) => r.regionId)).toEqual(['entrance', 'hall']);
  });
});

describe('facingDirection', () => {
  it('numbers HEX_DIRECTIONS 0-5 in order, unmodified', () => {
    for (let i = 0; i < 6; i++) {
      expect(facingDirection(i)).toEqual(HEX_DIRECTIONS[i]);
    }
  });

  it('wraps both directions so a caller never needs to pre-clamp', () => {
    expect(facingDirection(6)).toEqual(facingDirection(0));
    expect(facingDirection(-1)).toEqual(facingDirection(5));
  });

  it('has a legend label for every direction', () => {
    expect(HEX_FACING_LABELS).toHaveLength(6);
  });
});
