/**
 * Tests for wallRunAdapters — the wire-shape <-> wallRuns.ts seam and the
 * W2 "positive category rule" (design.md).
 */

import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { CUTAWAY_STUB_WALL_HEIGHT } from '@/rendering/calibrationConstants';
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
  connectorDoorHeights,
  connectorDoorInputsFromWalls,
  connectorDoorPlanes,
  connectorFallbackSegments,
  connectorRunDoorRotations,
  legacyRenderWalls,
  regionInputsFromHexes,
} from './wallRunAdapters';
import {
  computeWallRuns,
  cubeAtColRow,
  hexColumn,
  hexRow,
  type ConnectorDoorInput,
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

  // W3 (design.md/plan.md's "fallback restyle" ask): a connector-flanking
  // wall NOT covered by any connector run — category (c), the structural
  // safety net — no longer renders through legacyRenderWalls' legacy
  // per-cell path at all. It's excluded here and covered by
  // connectorFallbackSegments' own describe block below (same category
  // rule, different output shape/renderer target).

  it('excludes (from legacyRenderWalls) a degenerate connector-flanking wall NOT covered by any connector run — it now belongs to connectorFallbackSegments instead', () => {
    const flanking = cellWall(60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    expect(
      legacyRenderWalls([flanking, ...anchors(0, 7)], regions, [], doors)
    ).not.toContainEqual(flanking);
  });

  it('excludes (from legacyRenderWalls) a BOUNDARY-EDGE connector-flanking wall NOT covered by any connector run — it now belongs to connectorFallbackSegments instead', () => {
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
    ).not.toContainEqual(boundaryEdgeFlanking);
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

  it('drops a boundary-edge (from !== to) non-door wall with no matching door column — true outer perimeter, replaced by envelope runs', () => {
    const boundaryEdge = wall(10, -10, 0, 11, -11, 0); // hexDistance 1, matches #834 shape, no door anywhere near
    expect(legacyRenderWalls([boundaryEdge], regions, [], [])).toEqual([]);
  });

  it('drops a malformed wall missing from/to', () => {
    const malformed = create(WallSchema, { kind: WallKind.SOLID });
    expect(legacyRenderWalls([malformed], regions, [], [])).toEqual([]);
  });
});

describe("connectorFallbackSegments (W3 fallback restyle: same category-rule candidates as legacyRenderWalls' old category (c), now rendered as straight column-aligned segments instead of the legacy per-cell path)", () => {
  const regions: RegionInput[] = [
    { id: 'hall', hexes: [{ x: 10, y: -10, z: 0 }] },
  ];

  function cellWall(col: number, row: number, kind?: WallKind, id?: string) {
    const hex = cubeAtColRow(col, row);
    return wall(hex.x, hex.y, hex.z, hex.x, hex.y, hex.z, kind, id);
  }

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

  function anchors(minRow: number, maxRow: number): Wall[] {
    return [cellWall(1000, minRow), cellWall(1000, maxRow)];
  }

  it('produces a segment for a degenerate connector-flanking wall NOT covered by any connector run', () => {
    const flanking = cellWall(60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const segments = connectorFallbackSegments(
      [flanking, ...anchors(0, 7)],
      regions,
      [],
      doors
    );
    expect(segments).toHaveLength(1);
  });

  it('produces a segment for a BOUNDARY-EDGE connector-flanking wall NOT covered by any connector run (the real production wire shape)', () => {
    const boundaryEdgeFlanking = edgeWall(59, 3, 60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const segments = connectorFallbackSegments(
      [boundaryEdgeFlanking, ...anchors(0, 7)],
      regions,
      [],
      doors
    );
    expect(segments).toHaveLength(1);
  });

  it("the produced segment is column-aligned: both endpoints sit exactly on the connector column's own world-space line", () => {
    const flanking = cellWall(60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const segments = connectorFallbackSegments(
      [flanking, ...anchors(0, 7)],
      regions,
      [],
      doors
    );
    const columnTop = cubeToWorld(cubeAtColRow(60, 0), HEX_SIZE);
    const columnBottom = cubeToWorld(cubeAtColRow(60, 7), HEX_SIZE);
    const columnDir = {
      x: columnBottom.x - columnTop.x,
      z: columnBottom.z - columnTop.z,
    };
    const crossZ = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      a.x * b.z - a.z * b.x;
    for (const point of [segments[0]!.start, segments[0]!.end]) {
      const toPoint = { x: point.x - columnTop.x, z: point.z - columnTop.z };
      expect(Math.abs(crossZ(columnDir, toPoint))).toBeLessThan(1e-9);
    }
  });

  it('excludes a BOUNDARY-EDGE candidate one row beyond the true grid (STILL-BLOCKED regression) even though its column matches a known door', () => {
    const offGridBoundaryEdge = edgeWall(59, 7, 60, 8);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const segments = connectorFallbackSegments(
      [offGridBoundaryEdge, ...anchors(0, 7)],
      regions,
      [],
      doors
    );
    expect(segments).toEqual([]);
  });

  it('produces no segment for a degenerate connector-flanking wall that IS covered by an emitted connector run', () => {
    const flanking = cellWall(60, 0);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 0 },
        facing: { x: 1, z: 0 },
      },
    ];
    const segments = connectorFallbackSegments(
      [flanking, ...anchors(0, 7)],
      regions,
      connectorRuns,
      doors
    );
    expect(segments).toEqual([]);
  });

  it('produces no segment for a BOUNDARY-EDGE connector-flanking wall whose `to` cell IS covered by an emitted connector run', () => {
    const boundaryEdgeFlanking = edgeWall(59, 0, 60, 0);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 0 },
        facing: { x: 1, z: 0 },
      },
    ];
    const segments = connectorFallbackSegments(
      [boundaryEdgeFlanking, ...anchors(0, 7)],
      regions,
      connectorRuns,
      doors
    );
    expect(segments).toEqual([]);
  });

  it("produces a segment for a connector-flanking wall whose row falls OUTSIDE the run's coveredRows range but still in-grid (partial-reveal gap not yet caught up)", () => {
    const flanking = cellWall(60, 5);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 1 } }],
        coveredRows: { minRow: 0, maxRow: 2 }, // row 5 not covered yet
        facing: { x: 1, z: 0 },
      },
    ];
    const segments = connectorFallbackSegments(
      [flanking, ...anchors(0, 7)],
      regions,
      connectorRuns,
      doors
    );
    expect(segments).toHaveLength(1);
  });

  it('produces no segment for a door wall (doors stay on the legacy per-cell renderer, unaffected by this restyle)', () => {
    const door = wall(1, -1, 0, 2, -2, 0, WallKind.DOOR_CLOSED, 'd1');
    expect(connectorFallbackSegments([door], [], [], [])).toEqual([]);
  });

  it('produces no segment for an interior pattern wall (deferred restyle per design.md, unaffected here)', () => {
    const interior = wall(10, -10, 0); // matches the hall region hex above
    expect(connectorFallbackSegments([interior], regions, [], [])).toEqual([]);
  });

  it('deduplicates: two wall entries resolving to the same candidate cell produce exactly one segment', () => {
    const flanking = cellWall(60, 3);
    const doors = [{ id: 'door-1', position: cubeAtColRow(60, 4) }];
    const segments = connectorFallbackSegments(
      [flanking, flanking, ...anchors(0, 7)],
      regions,
      [],
      doors
    );
    expect(segments).toHaveLength(1);
  });
});

