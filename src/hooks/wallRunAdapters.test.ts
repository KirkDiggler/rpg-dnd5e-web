/**
 * Tests for wallRunAdapters — the wire-shape <-> wallRuns.ts seam and the
 * W2 "positive category rule" (design.md).
 */

import { create } from '@bufbuild/protobuf';
import {
  HexSchema,
  PositionSchema,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  connectorDoorInputsFromWalls,
  connectorRunDoorRotations,
  legacyRenderWalls,
  regionInputsFromHexes,
} from './wallRunAdapters';
import type { ConnectorRun, RegionInput } from './wallRuns';

function hex(x: number, y: number, z: number, zoneId = '') {
  return create(HexSchema, {
    position: create(PositionSchema, { x, y, z }),
    zoneId,
  });
}

function wall(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX = fromX,
  toY = fromY,
  toZ = fromZ,
  kind: WallKind = WallKind.SOLID,
  id?: string
) {
  return create(WallSchema, {
    from: create(PositionSchema, { x: fromX, y: fromY, z: fromZ }),
    to: create(PositionSchema, { x: toX, y: toY, z: toZ }),
    kind,
    id,
  });
}

describe('regionInputsFromHexes', () => {
  it('groups hexes by zoneId', () => {
    const hexes = [
      hex(0, 0, 0, 'entrance'),
      hex(1, -1, 0, 'entrance'),
      hex(10, -10, 0, 'hall'),
    ];
    const regions = regionInputsFromHexes(hexes);
    expect(regions).toHaveLength(2);
    const entrance = regions.find((r) => r.id === 'entrance')!;
    expect(entrance.hexes).toHaveLength(2);
    const hall = regions.find((r) => r.id === 'hall')!;
    expect(hall.hexes).toHaveLength(1);
  });

  it('excludes hexes with no zoneId (unassigned/connector cells)', () => {
    const hexes = [hex(0, 0, 0, ''), hex(1, -1, 0, 'entrance')];
    const regions = regionInputsFromHexes(hexes);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.id).toBe('entrance');
  });

  it('excludes hexes with no position', () => {
    const positionless = create(HexSchema, { zoneId: 'entrance' });
    const regions = regionInputsFromHexes([positionless]);
    expect(regions).toHaveLength(0);
  });
});

describe('connectorDoorInputsFromWalls', () => {
  it('extracts only DOOR_* walls, keyed by their own (from) cell and id', () => {
    const walls = [
      wall(1, -1, 0, 2, -2, 0, WallKind.SOLID),
      wall(5, -5, 0, 6, -6, 0, WallKind.DOOR_CLOSED, 'door-1'),
      wall(9, -9, 0, 10, -10, 0, WallKind.DOOR_LOCKED, 'door-2'),
    ];
    const doors = connectorDoorInputsFromWalls(walls);
    expect(doors).toHaveLength(2);
    expect(doors[0]).toEqual({ id: 'door-1', position: { x: 5, y: -5, z: 0 } });
    expect(doors[1]).toEqual({ id: 'door-2', position: { x: 9, y: -9, z: 0 } });
  });

  it('skips a door wall with no from position', () => {
    const noFrom = create(WallSchema, { kind: WallKind.DOOR_OPEN });
    expect(connectorDoorInputsFromWalls([noFrom])).toEqual([]);
  });
});

describe('legacyRenderWalls (positive category rule)', () => {
  const regions: RegionInput[] = [
    { id: 'hall', hexes: [{ x: 10, y: -10, z: 0 }] },
  ];

  it('keeps door walls unconditionally', () => {
    const door = wall(1, -1, 0, 2, -2, 0, WallKind.DOOR_CLOSED, 'd1');
    expect(legacyRenderWalls([door], [])).toEqual([door]);
  });

  it('keeps a degenerate non-door wall INSIDE a region hex set (interior pattern wall)', () => {
    const interior = wall(10, -10, 0); // matches the hall region hex above
    expect(legacyRenderWalls([interior], regions)).toEqual([interior]);
  });

  it('drops a degenerate non-door wall OUTSIDE any region (connector-flanking cell, either wire shape)', () => {
    const flanking = wall(50, -50, 0); // not in any region's hex set
    expect(legacyRenderWalls([flanking], regions)).toEqual([]);
  });

  it('drops a boundary-edge (from !== to) non-door wall — replaced by envelope runs', () => {
    const boundaryEdge = wall(10, -10, 0, 11, -11, 0); // hexDistance 1, matches #834 shape
    expect(legacyRenderWalls([boundaryEdge], regions)).toEqual([]);
  });

  it('drops a malformed wall missing from/to', () => {
    const malformed = create(WallSchema, { kind: WallKind.SOLID });
    expect(legacyRenderWalls([malformed], regions)).toEqual([]);
  });
});

describe('connectorRunDoorRotations', () => {
  it('derives a rotation from the connector run direction, matching hexEdgeBetween atan2(-dz, dx) convention', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
      },
    ];
    const rotations = connectorRunDoorRotations(runs);
    expect(rotations.get('door-1')).toBeCloseTo(Math.atan2(-0, 1));
  });

  it('skips a connector run with no doorId', () => {
    const runs: ConnectorRun[] = [
      {
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
      },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });

  it('skips a connector run with zero segments', () => {
    const runs: ConnectorRun[] = [
      { doorId: 'door-1', regionAId: 'a', regionBId: 'b', segments: [] },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });

  it('skips a degenerate zero-length segment (start === end)', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 3, z: 3 }, end: { x: 3, z: 3 } }],
      },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });
});
