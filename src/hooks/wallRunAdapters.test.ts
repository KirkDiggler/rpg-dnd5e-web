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
    expect(legacyRenderWalls([door], [], [], [])).toEqual([door]);
  });

  it('keeps a degenerate non-door wall INSIDE a region hex set (interior pattern wall)', () => {
    const interior = wall(10, -10, 0); // matches the hall region hex above
    expect(legacyRenderWalls([interior], regions, [], [])).toEqual([interior]);
  });

  it('drops a degenerate non-door wall OUTSIDE any region with no matching door column (true outer perimeter, not a connector)', () => {
    const outerPerimeter = wall(50, -50, 0); // no door anywhere near column 50
    expect(legacyRenderWalls([outerPerimeter], regions, [], [])).toEqual([]);
  });

  // Gate review finding 1 (rpg-dnd5e-web#603): region hex membership is
  // per-viewer reveal-gated, so a connector-flanking wall entry can be on
  // the wire well before computeWallRuns has enough data to emit a run
  // covering it — AND, live-verified against the running reference-tomb
  // dungeon, the production wire emits these in BOUNDARY-EDGE shape, not
  // degenerate, so the safety net must catch both shapes identically via
  // the "candidate cell" (degenerate: the cell itself; boundary-edge:
  // `to`) rather than only the degenerate case.

  it('keeps a degenerate connector-flanking wall NOT covered by any connector run, when its column matches a known door (structural safety net)', () => {
    const flanking = wall(50, -50, 0); // col 50
    const doors = [{ id: 'door-1', position: { x: 50, y: -50, z: 3 } }]; // same column, different row
    expect(legacyRenderWalls([flanking], regions, [], doors)).toEqual([
      flanking,
    ]);
  });

  it('keeps a BOUNDARY-EDGE connector-flanking wall NOT covered by any connector run, matching its `to` cell’s column against a known door (the real production wire shape)', () => {
    // from=real hall floor (col 9), to=the flanking cell itself (col 10,
    // matching the door's own column) — exactly rpg-toolkit's
    // connectorBoundaryEdgeWalls shape, verified live against the
    // running reference-tomb dungeon.
    const boundaryEdgeFlanking = wall(9, -9, 0, 10, -10, 0);
    const doors = [{ id: 'door-1', position: { x: 10, y: -10, z: 3 } }];
    expect(
      legacyRenderWalls([boundaryEdgeFlanking], regions, [], doors)
    ).toEqual([boundaryEdgeFlanking]);
  });

  it('drops a degenerate connector-flanking wall that IS covered by an emitted connector run', () => {
    // x=0,y=0,z=0 -> col=0, row=0 (a simple, easy-to-reason-about cell).
    const flanking = wall(0, 0, 0);
    const doors = [{ id: 'door-1', position: { x: 0, y: 0, z: 0 } }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 0 },
      },
    ];
    expect(
      legacyRenderWalls([flanking], regions, connectorRuns, doors)
    ).toEqual([]);
  });

  it('drops a BOUNDARY-EDGE connector-flanking wall whose `to` cell IS covered by an emitted connector run', () => {
    const boundaryEdgeFlanking = wall(-1, 1, 0, 0, 0, 0); // to = {x:0,y:0,z:0}, col 0 row 0
    const doors = [{ id: 'door-1', position: { x: 0, y: 0, z: 0 } }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 0 },
      },
    ];
    expect(
      legacyRenderWalls([boundaryEdgeFlanking], regions, connectorRuns, doors)
    ).toEqual([]);
  });

  it('keeps a connector-flanking wall whose row falls OUTSIDE the run’s coveredRows range (partial-reveal gap not yet caught up)', () => {
    const flanking = wall(0, 0, 5); // col 0, row 5 (outside the run's covered rows below)
    const doors = [{ id: 'door-1', position: { x: 0, y: 0, z: 0 } }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 2 }, // row 5 not covered
      },
    ];
    expect(
      legacyRenderWalls([flanking], regions, connectorRuns, doors)
    ).toEqual([flanking]);
  });

  it('drops a boundary-edge (from !== to) non-door wall with no matching door column — true outer perimeter, replaced by envelope runs', () => {
    const boundaryEdge = wall(10, -10, 0, 11, -11, 0); // hexDistance 1, matches #834 shape, no door anywhere near
    expect(legacyRenderWalls([boundaryEdge], regions, [], [])).toEqual([]);
  });

  it('drops a malformed wall missing from/to', () => {
    const malformed = create(WallSchema, { kind: WallKind.SOLID });
    expect(legacyRenderWalls([malformed], regions, [], [])).toEqual([]);
  });
});

// coveredRows is irrelevant to connectorRunDoorRotations (rotation-only
// concern) — an arbitrary placeholder value keeps these fixtures honest
// about ConnectorRun's real shape without every test needing to reason
// about row coverage.
const PLACEHOLDER_COVERED_ROWS = { minRow: 0, maxRow: 0 };

describe('connectorRunDoorRotations', () => {
  it('derives a rotation from the connector run direction, matching hexEdgeBetween atan2(-dz, dx) convention', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
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
        coveredRows: PLACEHOLDER_COVERED_ROWS,
      },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });

  it('skips a connector run with zero segments', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
      },
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
        coveredRows: PLACEHOLDER_COVERED_ROWS,
      },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });
});
