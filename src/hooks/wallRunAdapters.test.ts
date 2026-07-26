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
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { REAL_REFERENCE_TOMB_WALLS } from './referenceTombRealWireFixture';
import {
  connectorDoorInputsFromWalls,
  connectorRunDoorRotations,
  legacyRenderWalls,
  regionInputsFromHexes,
} from './wallRunAdapters';
import {
  computeWallRuns,
  cubeAtColRow,
  hexColumn,
  hexRow,
  type ConnectorRun,
  type RegionInput,
} from './wallRuns';

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

  /** A degenerate wall at (col, row), built via cubeAtColRow so every
   * coordinate in this suite is verifiably correct rather than hand-
   * computed. */
  function cellWall(col: number, row: number, kind?: WallKind, id?: string) {
    const hex = cubeAtColRow(col, row);
    return wall(hex.x, hex.y, hex.z, hex.x, hex.y, hex.z, kind, id);
  }

  /** A boundary-edge wall from (fromCol, fromRow) to (toCol, toRow). */
  function edgeWall(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number
  ) {
    const from = cubeAtColRow(fromCol, fromRow);
    const to = cubeAtColRow(toCol, toRow);
    return wall(from.x, from.y, from.z, to.x, to.y, to.z);
  }

  /**
   * Establishes a REAL, non-tautological grid-bounds range [minRow,maxRow]
   * at a dedicated column (1000 — unrelated to any door/region in this
   * suite), independent of whatever candidate a given test asserts on.
   * Gate review's STILL-BLOCKED finding was missed precisely because
   * every prior version of these tests passed a `walls` array containing
   * ONLY the one entry under test, so `wireGridBounds` trivially derived
   * its range from that single candidate (a lone point is always
   * "within its own bounds"). These anchors always get dropped
   * themselves (column 1000 never matches a door, never inside
   * `regions`) — they exist purely to feed real min/max rows into
   * `wireGridBounds` via their own `from` values.
   */
  function anchors(minRow: number, maxRow: number): Wall[] {
    return [cellWall(1000, minRow), cellWall(1000, maxRow)];
  }

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
  //
  // Every test below includes `...anchors(0, 7)` in its `walls` array so
  // the in-grid check (added for the STILL-BLOCKED regression) is
  // genuinely exercised against a real, independently-established
  // [0,7] row range — never trivially satisfied by a single-entry list.

  it('keeps a degenerate connector-flanking wall NOT covered by any connector run, when its column matches a known door and its row is in-grid (structural safety net)', () => {
    const flanking = cellWall(60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    expect(
      legacyRenderWalls([flanking, ...anchors(0, 7)], regions, [], doors)
    ).toContainEqual(flanking);
  });

  it('keeps a BOUNDARY-EDGE connector-flanking wall NOT covered by any connector run, matching its `to` cell’s column and in-grid row against a known door (the real production wire shape)', () => {
    // from = real neighboring floor (col 59), to = the flanking cell
    // itself (col 60, row 3 — in-grid) — exactly rpg-toolkit's
    // connectorBoundaryEdgeWalls shape.
    const boundaryEdgeFlanking = edgeWall(59, 3, 60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    expect(
      legacyRenderWalls(
        [boundaryEdgeFlanking, ...anchors(0, 7)],
        regions,
        [],
        doors
      )
    ).toContainEqual(boundaryEdgeFlanking);
  });

  it('excludes a BOUNDARY-EDGE candidate one row beyond the true grid (the STILL-BLOCKED regression) even though its column matches a known door', () => {
    // to = row 8 — one row BELOW the anchors(0,7)-established grid,
    // exactly the reported reproduction shape (col 6 row 8 in the real
    // reference-tomb dungeon).
    const offGridBoundaryEdge = edgeWall(59, 7, 60, 8);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    expect(
      legacyRenderWalls(
        [offGridBoundaryEdge, ...anchors(0, 7)],
        regions,
        [],
        doors
      )
    ).not.toContainEqual(offGridBoundaryEdge);
  });

  // No degenerate equivalent of the above: a degenerate entry's own
  // `from` IS the candidate, so it always self-contributes to
  // `wireGridBounds` — trivially "in bounds" regardless of value. This
  // is harmless because it can never fire against real data:
  // `perimeterEdgeWalls` (the only source of true off-grid artifacts)
  // never emits a degenerate shape at all (Start is always real floor,
  // End is always a distinct neighbor cube); the only generator that
  // DOES emit degenerate connector-flanking entries
  // (`connectorBoundaryEdgeWalls`'s fallback) only ever fires for cells
  // already known to be genuine, in-grid flanking cells. So a degenerate
  // off-grid candidate is not a real shape this module needs to defend
  // against — see the boundary-edge test above for the shape that
  // actually occurs.

  it('drops a degenerate connector-flanking wall that IS covered by an emitted connector run', () => {
    const flanking = cellWall(60, 0);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
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
      legacyRenderWalls(
        [flanking, ...anchors(0, 7)],
        regions,
        connectorRuns,
        doors
      )
    ).not.toContainEqual(flanking);
  });

  it('drops a BOUNDARY-EDGE connector-flanking wall whose `to` cell IS covered by an emitted connector run', () => {
    const boundaryEdgeFlanking = edgeWall(59, 0, 60, 0);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
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
      legacyRenderWalls(
        [boundaryEdgeFlanking, ...anchors(0, 7)],
        regions,
        connectorRuns,
        doors
      )
    ).not.toContainEqual(boundaryEdgeFlanking);
  });

  it('keeps a connector-flanking wall whose row falls OUTSIDE the run’s coveredRows range but still in-grid (partial-reveal gap not yet caught up)', () => {
    const flanking = cellWall(60, 5);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 2 }, // row 5 not covered yet
      },
    ];
    expect(
      legacyRenderWalls(
        [flanking, ...anchors(0, 7)],
        regions,
        connectorRuns,
        doors
      )
    ).toContainEqual(flanking);
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