// coveredRows/facing are irrelevant to connectorRunDoorRotations
// (rotation-only concern) — arbitrary placeholder values keep these
// fixtures honest about ConnectorRun's real shape without every test
// needing to reason about row coverage or facing direction.
const PLACEHOLDER_COVERED_ROWS = { minRow: 0, maxRow: 0 };
const PLACEHOLDER_FACING = { x: 1, z: 0 };

describe('connectorRunDoorRotations', () => {
  it('derives a rotation from the connector run direction, matching hexEdgeBetween atan2(-dz, dx) convention', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: PLACEHOLDER_FACING,
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
        facing: PLACEHOLDER_FACING,
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
        facing: PLACEHOLDER_FACING,
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
        facing: PLACEHOLDER_FACING,
      },
    ];
    expect(connectorRunDoorRotations(runs).size).toBe(0);
  });
});

describe('connectorDoorPlanes (rpg-project#132 connector-single-wall follow-up, Kirk\'s live-walk regression: "can our door rotate a little to line up with the wall?")', () => {
  it("a door's plane position is EXACTLY cubeToWorld(door.position) — the door's own cell, always on the connector column by construction, needing no ConnectorRun/region data at all", () => {
    const doorHex = cubeAtColRow(6, 4);
    const doors: ConnectorDoorInput[] = [{ id: 'door-1', position: doorHex }];
    const planes = connectorDoorPlanes(doors, HEX_SIZE);
    expect(planes.get('door-1')!.position).toEqual(
      cubeToWorld(doorHex, HEX_SIZE)
    );
  });

  it("rotationY matches the column-axis direction (hexEdgeBetween's atan2(-dz, dx) convention), computed from a point one row further down the SAME column — the identical convention connectorFallbackSegments/tileWallSegment already use for the tiled wall pieces on that column", () => {
    const col = 6;
    const row = 4;
    const doorHex = cubeAtColRow(col, row);
    const doors: ConnectorDoorInput[] = [{ id: 'door-1', position: doorHex }];
    const planes = connectorDoorPlanes(doors, HEX_SIZE);
    const here = cubeToWorld(doorHex, HEX_SIZE);
    const next = cubeToWorld(cubeAtColRow(col, row + 1), HEX_SIZE);
    const expected = Math.atan2(-(next.z - here.z), next.x - here.x);
    expect(planes.get('door-1')!.rotationY).toBeCloseTo(expected, 9);
  });

  it("the plane position is exactly collinear with the connector's own column line (any other row at the same column) — the invariant that made this override necessary in the first place: the wire's own hexEdgeBetween-derived edge.mid is NOT guaranteed to sit on this line", () => {
    const col = 9;
    const doorHex = cubeAtColRow(col, 3);
    const doors: ConnectorDoorInput[] = [{ id: 'door-1', position: doorHex }];
    const planes = connectorDoorPlanes(doors, HEX_SIZE);
    const position = planes.get('door-1')!.position;

    const colTop = cubeToWorld(cubeAtColRow(col, 0), HEX_SIZE);
    const colBottom = cubeToWorld(cubeAtColRow(col, 7), HEX_SIZE);
    const dir = { x: colBottom.x - colTop.x, z: colBottom.z - colTop.z };
    const toPoint = { x: position.x - colTop.x, z: position.z - colTop.z };
    const crossZ = dir.x * toPoint.z - dir.z * toPoint.x;
    expect(Math.abs(crossZ)).toBeLessThan(1e-9);
  });

  it('produces independent entries for multiple doors, keyed by id, each using its OWN column/row', () => {
    const doorA = cubeAtColRow(6, 4);
    const doorB = cubeAtColRow(17, 4);
    const doors: ConnectorDoorInput[] = [
      { id: 'door-a', position: doorA },
      { id: 'door-b', position: doorB },
    ];
    const planes = connectorDoorPlanes(doors, HEX_SIZE);
    expect(planes.size).toBe(2);
    expect(planes.get('door-a')!.position).toEqual(
      cubeToWorld(doorA, HEX_SIZE)
    );
    expect(planes.get('door-b')!.position).toEqual(
      cubeToWorld(doorB, HEX_SIZE)
    );
  });

  it('skips a door with no id (nothing to key the resulting map by)', () => {
    const doors: ConnectorDoorInput[] = [{ position: cubeAtColRow(6, 4) }];
    expect(connectorDoorPlanes(doors, HEX_SIZE).size).toBe(0);
  });

  it('needs no region or ConnectorRun data at all — produces the SAME plane whether the far side of the connector is dark or fully revealed, unlike connectorRunDoorRotations (which only produces an entry once a real ConnectorRun resolves)', () => {
    // Same door, computed with nothing else in scope — no regions, no
    // connectorRuns, no reveal-state concept at all.
    const doorHex = cubeAtColRow(6, 4);
    const doors: ConnectorDoorInput[] = [{ id: 'door-1', position: doorHex }];
    const planeWhenDark = connectorDoorPlanes(doors, HEX_SIZE).get('door-1')!;
    const planeWhenRevealed = connectorDoorPlanes(doors, HEX_SIZE).get(
      'door-1'
    )!;
    expect(planeWhenDark).toEqual(planeWhenRevealed);
    // Sanity: hexColumn/hexRow confirm this really is a connector-column
    // door (not a coincidental fixture artifact).
    expect(hexColumn(doorHex)).toBe(6);
    expect(hexRow(doorHex)).toBe(4);
  });
});

