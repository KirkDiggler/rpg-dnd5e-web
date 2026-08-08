/**
 * walkMovement.test.ts — the author-walkthrough's movement-legality unit
 * (rpg-project#169). Two layers, deliberately separated:
 *
 * 1. `resolveWalkStep`/`canStandAt` against HAND-BUILT `WalkContext`
 *    fixtures — proves the STEP-RESOLUTION algorithm itself (stop vs.
 *    slide-along-an-axis vs. fully blocked) without depending on real hex
 *    geometry at all.
 * 2. `buildWalkContext` against REAL parsed documents (`emptyCanvasYaml`/
 *    `SHOWCASE_YAML`+`SHOWCASE_FLOORPLAN`) — proves the WIRING: each of
 *    the five legality sources (`wallLineFootprint`, a blocking
 *    room-scoped placement, a blocking top-level placement, a room's
 *    `boss:` cell, `doc.walls`/server-truth edges) actually lands in
 *    `blockedCells`/`blockedEdges`. The underlying geometry those sources
 *    delegate to (`straightWallFootprint`/`straightWallCrossedEdges`,
 *    `resolvePlacement`, `floorPlanEdgesToServerEdges`) is already proven
 *    correct by its own test suites elsewhere in this concept — this file
 *    does not re-derive that math, only that this module actually calls
 *    it and reacts to its output.
 */
import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { facingToRotationY } from '../boardGeometry';
import { emptyCanvasYaml } from '../creation/emptyCanvasDoc';
import {
  addWallLine,
  parseDungeon,
  placeItem,
  setPlacementFlags,
  setWallEdge,
  toDungeonDoc,
} from '../dungeonYaml';
import { SHOWCASE_FLOORPLAN, SHOWCASE_YAML } from '../fixtures';
import { cubeAtColRow } from '../hexLayout';
import {
  buildFloorTiles,
  buildPlaceableCells,
  buildStandableWallLineFootprint,
  type PlaceableCell,
} from './DungeonPreview3D';
import {
  buildWalkContext,
  canStandAt,
  edgeKey,
  nearestCell,
  resolveMoveVector,
  resolveWalkStart,
  resolveWalkStep,
  type WalkContext,
} from './walkMovement';

function cell(
  col: number,
  row: number,
  worldX: number,
  worldZ: number
): PlaceableCell {
  return {
    key: `${col},${row}`,
    col,
    row,
    roomId: 'r',
    worldX,
    worldZ,
    occupied: false,
  };
}

// A tiny 3x1 straight-line "corridor" in world space (X axis, one world
// unit apart) — enough to exercise stop/slide/blocked without needing
// real hex adjacency at all.
function makeContext(overrides: Partial<WalkContext> = {}): WalkContext {
  const cells = [cell(0, 0, 0, 0), cell(1, 0, 1, 0), cell(2, 0, 2, 0)];
  const cellsByKey = new Map(cells.map((c) => [`${c.col},${c.row}`, c]));
  return {
    cellList: cells,
    cellsByKey,
    blockedCells: new Set(),
    blockedEdges: new Set(),
    ...overrides,
  };
}

