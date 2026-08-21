/**
 * atlasWallRuns — turns the session wire's DECLARED interior boundaries
 * and the floor cell mask into STRAIGHT modular wall runs, the same
 * presentation the old route used (`WallRunMesh`/`wallRuns.ts`'s
 * `EnvelopeRun`/`ConnectorRun`), replacing this route's first attempt at
 * per-hex-edge zigzag wall pieces.
 *
 * Kirk's ruling (PR #762 live review): "walls look better but we had
 * straight walls in the game previously. I do not think making the walls
 * follow the hex shapes is a good idea." The AUTHORITY is unchanged —
 * `atlas.boundaries` still say which adjacent cell pairs are blocked, and
 * the floor cell mask still says where the outside is; nothing here is
 * derived from room membership the wire doesn't declare, and nothing
 * borrows `wallRuns.ts`'s reveal-fog widening or connector-suppression
 * (that machinery exists for the OLD wire's per-viewer partial reveal,
 * which this wire's atlas — fetched once, fully, per `GetAtlasResponse`'s
 * own "construction truth" doc comment — has no need of at all). Only the
 * PRESENTATION changes: a zigzag chain of boundary edges between two
 * chambers becomes ONE straight run along the seam's midline, and the
 * declared floor mask's outer edge becomes straight envelope runs instead
 * of a sawtooth perimeter piece per edge.
 *
 * # Chambers are found, not declared
 *
 * The atlas has no "room"/"zone" concept at all — just `cells` (the flat
 * floor mask) and `boundaries` (which adjacent pairs are blocked). Chamber
 * membership is recovered client-side by connected-components: two floor
 * cells are in the same chamber iff a path of un-blocked, un-doored hex
 * adjacency connects them (a doorway is treated as a SEPARATOR for this
 * grouping even though a member can walk through it — the two chambers a
 * door joins are still two distinct spaces, not one).
 *
 * # This wire's dungeons are "odd-r", not `wallRuns.ts`'s "odd-q"
 *
 * `wallRuns.ts`'s own `hexColumn`/`hexRow`/`cubeAtColRow` encode the OLD
 * wire's procedural generator's own offset convention (that file's header
 * doc: "pointy-top/odd-q branch"). Checked against the real reference-tomb
 * fixture before writing a line of this module: every row of the combined
 * 28-wide floor spans exactly 28 consecutive axial q values, and each
 * row's own minimum q shifts by `-floor(row/2)` as row increases — the
 * textbook "odd-r offset" correction, not "odd-q". Reusing `wallRuns.ts`'s
 * own column/row functions here would silently group cells into the WRONG
 * chambers. `authoredCol`/`authoredRow`/`cubeAtAuthoredColRow` below are
 * this wire's own (verified) equivalent; only the genuinely
 * convention-independent pure geometry (`distance`, `unitDirection`,
 * `outwardNormal`, `lineIntersection`, `buildEnvelopeSegment`, exported
 * from `wallRuns.ts` starting with this change) is shared.
 */