describe('legacyRenderWalls — real reference-tomb wire fixture (gate review STILL-BLOCKED, rpg-dnd5e-web#603)', () => {
  // Every hex in a width x height rectangle starting at column offsetX —
  // mirrors wallRuns.test.ts's identical fixture helper (verified there
  // against real compiled toolkit output; reused here as a plain local
  // copy rather than a cross-file import, matching this file's existing
  // no-shared-fixture-module convention).
  function regionCubes(width: number, height: number, offsetX: number) {
    const hexes: { x: number; y: number; z: number }[] = [];
    for (let col = offsetX; col < offsetX + width; col++) {
      for (let row = 0; row < height; row++) {
        hexes.push(cubeAtColRow(col, row));
      }
    }
    return hexes;
  }

  const HEIGHT = 8;
  const regions: RegionInput[] = [
    { id: 'entrance', hexes: regionCubes(6, HEIGHT, 0) },
    { id: 'hall', hexes: regionCubes(10, HEIGHT, 7) },
    { id: 'tomb', hexes: regionCubes(12, HEIGHT, 18) },
  ];
  const realWalls = REAL_REFERENCE_TOMB_WALLS as unknown as Wall[];
  const doors = connectorDoorInputsFromWalls(realWalls);
  const connectorRuns = computeWallRuns({ regions, doors }).connectorRuns;

  it('every connector resolves against the real wire data (sanity: the fixture actually exercises the fix)', () => {
    expect(doors).toHaveLength(2);
    expect(connectorRuns).toHaveLength(2);
  });

  it('keeps zero off-grid candidates — the exact reproduction the gate review measured (keptOffGrid=4) no longer survives', () => {
    const kept = legacyRenderWalls(realWalls, regions, connectorRuns, doors);
    const offGrid = kept.filter((wall) => {
      if (!wall.from || !wall.to) return false;
      const fromHex = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
      const toHex = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
      const isDegenerate =
        fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
      const candidate = isDegenerate ? fromHex : toHex;
      const row = hexRow(candidate);
      return row < 0 || row > HEIGHT - 1;
    });
    expect(offGrid).toEqual([]);
  });

  it('specifically excludes the exact reported off-grid cells (col 6 row 8, col 17 row -1)', () => {
    const kept = legacyRenderWalls(realWalls, regions, connectorRuns, doors);
    const candidateKeys = kept.map((wall) => {
      const toHex = wall.to!;
      const fromHex = wall.from!;
      const isDegenerate =
        fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
      const candidate = isDegenerate ? fromHex : toHex;
      return `${hexColumn(candidate)}:${hexRow(candidate)}`;
    });
    // {x:6,y:-11,z:5} -> col 6, row 8 (one row below the grid).
    expect(candidateKeys).not.toContain('6:8');
    // {x:17,y:-8,z:-9} -> col 17, row -1 (one row above the grid).
    expect(candidateKeys).not.toContain('17:-1');
  });

  it('still keeps every genuine in-grid connector-flanking cell not covered by a run — the original invisible-wall fix still holds against real data', () => {
    // Both connectors fully resolve here (regions are fully known), so
    // the only thing legacyRenderWalls should still be covering via the
    // safety net is: nothing genuine, since both runs cover their full
    // [0, height-1] range minus the door row. Assert every KEPT non-door
    // wall is either an interior pattern wall or a genuine in-grid
    // candidate — i.e., kept.length matches exactly "doors only" once
    // both connectors are fully resolved (no gaps left to fall back on).
    const kept = legacyRenderWalls(realWalls, regions, connectorRuns, doors);
    const nonDoorKept = kept.filter(
      (wall) =>
        wall.kind !== WallKind.DOOR_OPEN && wall.kind !== WallKind.DOOR_LOCKED
    );
    expect(nonDoorKept).toEqual([]);
  });

  it('partial reveal against the same real data: hall unknown — every flanking wall entry at the entrance-hall connector is either run-covered or per-cell rendered, and still zero off-grid', () => {
    const entranceOnly: RegionInput[] = [regions[0]!];
    const partialConnectorRuns = computeWallRuns({
      regions: entranceOnly,
      doors,
    }).connectorRuns;
    // No region on hall's side yet -> nearest-region pairing can't
    // resolve either connector.
    expect(partialConnectorRuns).toHaveLength(0);

    const kept = legacyRenderWalls(realWalls, entranceOnly, [], doors);
    const offGrid = kept.filter((wall) => {
      if (!wall.from || !wall.to) return false;
      const fromHex = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
      const toHex = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
      const isDegenerate =
        fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
      const candidate = isDegenerate ? fromHex : toHex;
      const row = hexRow(candidate);
      return row < 0 || row > HEIGHT - 1;
    });
    expect(offGrid).toEqual([]);

    // The entrance-hall connector's flanking cells (column 6) must all
    // be kept via the fallback, since no run covers them yet.
    const col6Kept = kept.filter((wall) => {
      const toHex = wall.to!;
      const fromHex = wall.from!;
      const isDegenerate =
        fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
      const candidate = isDegenerate ? fromHex : toHex;
      return hexColumn(candidate) === 6 && wall.kind === WallKind.SOLID;
    });
    expect(col6Kept.length).toBeGreaterThan(0);
  });
});