describe('resolveWalkStep — pure step resolution against a hand-built context', () => {
  it('a small step within the same cell is accepted unchanged', () => {
    const ctx = makeContext();
    const result = resolveWalkStep(ctx, 0, 0, 0.1, 0);
    expect(result).toEqual({ x: 0.1, z: 0 });
  });

  it('stepping toward an adjacent standable cell is accepted', () => {
    const ctx = makeContext();
    const result = resolveWalkStep(ctx, 0.4, 0, 0.4, 0);
    expect(result.x).toBeCloseTo(0.8);
  });

  it('stepping off the floor entirely (no cell there) holds position', () => {
    const ctx = makeContext();
    const result = resolveWalkStep(ctx, 0, 0, 0, 5); // no cell anywhere near z=5
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('stepping into a BLOCKED cell holds position', () => {
    const ctx = makeContext({ blockedCells: new Set(['1,0']) });
    const result = resolveWalkStep(ctx, 0.4, 0, 0.4, 0); // would land nearest to cell (1,0)
    expect(result).toEqual({ x: 0.4, z: 0 });
  });

  it('crossing a BLOCKED EDGE between two otherwise-standable cells holds position', () => {
    const ctx = makeContext({ blockedEdges: new Set([edgeKey(0, 0, 1, 0)]) });
    const result = resolveWalkStep(ctx, 0.4, 0, 0.4, 0);
    expect(result).toEqual({ x: 0.4, z: 0 });
  });

  it('a diagonal step blocked on one axis slides along the other (axis-separated fallback)', () => {
    const cells = [
      cell(0, 0, 0, 0),
      cell(1, 0, 1, 0), // blocked
      cell(0, 1, 0, 1),
    ];
    const ctx: WalkContext = {
      cellList: cells,
      cellsByKey: new Map(cells.map((c) => [`${c.col},${c.row}`, c])),
      blockedCells: new Set(['1,0']),
      blockedEdges: new Set(),
    };
    // The full diagonal step (+0.7, +0.3) lands nearest (1,0) — blocked —
    // and so does the x-only component alone (+0.7, 0), since that target
    // is ALSO nearest (1,0). The z-only component (0, +0.3) lands nearest
    // (0,0) — clear — so it should slide along z, dropping x entirely.
    const result = resolveWalkStep(ctx, 0, 0, 0.7, 0.3);
    expect(result.x).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0.3);
  });

  it('a step landing nowhere near any real cell (either full or per-axis) holds position exactly', () => {
    const cells = [cell(0, 0, 0, 0)];
    const ctx: WalkContext = {
      cellList: cells,
      cellsByKey: new Map([['0,0', cells[0]!]]),
      blockedCells: new Set(),
      blockedEdges: new Set(),
    };
    // Every candidate target (the full diagonal AND each axis alone) is
    // well beyond MAX_STEP_CONTAINMENT_DISTANCE from the one real cell.
    const result = resolveWalkStep(ctx, 0, 0, 5, 5);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  // rpg-project#169 regression fix — live-verified finding: the
  // ORIGINAL crossing check ("does the TARGET point's nearest cell
  // differ from the source, and is that pair blocked") silently never
  // fires for a PERIMETER wall, because `FloorPlan.edges`' own boundary
  // edges have a far side that was never a real, tracked floor tile
  // (`FloorPlanEdge`'s own doc comment: "one endpoint may be outside the
  // rendered floor-plan bounds" — confirmed directly against
  // `SHOWCASE_FLOORPLAN.edges`, e.g. `{from:[0,7], to:[-1,7]}`) —
  // `nearestCell` can never resolve a target point TO a nonexistent
  // neighbor, so the "did the nearest cell change" test never trips, and
  // a walking player passed straight through every perimeter wall in the
  // dungeon into unmapped void (which then correctly rendered as
  // nothing — a real collision gap, not a rendering bug, and reproduced
  // identically on the walking camera's very first commit, before any
  // Play-mode work existed). `resolveWalkStep` now asks a different
  // question — "does the CURRENT cell (definitely real; the player is
  // standing in it) have a blocked edge in roughly the direction being
  // moved" — which needs no real cell on the far side to work at all.
  // This fixture uses REAL adjacent-hex spacing/coordinates (matching
  // `hexMath.ts`'s own `HEX_SIZE = 1` geometry via `cubeAtColRow`, not
  // the other tests' simplified same-row 1-unit spacing) since the fix
  // itself depends on real hex adjacency math (`boardGeometry.ts`'s
  // `neighborCell`/`facingToRotationY`).
  describe('directional edge blocking — the actual fix (perimeter walls, not just interior ones)', () => {
    function realCell(col: number, row: number): PlaceableCell {
      const cube = cubeAtColRow(col, row);
      const world = cubeToWorld(cube, HEX_SIZE);
      return {
        key: `${col},${row}`,
        col,
        row,
        roomId: 'r',
        worldX: world.x,
        worldZ: world.z,
        occupied: false,
      };
    }

    it('a blocked edge stops movement the moment it is attempted, from anywhere in the current cell — not just once flush against the boundary', () => {
      // Only ONE real cell tracked — (1,0)'s own neighbor across this
      // edge is never in cellsByKey at all, exactly the perimeter-wall
      // shape that broke the old nearestCell-based check.
      const cells = [realCell(0, 0)];
      const ctx: WalkContext = {
        cellList: cells,
        cellsByKey: new Map([['0,0', cells[0]!]]),
        blockedCells: new Set(),
        blockedEdges: new Set([edgeKey(0, 0, 1, 0)]),
      };
      const start = cells[0]!;
      // Move toward the blocked neighbor's own direction — resolved the
      // same way the real component does (facing 0's own world angle).
      const dir = facingToRotationY(0);
      const dx = Math.cos(dir) * 0.1;
      const dz = -Math.sin(dir) * 0.1;
      let { x, z } = { x: start.worldX, z: start.worldZ };
      const origin = { x, z };
      for (let i = 0; i < 20; i++) {
        ({ x, z } = resolveWalkStep(ctx, x, z, dx, dz));
      }
      // The old (removed) approach would have let the player walk
      // straight through — 20 steps of 0.1 would reach 2.0 units away.
      // The fix rejects every one of these 20 attempts outright, since
      // they all point toward the SAME blocked direction from the SAME
      // starting cell.
      expect(x).toBeCloseTo(origin.x);
      expect(z).toBeCloseTo(origin.z);
    });

    it('the identical direction is walkable once the edge is NOT in blockedEdges', () => {
      const cells = [realCell(0, 0), realCell(1, 0)];
      const ctx: WalkContext = {
        cellList: cells,
        cellsByKey: new Map(cells.map((c) => [`${c.col},${c.row}`, c])),
        blockedCells: new Set(),
        blockedEdges: new Set(), // open
      };
      const dir = facingToRotationY(0);
      const dx = Math.cos(dir) * 0.1;
      const dz = -Math.sin(dir) * 0.1;
      let { x, z } = { x: cells[0]!.worldX, z: cells[0]!.worldZ };
      const origin = { x, z };
      for (let i = 0; i < 5; i++) {
        ({ x, z } = resolveWalkStep(ctx, x, z, dx, dz));
      }
      const traveled = Math.hypot(x - origin.x, z - origin.z);
      expect(traveled).toBeCloseTo(0.5, 5); // 5 unobstructed 0.1 steps
    });

    it('a perpendicular (non-blocked) direction from the same cell is unaffected by the blocked edge', () => {
      const cells = [realCell(0, 0), realCell(0, 1)];
      const ctx: WalkContext = {
        cellList: cells,
        cellsByKey: new Map(cells.map((c) => [`${c.col},${c.row}`, c])),
        blockedCells: new Set(),
        // Block the direction toward a DIFFERENT, unrelated neighbor —
        // (2,0), never placed as a real cell either (perimeter-shaped),
        // and never the direction actually walked in this test.
        blockedEdges: new Set([edgeKey(0, 0, 2, 0)]),
      };
      const target = cells[1]!; // (0,1) — genuinely open
      const dx0 = target.worldX - cells[0]!.worldX;
      const dz0 = target.worldZ - cells[0]!.worldZ;
      const len = Math.hypot(dx0, dz0);
      const dx = (dx0 / len) * 0.1;
      const dz = (dz0 / len) * 0.1;
      let { x, z } = { x: cells[0]!.worldX, z: cells[0]!.worldZ };
      for (let i = 0; i < 5; i++) {
        ({ x, z } = resolveWalkStep(ctx, x, z, dx, dz));
      }
      const traveled = Math.hypot(x - cells[0]!.worldX, z - cells[0]!.worldZ);
      expect(traveled).toBeCloseTo(0.5, 5);
    });
  });
});

describe('canStandAt / nearestCell — hand-built context', () => {
  it('a real, unblocked cell is standable', () => {
    expect(canStandAt(makeContext(), 0, 0)).toBe(true);
  });

  it('a cell with no floor tile at all is never standable', () => {
    expect(canStandAt(makeContext(), 99, 99)).toBe(false);
  });

  it('a blocked cell is not standable even though it has floor', () => {
    const ctx = makeContext({ blockedCells: new Set(['1,0']) });
    expect(canStandAt(ctx, 1, 0)).toBe(false);
  });

  it('nearestCell finds the closest cell by world XZ distance, blocked or not', () => {
    const ctx = makeContext();
    expect(nearestCell(ctx, 1.4, 0)?.col).toBe(1);
    expect(nearestCell(ctx, 1.6, 0)?.col).toBe(2);
  });
});

// --- buildWalkContext wiring, against real parsed documents ---

function canvasContextFromDoc(doc: ReturnType<typeof toDungeonDoc>) {
  const wallLineFootprint = buildStandableWallLineFootprint(doc);
  // A from-scratch canvas has no `floorPlan` — mirror
  // `CreationConcept.tsx`'s own derivation (`deriveCanvasFloorCells`) via
  // the SAME `buildFloorTiles`/`buildPlaceableCells` this concept's 3D
  // preview already uses, just fed a full-canvas cell list directly.
  const grid = doc.canvas ?? { width: 20, height: 30 };
  const floorCells: [number, number][] = [];
  for (let col = 0; col < grid.width; col++) {
    for (let row = 0; row < grid.height; row++) floorCells.push([col, row]);
  }
  const floorTiles = buildFloorTiles(undefined, doc.holes, floorCells);
  const cells = buildPlaceableCells(
    undefined,
    doc,
    floorTiles,
    wallLineFootprint
  );
  return { doc, cells, wallLineFootprint, floorTiles };
}

describe('buildWalkContext — straight-wall (wallLines) footprint wiring', () => {
  it('a wallLines footprint cell is not standable; its floor-neighbor is', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    // Same fixture canvasFloor.test.ts's own integration test uses — this
    // line's footprint is exactly [[5, 4]] (verified there, not re-proven
    // here).
    addWallLine(cst, { cell: [5, 4], corner: 2 }, { cell: [5, 4], corner: 5 });
    const doc = toDungeonDoc(cst);
    const wallLineFootprint = buildStandableWallLineFootprint(doc);
    const grid = doc.canvas!;
    const floorCells: [number, number][] = [];
    for (let col = 0; col < grid.width; col++)
      for (let row = 0; row < grid.height; row++) floorCells.push([col, row]);
    const tiles = buildFloorTiles(undefined, doc.holes, floorCells);
    const cells = buildPlaceableCells(undefined, doc, tiles, wallLineFootprint);
    const ctx = buildWalkContext(undefined, doc, cells, wallLineFootprint);
    expect(canStandAt(ctx, 5, 4)).toBe(false);
    expect(canStandAt(ctx, 5, 5)).toBe(true);
    expect(canStandAt(ctx, 6, 5)).toBe(true);
  });
});

describe('buildWalkContext — placement blocksMovement wiring (top-level)', () => {
  it('a blocking top-level placement makes its cell unstandable; a non-blocking one does not', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    placeItem(cst, null, 'dnd5e:props:brazier', [3, 3]);
    setPlacementFlags(cst, null, 0, { blocksMovement: true, blocksLos: false });
    placeItem(cst, null, 'dnd5e:props:pillar', [8, 8]);
    setPlacementFlags(cst, null, 1, {
      blocksMovement: false,
      blocksLos: false,
    });
    const { doc, cells, wallLineFootprint } = canvasContextFromDoc(
      toDungeonDoc(cst)
    );
    const ctx = buildWalkContext(undefined, doc, cells, wallLineFootprint);
    expect(canStandAt(ctx, 3, 3)).toBe(false);
    expect(canStandAt(ctx, 8, 8)).toBe(true);
  });
});

describe('buildWalkContext — edge-native doc.walls: solid blocks crossing, door does not', () => {
  it('a solid wall blocks the crossing; a door on a different edge does not', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    setWallEdge(cst, [5, 5], [5, 6], 'solid', true);
    setWallEdge(cst, [7, 5], [7, 6], 'door', true);
    const { doc, cells, wallLineFootprint } = canvasContextFromDoc(
      toDungeonDoc(cst)
    );
    const ctx = buildWalkContext(undefined, doc, cells, wallLineFootprint);
    expect(ctx.blockedEdges.has(edgeKey(5, 5, 5, 6))).toBe(true);
    expect(ctx.blockedEdges.has(edgeKey(7, 5, 7, 6))).toBe(false);
    // Both cells on either side of EITHER wall stay standable on their
    // own — a solid wall blocks the CROSSING (proven above via
    // `blockedEdges` membership), not the two cells it separates.
    expect(canStandAt(ctx, 5, 5)).toBe(true);
    expect(canStandAt(ctx, 5, 6)).toBe(true);
    expect(canStandAt(ctx, 7, 5)).toBe(true);
    expect(canStandAt(ctx, 7, 6)).toBe(true);
  });
});