describe("connectorDoorHeights (cutaway prototype, rpg-project#132 ?wallCutaway=1: a door's frame/leaf height matches its OWN connector run's classification, not a single global wallHeight)", () => {
  const TALL = 2.4;
  // Toward/away from the fixed isometric camera — same directions
  // wallRunMeshHelpers.test.ts's effectiveWallHeight tests use (matches
  // CAMERA_WARD_XZ's own direction, calibrationConstants.ts).
  const TOWARD_CAMERA = { x: 1, z: 1 };
  const AWAY_FROM_CAMERA = { x: -1, z: -1 };

  it('stubs a door whose connector run faces toward the camera', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: TOWARD_CAMERA,
      },
    ];
    expect(connectorDoorHeights(runs, TALL).get('door-1')).toBe(
      CUTAWAY_STUB_WALL_HEIGHT
    );
  });

  it('keeps a door at the tall height when its connector run faces away from the camera', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: AWAY_FROM_CAMERA,
      },
    ];
    expect(connectorDoorHeights(runs, TALL).get('door-1')).toBe(TALL);
  });

  it('skips a connector run with no doorId — nothing to key the resulting map by', () => {
    const runs: ConnectorRun[] = [
      {
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: TOWARD_CAMERA,
      },
    ];
    expect(connectorDoorHeights(runs, TALL).size).toBe(0);
  });

  it('produces independent entries for multiple doors, keyed by doorId, each classified by its OWN facing', () => {
    const runs: ConnectorRun[] = [
      {
        doorId: 'door-a',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: TOWARD_CAMERA,
      },
      {
        doorId: 'door-b',
        regionAId: 'c',
        regionBId: 'd',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: PLACEHOLDER_COVERED_ROWS,
        facing: AWAY_FROM_CAMERA,
      },
    ];
    const heights = connectorDoorHeights(runs, TALL);
    expect(heights.size).toBe(2);
    expect(heights.get('door-a')).toBe(CUTAWAY_STUB_WALL_HEIGHT);
    expect(heights.get('door-b')).toBe(TALL);
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

  it('still keeps every genuine in-grid connector-flanking cell not covered by a run — the original invisible-wall fix still holds against real data (checked across BOTH renderer paths, since W3 split category (c) out of legacyRenderWalls into connectorFallbackSegments)', () => {
    // Both connectors fully resolve here (regions are fully known), so
    // there is nothing left to fall back on via EITHER path: every
    // connector-flanking cell is covered by a real run. legacyRenderWalls
    // should keep doors only (no interior pattern walls exist in the
    // reference-tomb fixture); connectorFallbackSegments should produce
    // nothing at all. This also subsumes the gate review's original
    // "keptOffGrid=4" regression (rpg-dnd5e-web#603 STILL-BLOCKED
    // finding): an off-grid leak would surface as a nonzero fallback
    // segment count here, since categorizeWall's grid-bounds check is
    // shared by both this function and legacyRenderWalls.
    const kept = legacyRenderWalls(realWalls, regions, connectorRuns, doors);
    const nonDoorKept = kept.filter(
      (wall) =>
        wall.kind !== WallKind.DOOR_OPEN && wall.kind !== WallKind.DOOR_LOCKED
    );
    expect(nonDoorKept).toEqual([]);

    const fallback = connectorFallbackSegments(
      realWalls,
      regions,
      connectorRuns,
      doors
    );
    expect(fallback).toEqual([]);
  });

  it("partial reveal against the same real data: hall unknown — connectorFallbackSegments covers the entrance-hall connector's flanking cells, with no phantom segment at the reported off-grid positions (col 6 row 8, col 17 row -1)", () => {
    const entranceOnly: RegionInput[] = [regions[0]!];
    const partialConnectorRuns = computeWallRuns({
      regions: entranceOnly,
      doors,
    }).connectorRuns;
    // No region on hall's side yet -> nearest-region pairing can't
    // resolve either connector.
    expect(partialConnectorRuns).toHaveLength(0);

    const fallback = connectorFallbackSegments(
      realWalls,
      entranceOnly,
      [],
      doors
    );
    // The entrance-hall connector's flanking cells (column 6) must be
    // covered by fallback segments, since no run covers them yet.
    expect(fallback.length).toBeGreaterThan(0);

    // Neither reported off-grid artifact (col 6 row 8; col 17 row -1 —
    // one row below/above the true [0,7] grid) produced a phantom
    // segment: every real fallback segment's own midpoint sits well away
    // from those two specific world positions.
    const suspectPositions = [
      cubeToWorld(cubeAtColRow(6, 8), HEX_SIZE),
      cubeToWorld(cubeAtColRow(17, -1), HEX_SIZE),
    ];
    for (const segment of fallback) {
      const mid = {
        x: (segment.start.x + segment.end.x) / 2,
        z: (segment.start.z + segment.end.z) / 2,
      };
      for (const suspect of suspectPositions) {
        const dist = Math.hypot(mid.x - suspect.x, mid.z - suspect.z);
        expect(dist).toBeGreaterThan(0.01);
      }
    }
  });
});