import {
  coordToKey,
  cubeToWorld,
  getHexNeighbors,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import {
  buildEnvelopeSegment,
  DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN,
  DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES,
  DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES,
  distance,
  lineIntersection,
  unitDirection,
  type ConnectorRun,
  type EnvelopeRun,
  type EnvelopeSide,
  type WallRunSegment,
} from '@/hooks/wallRuns';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** Where a door's frame+leaf go — the gap a `ConnectorRun`'s segments
 * leave, rendered separately by the caller (matches the old route's own
 * convention: `WallRunMesh` tiles the segments, it never places doors). */
export interface DoorGapPiece {
  key: string;
  connection: string;
  /** Frame placement — the gap's own center. */
  position: WorldPos;
  /** Leaf placement — one end of the gap (the leaf's local pivot sits at
   * one end, like every other door piece in this codebase — see
   * SyntyHexWall.tsx's own `edge.a`/`edge.mid` convention this mirrors). */
  leafPosition: WorldPos;
  rotationY: number;
}

export interface WallRunScene {
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
  doorGaps: DoorGapPiece[];
}

/**
 * This wire's own "odd-r" axial<->offset column, verified against the
 * real 224-cell reference-tomb fixture (see this file's module doc
 * comment) — NOT `wallRuns.ts`'s `hexColumn` (which is cube.x unchanged,
 * the OLD wire's "odd-q" convention's column).
 */
function authoredCol(cube: CubeCoord): number {
  return cube.x + Math.floor(cube.z / 2);
}

/** This wire's row is cube.z directly — verified against the fixture:
 * every chamber's raw z already spans a clean 0..7, no correction needed
 * (unlike `wallRuns.ts`'s own `hexRow`, which corrects ROW as a function
 * of column for the OLD wire's convention). */
function authoredRow(cube: CubeCoord): number {
  return cube.z;
}

/** Inverse of `authoredCol`/`authoredRow` — the cube coordinate at a given
 * (col, row), used to find the WORLD position of a chamber's geometric
 * corners/seam-line endpoints even when no real cell sits exactly there
 * (a seam's own midline is a fictional line BETWEEN two real columns). */
function cubeAtAuthoredColRow(col: number, row: number): CubeCoord {
  const z = row;
  const x = col - Math.floor(row / 2);
  const y = -x - z;
  return { x, y, z };
}

interface Bounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

function boundsOf(cubes: readonly CubeCoord[]): Bounds {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const cube of cubes) {
    const col = authoredCol(cube);
    const row = authoredRow(cube);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  return { minCol, maxCol, minRow, maxRow };
}

/** A stable, order-independent key for an unordered pair of hex
 * coordinates — used both to mark an edge as a chamber-separator (a
 * declared boundary or a doorway) and to look boundaries/doorways back up
 * by which two cells they sit between. */
function pairKey(a: CubeCoord, b: CubeCoord): string {
  const ka = coordToKey(a);
  const kb = coordToKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Chamber membership by connected-components: two floor cells are in the
 * same chamber iff hex-adjacent and NOT separated by a declared boundary
 * OR a doorway (a door joins two chambers; it does not merge them into
 * one for grouping purposes — see this file's module doc comment).
 */
function chamberComponents(
  cubes: readonly CubeCoord[],
  separators: ReadonlySet<string>
): CubeCoord[][] {
  const cellSet = new Map(cubes.map((c) => [coordToKey(c), c]));
  const visited = new Set<string>();
  const components: CubeCoord[][] = [];
  for (const [startKey, start] of cellSet) {
    if (visited.has(startKey)) continue;
    const comp: CubeCoord[] = [];
    const stack = [start];
    visited.add(startKey);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const neighbor of getHexNeighbors(cur)) {
        const nKey = coordToKey(neighbor);
        const real = cellSet.get(nKey);
        if (!real || visited.has(nKey)) continue;
        if (separators.has(pairKey(cur, real))) continue;
        visited.add(nKey);
        stack.push(real);
      }
    }
    components.push(comp);
  }
  return components;
}

function worldCorner(col: number, row: number, hexSize: number): WorldPos {
  return cubeToWorld(cubeAtAuthoredColRow(col, row), hexSize);
}

function midpoint(a: WorldPos, b: WorldPos): WorldPos {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function lerp(a: WorldPos, b: WorldPos, t: number): WorldPos {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * The four straight envelope runs for the WHOLE floor mask's outer edge
 * — one combined rectangle in (col, row) space, not one per chamber
 * (three side-by-side chambers' shared interior seams are the
 * `connectorRuns`, computed separately; only the TRUE outer boundary
 * becomes an envelope run here). Corners are closed by extending each
 * run to the other's own line's exact intersection plus a small overlap
 * margin — the same two-pass approach `wallRuns.ts`'s
 * `envelopeGeometryForRegion` uses (not reused directly: that function is
 * entangled with per-region connector suppression this wire has no need
 * of), reusing only the exported pure line-math it's built from.
 *
 * Offset axis is SWAPPED relative to `wallRuns.ts`'s own top/bottom vs
 * left/right split: under THIS wire's odd-r convention, a constant-ROW
 * line (this function's top/bottom sides) is a straight hex principal
 * direction with no zigzag (`worldX` is linear in q at fixed row —
 * verified), while a constant-COLUMN line (left/right) is the one with a
 * small per-row zigzag riding on the linear trend (the `floor(row/2)`
 * term). `wallRuns.ts`'s LARGER top/bottom default therefore belongs to
 * THIS function's left/right sides, and its smaller left/right default to
 * THIS function's top/bottom sides.
 */
function envelopeRunsForFloor(
  bounds: Bounds,
  hexSize: number,
  regionId: string
): EnvelopeRun[] {
  const { minCol, maxCol, minRow, maxRow } = bounds;
  const topLeft = worldCorner(minCol, minRow, hexSize);
  const topRight = worldCorner(maxCol, minRow, hexSize);
  const bottomLeft = worldCorner(minCol, maxRow, hexSize);
  const bottomRight = worldCorner(maxCol, maxRow, hexSize);
  const center: WorldPos = {
    x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
    z: (topLeft.z + topRight.z + bottomLeft.z + bottomRight.z) / 4,
  };

  const offsetTopBottom = DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES * hexSize;
  const offsetLeftRight = DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES * hexSize;

  const sides: Array<{
    side: EnvelopeSide;
    a: WorldPos;
    b: WorldPos;
    offset: number;
    cornerAtStart: string;
    cornerAtEnd: string;
  }> = [
    {
      side: 'top',
      a: topLeft,
      b: topRight,
      offset: offsetTopBottom,
      cornerAtStart: 'topLeft',
      cornerAtEnd: 'topRight',
    },
    {
      side: 'bottom',
      a: bottomLeft,
      b: bottomRight,
      offset: offsetTopBottom,
      cornerAtStart: 'bottomLeft',
      cornerAtEnd: 'bottomRight',
    },
    {
      side: 'left',
      a: topLeft,
      b: bottomLeft,
      offset: offsetLeftRight,
      cornerAtStart: 'topLeft',
      cornerAtEnd: 'bottomLeft',
    },
    {
      side: 'right',
      a: topRight,
      b: bottomRight,
      offset: offsetLeftRight,
      cornerAtStart: 'topRight',
      cornerAtEnd: 'bottomRight',
    },
  ];

  // Pass 1: zero-extension lines, purely to find each corner's exact
  // position via line-intersection (a line's position/direction don't
  // depend on how far a segment's endpoint reaches along it).
  const zeroExtBySide = new Map(
    sides.map(({ side, a, b, offset }) => [
      side,
      buildEnvelopeSegment(a, b, center, 0, 0, offset),
    ])
  );
  const cornerRaw: Record<string, WorldPos> = {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  };
  const cornerPairs: Array<{
    corner: string;
    sideA: EnvelopeSide;
    sideB: EnvelopeSide;
  }> = [
    { corner: 'topLeft', sideA: 'left', sideB: 'top' },
    { corner: 'topRight', sideA: 'right', sideB: 'top' },
    { corner: 'bottomLeft', sideA: 'left', sideB: 'bottom' },
    { corner: 'bottomRight', sideA: 'right', sideB: 'bottom' },
  ];
  const cornerPositions = new Map<string, WorldPos>();
  for (const { corner, sideA, sideB } of cornerPairs) {
    const runA = zeroExtBySide.get(sideA)!;
    const runB = zeroExtBySide.get(sideB)!;
    const dirA: WorldPos = {
      x: runA.end.x - runA.start.x,
      z: runA.end.z - runA.start.z,
    };
    const dirB: WorldPos = {
      x: runB.end.x - runB.start.x,
      z: runB.end.z - runB.start.z,
    };
    cornerPositions.set(
      corner,
      lineIntersection(runA.start, dirA, runB.start, dirB) ?? cornerRaw[corner]!
    );
  }

  // Pass 2: real runs, each endpoint extended to its own corner's exact
  // position plus a small overlap margin so perpendicular runs visually
  // close the joint.
  return sides.map(({ side, a, b, offset, cornerAtStart, cornerAtEnd }) => {
    const zeroExt = zeroExtBySide.get(side)!;
    const startExtension =
      distance(zeroExt.start, cornerPositions.get(cornerAtStart)!) +
      DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN;
    const endExtension =
      distance(zeroExt.end, cornerPositions.get(cornerAtEnd)!) +
      DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN;
    const built = buildEnvelopeSegment(
      a,
      b,
      center,
      startExtension,
      endExtension,
      offset
    );
    return { regionId, side, ...built };
  });
}

/**
 * boundariesToWallRuns is the module's one entry point: the declared
 * interior boundaries become straight connector runs (one per pair of
 * chambers they separate, split around that pair's doorway), and the
 * floor mask's own outer edge becomes four straight envelope runs.
 */
export function boundariesToWallRuns(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): WallRunScene {
  const cubes = atlas.cells.map(positionToCube);

  const separators = new Set<string>();
  const boundaryPairs: Array<{ from: CubeCoord; to: CubeCoord }> = [];
  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) continue;
    const from = positionToCube(b.from);
    const to = positionToCube(b.to);
    separators.add(pairKey(from, to));
    boundaryPairs.push({ from, to });
  }
  const doorways: Array<{
    from: CubeCoord;
    to: CubeCoord;
    connection: string;
  }> = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    const from = positionToCube(d.from);
    const to = positionToCube(d.to);
    separators.add(pairKey(from, to));
    doorways.push({ from, to, connection: d.connection });
  }

  const chambers = chamberComponents(cubes, separators);
  // Stable ordering (by minCol) so ids/left-right conventions don't
  // depend on Set/Map iteration order.
  const chamberInfos = chambers
    .map((cellsInChamber, index) => ({
      index,
      cells: cellsInChamber,
      bounds: boundsOf(cellsInChamber),
    }))
    .sort((a, b) => a.bounds.minCol - b.bounds.minCol)
    .map((info, orderedIndex) => ({ ...info, id: `chamber-${orderedIndex}` }));

  const chamberOf = new Map<string, (typeof chamberInfos)[number]>();
  for (const info of chamberInfos) {
    for (const cell of info.cells) {
      chamberOf.set(coordToKey(cell), info);
    }
  }
  const chamberCenter = (info: (typeof chamberInfos)[number]): WorldPos => {
    const { minCol, maxCol, minRow, maxRow } = info.bounds;
    const corners = [
      worldCorner(minCol, minRow, hexSize),
      worldCorner(maxCol, minRow, hexSize),
      worldCorner(minCol, maxRow, hexSize),
      worldCorner(maxCol, maxRow, hexSize),
    ];
    return {
      x: corners.reduce((s, c) => s + c.x, 0) / 4,
      z: corners.reduce((s, c) => s + c.z, 0) / 4,
    };
  };

  // Group declared boundaries by the unordered pair of chambers they
  // separate — one connector run per pair (the reference tomb's seams
  // never split into more than one contiguous run per pair; a dungeon
  // whose two chambers touch along more than one disjoint seam is out of
  // this function's scope for now).
  const rowsByPair = new Map<
    string,
    { a: string; b: string; rows: number[] }
  >();
  for (const { from, to } of boundaryPairs) {
    const chamberFrom = chamberOf.get(coordToKey(from));
    const chamberTo = chamberOf.get(coordToKey(to));
    if (!chamberFrom || !chamberTo || chamberFrom.id === chamberTo.id) continue;
    const [near, far] =
      chamberFrom.bounds.minCol <= chamberTo.bounds.minCol
        ? [chamberFrom, chamberTo]
        : [chamberTo, chamberFrom];
    const key = `${near.id}|${far.id}`;
    const entry = rowsByPair.get(key) ?? { a: near.id, b: far.id, rows: [] };
    entry.rows.push(authoredRow(from), authoredRow(to));
    rowsByPair.set(key, entry);
  }

  const doorwaysByPair = new Map<
    string,
    { from: CubeCoord; to: CubeCoord; connection: string }
  >();
  for (const d of doorways) {
    const chamberFrom = chamberOf.get(coordToKey(d.from));
    const chamberTo = chamberOf.get(coordToKey(d.to));
    if (!chamberFrom || !chamberTo || chamberFrom.id === chamberTo.id) continue;
    const [near, far] =
      chamberFrom.bounds.minCol <= chamberTo.bounds.minCol
        ? [chamberFrom, chamberTo]
        : [chamberTo, chamberFrom];
    doorwaysByPair.set(`${near.id}|${far.id}`, d);
  }

  const connectorRuns: ConnectorRun[] = [];
  const doorGaps: DoorGapPiece[] = [];

  for (const [key, { a: nearId, b: farId, rows }] of rowsByPair) {
    const near = chamberInfos.find((c) => c.id === nearId)!;
    const far = chamberInfos.find((c) => c.id === farId)!;
    const nearCol = near.bounds.maxCol;
    const farCol = far.bounds.minCol;
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);

    const topWorld = midpoint(
      worldCorner(nearCol, minRow, hexSize),
      worldCorner(farCol, minRow, hexSize)
    );
    const bottomWorld = midpoint(
      worldCorner(nearCol, maxRow, hexSize),
      worldCorner(farCol, maxRow, hexSize)
    );
    const dir = unitDirection(topWorld, bottomWorld);
    const rotationY = Math.atan2(-dir.z, dir.x);
    const facing = unitDirection(chamberCenter(near), chamberCenter(far));
    const runLength = distance(topWorld, bottomWorld);

    const doorway = doorwaysByPair.get(key);
    const segments: WallRunSegment[] = [];
    if (!doorway || runLength === 0) {
      segments.push({ start: topWorld, end: bottomWorld });
    } else {
      const doorRow = (authoredRow(doorway.from) + authoredRow(doorway.to)) / 2;
      const t =
        maxRow === minRow ? 0.5 : (doorRow - minRow) / (maxRow - minRow);
      const doorCenter = lerp(topWorld, bottomWorld, t);
      const halfGap = DOOR_FRAME_CALIBRATED_WIDTH / 2;
      const gapStart = {
        x: doorCenter.x - dir.x * halfGap,
        z: doorCenter.z - dir.z * halfGap,
      };
      const gapEnd = {
        x: doorCenter.x + dir.x * halfGap,
        z: doorCenter.z + dir.z * halfGap,
      };
      if (distance(topWorld, gapStart) > 1e-6) {
        segments.push({ start: topWorld, end: gapStart });
      }
      if (distance(gapEnd, bottomWorld) > 1e-6) {
        segments.push({ start: gapEnd, end: bottomWorld });
      }
      doorGaps.push({
        key: doorway.connection || key,
        connection: doorway.connection,
        position: doorCenter,
        leafPosition: gapStart,
        rotationY,
      });
    }

    connectorRuns.push({
      doorId: doorway?.connection,
      regionAId: nearId,
      regionBId: farId,
      segments,
      coveredRows: { minRow, maxRow },
      facing,
    });
  }

  const combinedBounds = boundsOf(cubes);
  const envelopeRuns = envelopeRunsForFloor(combinedBounds, hexSize, 'tomb');

  return { envelopeRuns, connectorRuns, doorGaps };
}