describe('buildWalkContext — real showcase document (floorPlan present)', () => {
  const { cst } = parseDungeon(SHOWCASE_YAML);
  const doc = toDungeonDoc(cst);
  const floorPlan = SHOWCASE_FLOORPLAN;
  const floorTiles = buildFloorTiles(floorPlan, doc.holes, undefined);
  const wallLineFootprint = buildStandableWallLineFootprint(doc);
  const cells = buildPlaceableCells(
    floorPlan,
    doc,
    floorTiles,
    wallLineFootprint
  );
  const ctx = buildWalkContext(floorPlan, doc, cells, wallLineFootprint);

  it('a room-scoped blocking placement (antechamber brazier, blocks_movement: true) blocks its absolute cell', () => {
    // antechamber startColumn 0, brazier at room-local [1,1] -> absolute [1,1].
    expect(canStandAt(ctx, 1, 1)).toBe(false);
  });

  it('a room-scoped NON-blocking placement (antechamber bone-pile, blocks_movement: false) leaves its cell standable', () => {
    expect(canStandAt(ctx, 4, 6)).toBe(true);
  });

  it("the boss's own cell is always blocked (a monster stands there)", () => {
    // vault startColumn 22, boss at room-local [5,5] -> absolute [27,5].
    expect(canStandAt(ctx, 27, 5)).toBe(false);
  });

  it('server-truth FloorPlan.edges genuinely contribute blocked edges — this fixture authors zero doc.walls/wallLines of its own', () => {
    expect(doc.walls).toEqual([]);
    expect(doc.wallLines).toEqual([]);
    expect(ctx.blockedEdges.size).toBeGreaterThan(0);
  });
});

describe('resolveWalkStart', () => {
  it("prefers the doc's own start: marker when it resolves to a standable cell", () => {
    const { cst } = parseDungeon(emptyCanvasYaml(10, 10));
    placeItem(cst, null, 'dnd5e:props:pillar', [9, 9]); // decoy occupant elsewhere
    const doc = toDungeonDoc(cst);
    // start: is not set in the empty canvas fixture — use a doc override.
    const docWithStart = { ...doc, start: [3, 4] as [number, number] };
    const wallLineFootprint = buildStandableWallLineFootprint(doc);
    const grid = doc.canvas!;
    const floorCells: [number, number][] = [];
    for (let col = 0; col < grid.width; col++)
      for (let row = 0; row < grid.height; row++) floorCells.push([col, row]);
    const tiles = buildFloorTiles(undefined, doc.holes, floorCells);
    const cells = buildPlaceableCells(undefined, doc, tiles, wallLineFootprint);
    const ctx = buildWalkContext(undefined, doc, cells, wallLineFootprint);
    const start = resolveWalkStart(ctx, docWithStart);
    expect(start?.col).toBe(3);
    expect(start?.row).toBe(4);
  });

  it('falls back to the standable cell nearest the floor centroid when start: is unset', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(4, 4));
    const doc = toDungeonDoc(cst);
    const wallLineFootprint = buildStandableWallLineFootprint(doc);
    const floorCells: [number, number][] = [];
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++) floorCells.push([col, row]);
    const tiles = buildFloorTiles(undefined, doc.holes, floorCells);
    const cells = buildPlaceableCells(undefined, doc, tiles, wallLineFootprint);
    const ctx = buildWalkContext(undefined, doc, cells, wallLineFootprint);
    const start = resolveWalkStart(ctx, doc);
    expect(start).not.toBeNull();
    expect(canStandAt(ctx, start!.col, start!.row)).toBe(true);
  });

  it('returns null when there is no floor to walk on at all', () => {
    const ctx: WalkContext = {
      cellList: [],
      cellsByKey: new Map(),
      blockedCells: new Set(),
      blockedEdges: new Set(),
    };
    expect(resolveWalkStart(ctx, { start: null })).toBeNull();
  });
});

// resolveMoveVector — shared by BOTH walking camera modes (WalkCamera's
// first-person facing, PlayCamera's azimuth-derived facing); each
// component supplies its own forward/right, this function does the rest
// identically either way.
describe('resolveMoveVector', () => {
  const FORWARD_NEG_Z = { x: 0, z: -1 };
  const RIGHT_POS_X = { x: 1, z: 0 };

  it('no keys pressed produces zero movement', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      1
    );
    expect(dx).toBe(0);
    expect(dz).toBe(0);
  });

  it('W alone moves the full speed*delta along forward', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(['KeyW']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(-1.5); // 3 * 0.5, along -Z
  });

  it('S alone moves backward (negated forward)', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(['KeyS']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(1.5);
  });

  it('D alone strafes along right', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(['KeyD']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(dx).toBeCloseTo(1.5);
    expect(dz).toBeCloseTo(0);
  });

  it('W+D (diagonal) is normalized — same magnitude as a single key, not faster', () => {
    const single = resolveMoveVector(
      new Set(['KeyW']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    const singleMag = Math.hypot(single.dx, single.dz);
    const diagonal = resolveMoveVector(
      new Set(['KeyW', 'KeyD']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    const diagonalMag = Math.hypot(diagonal.dx, diagonal.dz);
    expect(diagonalMag).toBeCloseTo(singleMag);
  });

  it('opposite keys (W+S) cancel to zero', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(['KeyW', 'KeyS']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(0);
  });

  it('arrow keys are equivalent to WASD', () => {
    const wasd = resolveMoveVector(
      new Set(['KeyW']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    const arrows = resolveMoveVector(
      new Set(['ArrowUp']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(arrows).toEqual(wasd);
  });

  it('an unrelated key code is ignored', () => {
    const { dx, dz } = resolveMoveVector(
      new Set(['KeyQ']),
      FORWARD_NEG_Z,
      RIGHT_POS_X,
      3,
      0.5
    );
    expect(dx).toBe(0);
    expect(dz).toBe(0);
  });
});
