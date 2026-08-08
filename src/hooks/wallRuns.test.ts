/**
 * Tests for wallRuns — W1 of the dungeon-walls redesign (rpg-project#133,
 * design.md/plan.md). Two fixtures per plan.md's W1 acceptance criteria:
 *
 * - referenceTombFixture: shaped exactly like the REAL, live-authored
 *   reference-tomb dungeon (rpg-api's internal/content/dungeons/
 *   reference-tomb.yaml — entrance width 6, hall/chamber width 10, tomb/
 *   boss width 12, height 8, hall->tomb locked). Region widths/height and
 *   the col/row->cube transform are cross-checked directly against real
 *   compiled output in rpg-api's
 *   TestStartEncounter_ContentBackedKey_ReferenceTomb (placed props/
 *   monsters at their exact absolute cells) — not a hand-derived guess.
 * - bossRoomFixture: a boss-archetype-shaped region. The module never
 *   reads wall/blocking data at all (only hex membership), so this
 *   exercises the "deliberately open full-width doorRow must NOT produce
 *   gaps in the envelope" invariant (rpg-toolkit#819) by construction,
 *   independent of whatever the wire's wall list would say.
 */

import {
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import { describe, expect, it } from 'vitest';
import {
  REAL_LOOK_LAB_DOORS,
  REAL_LOOK_LAB_GALLERY_REVEALED_HEXES,
  REAL_LOOK_LAB_STAGED_REVEALED_HEXES,
} from './lookLabRealWireFixture';
import {
  computeWallRuns,
  cubeAtColRow,
  hexColumn,
  hexRow,
  type RegionInput,
} from './wallRuns';

/** Every hex in a width x height rectangle starting at column offsetX,
 * row 0 — exactly how rpg-toolkit's InitDungeon lays out one region
 * (`regionCubes(r.Width, params.Height, starts[i])`, encounter/dungeon.go).
 * Rebuilding it here via the SAME col/row->cube transform this module
 * exposes (cubeAtColRow) is the correct fixture-construction strategy: the
 * module under test is verified against independent ground truth
 * separately (see the "toolkit ground truth" describe block below); this
 * helper just needs to produce data SHAPED like the real wire would
 * (a full rectangular region hex set), which any correct col/row->cube
 * transform does identically. */
function regionCubes(
  width: number,
  height: number,
  offsetX: number
): CubeCoord[] {
  const hexes: CubeCoord[] = [];
  for (let col = offsetX; col < offsetX + width; col++) {
    for (let row = 0; row < height; row++) {
      hexes.push(cubeAtColRow(col, row));
    }
  }
  return hexes;
}

/** Every hex in an INCLUSIVE [minCol, maxCol] column range — for
 * constructing a PARTIAL reveal window of a region (a slice of its own
 * true column extent), unlike `regionCubes` above (always starts at the
 * region's own true left edge). Needed for the adjacency-gate regression
 * fixtures below: a partial reveal that does NOT reach either of a
 * region's true edges. */
function colRangeCubes(
  minCol: number,
  maxCol: number,
  height: number
): CubeCoord[] {
  const hexes: CubeCoord[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = 0; row < height; row++) {
      hexes.push(cubeAtColRow(col, row));
    }
  }
  return hexes;
}

const HEIGHT = 8;
const DOOR_ROW = 4; // height / 2, per rpg-toolkit's generateDungeonLayout

// Real reference-tomb widths (internal/content/dungeons/reference-tomb.yaml):
// entrance(6) -> hall(10) -> tomb(12), each +1 column reserved as connector.
const ENTRANCE_WIDTH = 6;
const HALL_WIDTH = 10;
const TOMB_WIDTH = 12;
const ENTRANCE_START = 0;
const HALL_START = ENTRANCE_START + ENTRANCE_WIDTH + 1; // 7
const TOMB_START = HALL_START + HALL_WIDTH + 1; // 18

function referenceTombFixture(): {
  regions: RegionInput[];
  doorEntranceHallCol: number;
  doorHallTombCol: number;
} {
  const regions: RegionInput[] = [
    {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, ENTRANCE_START),
    },
    { id: 'hall', hexes: regionCubes(HALL_WIDTH, HEIGHT, HALL_START) },
    { id: 'tomb', hexes: regionCubes(TOMB_WIDTH, HEIGHT, TOMB_START) },
  ];
  return {
    regions,
    doorEntranceHallCol: ENTRANCE_START + ENTRANCE_WIDTH, // 6
    doorHallTombCol: HALL_START + HALL_WIDTH, // 17
  };
}

describe('toolkit ground truth (hexColumn/hexRow/cubeAtColRow)', () => {
  // Pinned directly against rpg-api's TestStartEncounter_ContentBackedKey_
  // ReferenceTomb — real compiled absolute cells for the reference-tomb
  // dungeon (seed 42), not derived from this module. If this formula ever
  // silently diverges from the toolkit's real offset<->cube transform,
  // these must fail loudly.

  it('brazier at entrance local (1,1), offsetX=0 -> Hex{Q:1,R:-2,S:1}', () => {
    const hex = cubeAtColRow(1 + ENTRANCE_START, 1);
    expect(hex).toEqual({ x: 1, y: -2, z: 1 });
  });

  it('pillars at hall local col 2/6 (offsetX=7) land on the real compiled columns 9/13, with the real compiled z set at each column', () => {
    // Real compiled results (rpg-api test): pillars at
    // {Q:9,R:-10,S:1}, {Q:9,R:-7,S:-2}, {Q:13,R:-9,S:-4}, {Q:13,R:-12,S:-1}
    // — local rows 2 and 5 at local columns 2 and 6.
    const col9row2 = cubeAtColRow(2 + HALL_START, 2);
    const col9row5 = cubeAtColRow(2 + HALL_START, 5);
    expect(col9row2.x).toBe(9);
    expect(col9row5.x).toBe(9);
    expect(new Set([col9row2.z, col9row5.z])).toEqual(new Set([1, -2]));

    const col13row2 = cubeAtColRow(6 + HALL_START, 2);
    const col13row5 = cubeAtColRow(6 + HALL_START, 5);
    expect(col13row2.x).toBe(13);
    expect(col13row5.x).toBe(13);
    expect(new Set([col13row2.z, col13row5.z])).toEqual(new Set([-4, -1]));
  });

  it('entrance->hall connector door (col 6, doorRow 4) -> Hex{Q:6,R:-7,S:1}', () => {
    expect(cubeAtColRow(ENTRANCE_START + ENTRANCE_WIDTH, DOOR_ROW)).toEqual({
      x: 6,
      y: -7,
      z: 1,
    });
  });

  it('hall->tomb connector door (col 17, doorRow 4) -> Hex{Q:17,R:-13,S:-4}', () => {
    expect(cubeAtColRow(HALL_START + HALL_WIDTH, DOOR_ROW)).toEqual({
      x: 17,
      y: -13,
      z: -4,
    });
  });

  it('hexColumn/hexRow round-trip through cubeAtColRow for a range of columns (even and odd parity)', () => {
    for (let col = 0; col < 20; col++) {
      for (let row = 0; row < HEIGHT; row++) {
        const hex = cubeAtColRow(col, row);
        expect(hex.x + hex.y + hex.z).toBe(0); // cube invariant
        expect(hexColumn(hex)).toBe(col);
        expect(hexRow(hex)).toBe(row);
      }
    }
  });
});

describe('computeWallRuns — reference-tomb-shaped fixture (3 rooms, 2 connectors, shared doorRow, locked door)', () => {
  it('produces exactly 4 envelope runs per region, one per side', () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    expect(result.envelopeRuns).toHaveLength(regions.length * 4);
    for (const region of regions) {
      const sidesForRegion = result.envelopeRuns
        .filter((r) => r.regionId === region.id)
        .map((r) => r.side);
      expect(new Set(sidesForRegion)).toEqual(
        new Set(['left', 'right', 'top', 'bottom'])
      );
    }
  });

  it("hall's left/right envelope runs sit at the room's true corner world positions with extension/offset zeroed, and shift outward by exactly the configured envelopeOffsetLeftRight otherwise (gate review finding 5, rpg-dnd5e-web#603 — real positions, not just dist > 0)", () => {
    const { regions } = referenceTombFixture();
    const topLeft = cubeToWorld(cubeAtColRow(HALL_START, 0), HEX_SIZE);
    const bottomLeft = cubeToWorld(
      cubeAtColRow(HALL_START, HEIGHT - 1),
      HEX_SIZE
    );
    const topRight = cubeToWorld(
      cubeAtColRow(HALL_START + HALL_WIDTH - 1, 0),
      HEX_SIZE
    );
    const bottomRight = cubeToWorld(
      cubeAtColRow(HALL_START + HALL_WIDTH - 1, HEIGHT - 1),
      HEX_SIZE
    );

    // Zero-tolerance exact match, isolating "did it find the true
    // column/row extent" from the offset/corner-overlap dials entirely.
    // Round-2 W3/W4 finding: envelope runs' endpoints now extend to
    // reach their own corner's EXACT position (computed from BOTH
    // adjacent sides' own offset lines), so top/bottom's offset must
    // also be zeroed here — otherwise the corner itself sits away from
    // the raw hex corner (pulled by top/bottom's own nonzero offset),
    // and reaching it exactly would no longer land left/right's endpoint
    // on the raw point either. This coupling (a side's endpoint position
    // depending on the ADJACENT side's offset too) is intentional and new
    // this round — see envelopeCornerOverlapMargin's own doc comment.
    const zeroed = computeWallRuns({
      regions,
      doors: [],
      envelopeOffsetLeftRight: 0,
      envelopeOffsetTopBottom: 0,
      envelopeCornerOverlapMargin: 0,
    });
    const hallLeftZeroed = zeroed.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallRightZeroed = zeroed.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    )!;
    expect(hallLeftZeroed.start).toEqual(topLeft);
    expect(hallLeftZeroed.end).toEqual(bottomLeft);
    expect(hallRightZeroed.start).toEqual(topRight);
    expect(hallRightZeroed.end).toEqual(bottomRight);

    // Nonzero offset: both sides translate outward (away from hall's own
    // center) by EXACTLY `envelopeOffsetLeftRight` world units — a real
    // check of magnitude, not merely "distance > 0" (which holds for any
    // output). Top/bottom offset and the corner-overlap margin stay
    // zeroed so only left/right's own offset contributes to the shift.
    const envelopeOffsetLeftRight = 1.23;
    const offsetResult = computeWallRuns({
      regions,
      doors: [],
      envelopeOffsetLeftRight,
      envelopeOffsetTopBottom: 0,
      envelopeCornerOverlapMargin: 0,
    });
    const hallLeftOffset = offsetResult.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallRightOffset = offsetResult.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    )!;
    // Round-2 W3/W4 finding: with the corner-overlap margin zeroed, an
    // endpoint's distance from the raw corner still isn't PURELY the
    // offset — reaching the corner's own (offset-shifted) exact
    // intersection point adds a small second-order distance ALONG the
    // line too (since 'left's line shifting outward moves where it
    // crosses 'top's un-shifted line). Perpendicular distance from the
    // raw point to the run's LINE isolates the offset cleanly: offset
    // shifts the whole line; reaching-the-corner only moves the endpoint
    // ALONG that already-shifted line, which doesn't change how far the
    // raw point sits from the line itself.
    const perpDistanceToLine = (
      point: WorldPos,
      lineStart: WorldPos,
      lineEnd: WorldPos
    ): number => {
      const dir = { x: lineEnd.x - lineStart.x, z: lineEnd.z - lineStart.z };
      const len = Math.hypot(dir.x, dir.z);
      const toPoint = { x: point.x - lineStart.x, z: point.z - lineStart.z };
      return Math.abs(dir.x * toPoint.z - dir.z * toPoint.x) / len;
    };
    const leftShift = perpDistanceToLine(
      topLeft,
      hallLeftOffset.start,
      hallLeftOffset.end
    );
    const rightShift = perpDistanceToLine(
      topRight,
      hallRightOffset.start,
      hallRightOffset.end
    );
    expect(leftShift).toBeCloseTo(envelopeOffsetLeftRight, 9);
    expect(rightShift).toBeCloseTo(envelopeOffsetLeftRight, 9);
  });

  it('boundary columns adjacent to a connector never get their own envelope side there (no side triples up)', () => {
    // Sanity: every region still reports EXACTLY 4 sides even though two
    // of hall's neighbors are connectors, not open space — the envelope
    // is purely a function of the region's own hex membership.
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const hallSides = result.envelopeRuns.filter((r) => r.regionId === 'hall');
    expect(hallSides).toHaveLength(4);
  });

  it('identifies each connector by its own two adjacent regions, independent of door array order', () => {
    const { regions, doorEntranceHallCol, doorHallTombCol } =
      referenceTombFixture();
    // Deliberately reversed order + non-position-sorted ids, matching the
    // real wire's "doors sorted by id, not by position" behavior.
    const doors = [
      {
        id: 'door-hall-tomb',
        position: cubeAtColRow(doorHallTombCol, DOOR_ROW),
      },
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({ regions, doors });
    expect(result.connectorRuns).toHaveLength(2);

    const byDoorId = new Map(result.connectorRuns.map((r) => [r.doorId, r]));
    const entranceHall = byDoorId.get('door-entrance-hall');
    const hallTomb = byDoorId.get('door-hall-tomb');
    expect(entranceHall).toMatchObject({
      regionAId: 'entrance',
      regionBId: 'hall',
    });
    expect(hallTomb).toMatchObject({ regionAId: 'hall', regionBId: 'tomb' });
  });

  it('locked door (hall->tomb) still splits its connector into two segments around the door gap — lock state is not this module’s concern', () => {
    const { regions, doorHallTombCol } = referenceTombFixture();
    const doors = [
      {
        id: 'hall-tomb-locked',
        position: cubeAtColRow(doorHallTombCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({ regions, doors });
    expect(result.connectorRuns).toHaveLength(1);
    // doorRow=4 is strictly between minRow=0 and maxRow=7 -> both segments exist.
    expect(result.connectorRuns[0]!.segments).toHaveLength(2);
  });

  it('every connector run has exactly two segments split around the door row (shared doorRow=4, minRow=0, maxRow=7)', () => {
    const { regions, doorEntranceHallCol, doorHallTombCol } =
      referenceTombFixture();
    const doors = [
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
      {
        id: 'door-hall-tomb',
        position: cubeAtColRow(doorHallTombCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({ regions, doors });
    for (const run of result.connectorRuns) {
      expect(run.segments).toHaveLength(2);
    }
  });

  it('a door with no adjacent region pair on both sides is skipped, not thrown', () => {
    const { regions } = referenceTombFixture();
    const strayDoor = { id: 'stray', position: cubeAtColRow(999, DOOR_ROW) };
    const result = computeWallRuns({ regions, doors: [strayDoor] });
    expect(result.connectorRuns).toHaveLength(0);
  });

  it('pins both connector segments to the exact connector column and keeps the door cell clear of both (gate review finding 6, rpg-dnd5e-web#603)', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const doors = [
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({ regions, doors, cornerExtension: 0 });
    const run = result.connectorRuns[0]!;
    expect(run.segments).toHaveLength(2);

    const columnTop = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, 0),
      HEX_SIZE
    );
    const columnBottom = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, HEIGHT - 1),
      HEX_SIZE
    );
    const columnDir = {
      x: columnBottom.x - columnTop.x,
      z: columnBottom.z - columnTop.z,
    };
    // 2D cross product ~= 0 iff `p` is collinear with the column line
    // through columnTop/columnBottom — every segment endpoint must sit
    // exactly on the connector's own column, never drifted onto some
    // other column.
    const crossZ = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      a.x * b.z - a.z * b.x;
    for (const segment of run.segments) {
      for (const point of [segment.start, segment.end]) {
        const toPoint = { x: point.x - columnTop.x, z: point.z - columnTop.z };
        expect(Math.abs(crossZ(columnDir, toPoint))).toBeLessThan(1e-9);
      }
    }

    // The door cell's own world position must fall outside BOTH segments'
    // [start, end] span along the column line — never covered.
    const doorWorld = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      HEX_SIZE
    );
    for (const segment of run.segments) {
      const segLen = Math.hypot(
        segment.end.x - segment.start.x,
        segment.end.z - segment.start.z
      );
      const segDir = {
        x: (segment.end.x - segment.start.x) / segLen,
        z: (segment.end.z - segment.start.z) / segLen,
      };
      const toDoor = {
        x: doorWorld.x - segment.start.x,
        z: doorWorld.z - segment.start.z,
      };
      const along = toDoor.x * segDir.x + toDoor.z * segDir.z;
      expect(along < 0 || along > segLen).toBe(true);
    }
  });
});

describe('computeWallRuns — envelope offset door clearance (round-2 W3/W4 regression, Kirk\'s live walk: "a wall going through the door")', () => {
  // Direct regression for the root cause: a single envelopeOffset applied
  // uniformly to all 4 sides pushed a room's own left/right envelope line
  // far enough outward to cross the door cell on its neighboring connector
  // (measured exactly at the OLD default, sqrt(3) hex radii: the signed
  // perpendicular distance from the door cell to the room's own left/right
  // line flips sign relative to the safe default — the wall's line has
  // swept PAST the door cell instead of stopping short of it). This test
  // pins the DEFAULT (unspecified) envelopeOffsetLeftRight to the safe
  // side of that line for both connectors in the reference-tomb fixture,
  // with a numeric margin, not just "some distance > 0".
  const perpDistance = (
    point: { x: number; z: number },
    lineA: { x: number; z: number },
    lineB: { x: number; z: number }
  ): number => {
    const dir = { x: lineB.x - lineA.x, z: lineB.z - lineA.z };
    const len = Math.hypot(dir.x, dir.z);
    const toPoint = { x: point.x - lineA.x, z: point.z - lineA.z };
    return (dir.x * toPoint.z - dir.z * toPoint.x) / len;
  };

  // Safe margin: comfortably below the exact measured safe value (0.5
  // world units at the current defaults) and comfortably above the
  // measured UNSAFE magnitude the old sqrt(3)-everywhere default produced
  // (0.232, with the sign flipped into "crossed" territory) — a
  // regression that shrinks the margin OR flips the sign trips this.
  const SAFE_MARGIN = 0.35;

  it('entrance-hall connector: the door cell stays on the safe (uncrossed) side of BOTH neighboring rooms’ own envelope lines, by a safe margin', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const doorWorld = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      HEX_SIZE
    );
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const entranceRight = result.envelopeRuns.find(
      (r) => r.regionId === 'entrance' && r.side === 'right'
    )!;
    expect(
      perpDistance(doorWorld, hallLeft.start, hallLeft.end)
    ).toBeGreaterThan(SAFE_MARGIN);
    expect(
      perpDistance(doorWorld, entranceRight.start, entranceRight.end)
    ).toBeLessThan(-SAFE_MARGIN);
  });

  it('hall-tomb connector: the door cell stays on the safe (uncrossed) side of BOTH neighboring rooms’ own envelope lines, by a safe margin', () => {
    const { regions, doorHallTombCol } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const doorWorld = cubeToWorld(
      cubeAtColRow(doorHallTombCol, DOOR_ROW),
      HEX_SIZE
    );
    const hallRight = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    )!;
    const tombLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'tomb' && r.side === 'left'
    )!;
    expect(
      perpDistance(doorWorld, hallRight.start, hallRight.end)
    ).toBeLessThan(-SAFE_MARGIN);
    expect(
      perpDistance(doorWorld, tombLeft.start, tombLeft.end)
    ).toBeGreaterThan(SAFE_MARGIN);
  });

  it('reproduces the bug: reverting to a single sqrt(3) offset shared across all sides flips the door cell onto the crossed side (proves the test above is not vacuous)', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const buggy = computeWallRuns({
      regions,
      doors: [],
      envelopeOffsetLeftRight: Math.sqrt(3), // the old, since-replaced uniform default
    });
    const doorWorld = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      HEX_SIZE
    );
    const hallLeftBuggy = buggy.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    // Sign flipped negative relative to the safe default's positive value
    // above — the wall line has swept past the door cell.
    expect(
      perpDistance(doorWorld, hallLeftBuggy.start, hallLeftBuggy.end)
    ).toBeLessThan(0);
  });
});

describe('computeWallRuns — partial reveal (gate review finding 1, rpg-dnd5e-web#603): region hex membership is per-viewer reveal-gated, not the whole room', () => {
  it('still resolves the connector when the neighboring region has NOT yet revealed the column immediately beside the door — the exact-adjacency check this replaces would have failed here', () => {
    const { doorEntranceHallCol } = referenceTombFixture();
    const entrance: RegionInput = {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, ENTRANCE_START),
    };
    // Hall's revealed columns start at 12, not its true near column (7) —
    // only the far half of the room has been seen so far.
    const partialHall: RegionInput = {
      id: 'hall',
      hexes: regionCubes(HALL_WIDTH - 5, HEIGHT, HALL_START + 5),
    };
    const doors = [
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({
      regions: [entrance, partialHall],
      doors,
    });
    expect(result.connectorRuns).toHaveLength(1);
    expect(result.connectorRuns[0]).toMatchObject({
      regionAId: 'entrance',
      regionBId: 'hall',
    });
  });

  it('picks the NEAREST region on each side, not just any region past the door column, when a 3+ room chain has multiple candidates', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    // Entrance is fully known; hall is only partially known (cols 12-16,
    // still nearer to the door than tomb's cols 18-29) alongside a fully
    // known tomb — the door must pair with hall, not tomb, even though
    // both satisfy "minCol > doorCol."
    const partialHall: RegionInput = {
      id: 'hall',
      hexes: regionCubes(HALL_WIDTH - 5, HEIGHT, HALL_START + 5),
    };
    const tomb = regions.find((r) => r.id === 'tomb')!;
    const entrance = regions.find((r) => r.id === 'entrance')!;
    const doors = [
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({
      regions: [entrance, partialHall, tomb],
      doors,
    });
    expect(result.connectorRuns).toHaveLength(1);
    expect(result.connectorRuns[0]).toMatchObject({
      regionAId: 'entrance',
      regionBId: 'hall',
    });
  });

  it("coveredRows reflects only the currently-known row bounds (the union of both sides), not the room's true full height — accepted v1 fog behavior (gate review finding 2), never asserting the frontier is wrong", () => {
    const { doorEntranceHallCol } = referenceTombFixture();
    // Entrance has only revealed rows 0-2 so far; hall is fully revealed
    // (rows 0-7). The union takes hall's fuller extent even though
    // entrance's OWN reveal hasn't caught up — whichever side has
    // explored further governs, matching the envelope's own frontier-
    // tracking (design.md's accepted v1 behavior).
    const partialEntrance: RegionInput = {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, 3, ENTRANCE_START),
    };
    const fullHall: RegionInput = {
      id: 'hall',
      hexes: regionCubes(HALL_WIDTH, HEIGHT, HALL_START),
    };
    const doors = [
      {
        id: 'door-entrance-hall',
        position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
      },
    ];
    const result = computeWallRuns({
      regions: [partialEntrance, fullHall],
      doors,
    });
    expect(result.connectorRuns).toHaveLength(1);
    expect(result.connectorRuns[0]!.coveredRows).toEqual({
      minRow: 0,
      maxRow: HEIGHT - 1,
    });
  });
});

describe('computeWallRuns — boss-room fixture (full-width open doorRow must NOT produce envelope gaps)', () => {
  // rpg-toolkit#819: a boss-archetype region's entire doorRow is
  // deliberately left clear across its full width (stripReservedAxisWalls,
  // encounter/dungeon.go) — the wire's wall list has NO wall data on that
  // row at all. This module never reads wall/blocking data for envelope
  // computation (only region hex membership), so it must produce a
  // complete, unbroken 4-sided envelope regardless — there is structurally
  // no code path here that could punch a hole for an "open" row.
  const BOSS_WIDTH = 9; // > 6, satisfying the boss primary-axis floor
  const bossRegion: RegionInput = {
    id: 'boss-room',
    hexes: regionCubes(BOSS_WIDTH, HEIGHT, 0),
  };

  it("produces exactly 4 unbroken envelope sides, each landing EXACTLY on the room's true corner world positions with extension/offset zeroed (gate review finding 5, rpg-dnd5e-web#603 — a real position check, not tautological 'start/end are defined', which EnvelopeRun's non-optional typing makes true for any implementation)", () => {
    const result = computeWallRuns({
      regions: [bossRegion],
      doors: [],
      envelopeOffsetTopBottom: 0,
      envelopeOffsetLeftRight: 0,
      envelopeCornerOverlapMargin: 0,
    });
    expect(result.envelopeRuns).toHaveLength(4);

    const topLeft = cubeToWorld(cubeAtColRow(0, 0), HEX_SIZE);
    const topRight = cubeToWorld(cubeAtColRow(BOSS_WIDTH - 1, 0), HEX_SIZE);
    const bottomLeft = cubeToWorld(cubeAtColRow(0, HEIGHT - 1), HEX_SIZE);
    const bottomRight = cubeToWorld(
      cubeAtColRow(BOSS_WIDTH - 1, HEIGHT - 1),
      HEX_SIZE
    );

    const left = result.envelopeRuns.find((r) => r.side === 'left')!;
    const right = result.envelopeRuns.find((r) => r.side === 'right')!;
    const top = result.envelopeRuns.find((r) => r.side === 'top')!;
    const bottom = result.envelopeRuns.find((r) => r.side === 'bottom')!;

    // Exact equality holds here specifically because extension/offset are
    // zeroed — this isolates "did it find the true corners of a region
    // whose doorRow is wide open" from the separately-tested extension/
    // offset dial. A hypothetical bug that punched a doorRow gap (split
    // top/bottom into two segments, or shifted an endpoint toward the
    // room's interior) would fail this exact match; the deliberately
    // fully-open doorRow this fixture exercises never does, because
    // envelope derivation reads only hex membership, never wall data.
    expect(left.start).toEqual(topLeft);
    expect(left.end).toEqual(bottomLeft);
    expect(right.start).toEqual(topRight);
    expect(right.end).toEqual(bottomRight);
    expect(top.start).toEqual(topLeft);
    expect(top.end).toEqual(topRight);
    expect(bottom.start).toEqual(bottomLeft);
    expect(bottom.end).toEqual(bottomRight);
  });

  it('top/bottom span length equals the true corner-to-corner distance plus exactly 2x envelopeCornerOverlapMargin — an exact expected value, not just a >= inequality that any non-shrinking implementation would satisfy', () => {
    // Round-2 W3/W4 finding: envelope corners now reach their own exact
    // intersection point (0 extra distance when offsets are zeroed, since
    // the corner then coincides with the raw hex corner) plus this small
    // overlap margin — cornerExtension (still a real input) no longer
    // affects envelope runs at all, only connector runs.
    const envelopeCornerOverlapMargin = 0.37;
    const result = computeWallRuns({
      regions: [bossRegion],
      doors: [],
      envelopeCornerOverlapMargin,
      // envelopeOffset only translates both endpoints by the same
      // vector, so it never affects span length — 0 keeps this test
      // focused on the corner-overlap margin alone.
      envelopeOffsetTopBottom: 0,
      envelopeOffsetLeftRight: 0,
    });
    const top = result.envelopeRuns.find((r) => r.side === 'top')!;
    const bottom = result.envelopeRuns.find((r) => r.side === 'bottom')!;

    const leftCornerWorld = cubeToWorld(cubeAtColRow(0, 0), HEX_SIZE);
    const rightCornerWorld = cubeToWorld(
      cubeAtColRow(BOSS_WIDTH - 1, 0),
      HEX_SIZE
    );
    const fullSpan = Math.hypot(
      rightCornerWorld.x - leftCornerWorld.x,
      rightCornerWorld.z - leftCornerWorld.z
    );
    const topSpan = Math.hypot(
      top.end.x - top.start.x,
      top.end.z - top.start.z
    );
    const bottomSpan = Math.hypot(
      bottom.end.x - bottom.start.x,
      bottom.end.z - bottom.start.z
    );
    expect(topSpan).toBeCloseTo(fullSpan + 2 * envelopeCornerOverlapMargin, 9);
    expect(bottomSpan).toBeCloseTo(
      fullSpan + 2 * envelopeCornerOverlapMargin,
      9
    );
  });
});

describe('computeWallRuns — envelope corners (W3, PR-B: Kirk\'s #1 prod-screenshot defect — "placeholder butt-joins visibly don\'t meet at room corners")', () => {
  it('produces exactly 4 corners per region, one per corner label', () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    expect(result.envelopeCorners).toHaveLength(regions.length * 4);
    for (const region of regions) {
      const labelsForRegion = result.envelopeCorners
        .filter((c) => c.regionId === region.id)
        .map((c) => c.corner);
      expect(new Set(labelsForRegion)).toEqual(
        new Set(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])
      );
    }
  });

  it("with envelopeOffset zeroed, each corner lands exactly on the region's true (un-offset) corner world position", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({
      regions,
      doors: [],
      envelopeOffsetTopBottom: 0,
      envelopeOffsetLeftRight: 0,
    });
    const hallTopLeft = cubeToWorld(cubeAtColRow(HALL_START, 0), HEX_SIZE);
    const hallTopLeftCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;
    expect(hallTopLeftCorner.position).toEqual(hallTopLeft);
  });

  it("the two sides sharing a corner are NOT assumed to meet at exactly 90 degrees (regression for an earlier flawed derivation): the reference-tomb hall's 'left'/'top' angle measures ~93.7 degrees, since real room widths (6/10/12) give an ODD column span (width - 1), not even", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const left = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const top = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'top'
    )!;
    const leftDir = {
      x: left.end.x - left.start.x,
      z: left.end.z - left.start.z,
    };
    const topDir = { x: top.end.x - top.start.x, z: top.end.z - top.start.z };
    const leftLen = Math.hypot(leftDir.x, leftDir.z);
    const topLen = Math.hypot(topDir.x, topDir.z);
    const cosAngle =
      (leftDir.x * topDir.x + leftDir.z * topDir.z) / (leftLen * topLen);
    // Deliberately NOT close to 0 (perpendicular) — documents that the
    // corner computation below must not assume a fixed angle.
    expect(Math.abs(cosAngle)).toBeGreaterThan(0.01);
  });

  it("the topLeft corner sits exactly on BOTH adjacent (offset+extended) sides' own lines — the precise regression for the prod-screenshot gap/overlap defect, verified by genuine collinearity rather than any assumed angle", () => {
    const { regions } = referenceTombFixture();
    const envelopeOffset = 1.23;
    const result = computeWallRuns({
      regions,
      doors: [],
      cornerExtension: 0,
      envelopeOffsetTopBottom: envelopeOffset,
      envelopeOffsetLeftRight: envelopeOffset,
    });
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallTop = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'top'
    )!;
    const hallTopLeftCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;

    // A point P lies on the line through A with direction D iff the 2D
    // cross product of D and (P - A) is ~0 — independent of any assumed
    // angle between the two sides, so this verifies the actual
    // "no gap, no overlap" property Kirk's screenshot flagged.
    const crossZ = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      a.x * b.z - a.z * b.x;
    const onLine = (
      point: { x: number; z: number },
      lineStart: { x: number; z: number },
      lineEnd: { x: number; z: number }
    ) => {
      const dir = { x: lineEnd.x - lineStart.x, z: lineEnd.z - lineStart.z };
      const toPoint = {
        x: point.x - lineStart.x,
        z: point.z - lineStart.z,
      };
      return Math.abs(crossZ(dir, toPoint));
    };
    expect(
      onLine(hallTopLeftCorner.position, hallLeft.start, hallLeft.end)
    ).toBeLessThan(1e-9);
    expect(
      onLine(hallTopLeftCorner.position, hallTop.start, hallTop.end)
    ).toBeLessThan(1e-9);
  });

  it("a corner's rotationY points strictly outward from the room center (stepping along it increases distance from center)", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({
      regions,
      doors: [],
      envelopeOffsetTopBottom: 1.0,
      envelopeOffsetLeftRight: 1.0,
    });
    const hallCenterCol =
      ENTRANCE_START + ENTRANCE_WIDTH + 1 + (HALL_WIDTH - 1) / 2;
    const hallCenter = cubeToWorld(
      cubeAtColRow(Math.round(hallCenterCol), Math.round((HEIGHT - 1) / 2)),
      HEX_SIZE
    );
    for (const corner of result.envelopeCorners.filter(
      (c) => c.regionId === 'hall'
    )) {
      const distBefore = Math.hypot(
        corner.position.x - hallCenter.x,
        corner.position.z - hallCenter.z
      );
      const eps = 0.01;
      const stepped = {
        x: corner.position.x + Math.cos(corner.rotationY) * eps,
        z: corner.position.z - Math.sin(corner.rotationY) * eps,
      };
      const distAfter = Math.hypot(
        stepped.x - hallCenter.x,
        stepped.z - hallCenter.z
      );
      expect(distAfter).toBeGreaterThan(distBefore);
    }
  });

  it('an empty region list produces no corners', () => {
    const result = computeWallRuns({ regions: [], doors: [] });
    expect(result.envelopeCorners).toHaveLength(0);
  });

  it('each corner-adjacent endpoint sits EXACTLY envelopeCornerOverlapMargin past the true corner intersection — not a flat hex-radii guess (round-2 W3/W4 regression: "trim the corner overshoot", superseding the first-attempt flat cornerExtension bump that overshot at some corners while barely reaching others)', () => {
    const { regions } = referenceTombFixture();
    const margin = 0.2;
    const result = computeWallRuns({
      regions,
      doors: [],
      envelopeCornerOverlapMargin: margin,
    });
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallTop = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'top'
    )!;
    const hallTopLeftCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;

    // hall's 'left' and 'top' sides meet at ~93.7 degrees (verified in the
    // test above, not 90) — a flat distance applied to both would overshoot
    // one and undershoot the other. Each side's own endpoint distance from
    // the SAME shared corner is exactly the margin regardless.
    expect(
      Math.hypot(
        hallLeft.start.x - hallTopLeftCorner.position.x,
        hallLeft.start.z - hallTopLeftCorner.position.z
      )
    ).toBeCloseTo(margin, 9);
    expect(
      Math.hypot(
        hallTop.start.x - hallTopLeftCorner.position.x,
        hallTop.start.z - hallTopLeftCorner.position.z
      )
    ).toBeCloseTo(margin, 9);
  });

  it('with envelopeCornerOverlapMargin zeroed, a corner-adjacent endpoint lands EXACTLY on the corner — a hairline seam, never a gap, even with zero margin', () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({
      regions,
      doors: [],
      envelopeCornerOverlapMargin: 0,
    });
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallTopLeftCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;
    // toBeCloseTo, not toEqual: reaching the corner via a distance-based
    // extension (sqrt/division) accumulates ~1e-15 floating-point noise
    // relative to the corner's own line-intersection computation — both
    // exact by construction, just not bit-identical.
    expect(hallLeft.start.x).toBeCloseTo(hallTopLeftCorner.position.x, 9);
    expect(hallLeft.start.z).toBeCloseTo(hallTopLeftCorner.position.z, 9);
  });
});

describe('computeWallRuns — parameterization', () => {
  it('a larger envelopeOffset pushes runs further from the room center', () => {
    const region: RegionInput = { id: 'r', hexes: regionCubes(6, 6, 0) };
    const small = computeWallRuns({
      regions: [region],
      doors: [],
      envelopeOffsetLeftRight: 0.1,
    });
    const large = computeWallRuns({
      regions: [region],
      doors: [],
      envelopeOffsetLeftRight: 2,
    });

    const smallLeft = small.envelopeRuns.find((r) => r.side === 'left')!;
    const largeLeft = large.envelopeRuns.find((r) => r.side === 'left')!;
    const center = cubeToWorld(cubeAtColRow(2, 2), HEX_SIZE);

    const smallDist = Math.hypot(
      smallLeft.start.x - center.x,
      smallLeft.start.z - center.z
    );
    const largeDist = Math.hypot(
      largeLeft.start.x - center.x,
      largeLeft.start.z - center.z
    );
    expect(largeDist).toBeGreaterThan(smallDist);
  });

  it('an empty region list produces no runs at all', () => {
    const result = computeWallRuns({ regions: [], doors: [] });
    expect(result.envelopeRuns).toHaveLength(0);
    expect(result.connectorRuns).toHaveLength(0);
  });

  it('a region with an empty hex list contributes no envelope runs', () => {
    const result = computeWallRuns({
      regions: [{ id: 'empty', hexes: [] }],
      doors: [],
    });
    expect(result.envelopeRuns).toHaveLength(0);
  });
});

describe('computeWallRuns — envelope/connector run facing (round-2 W3/W4 regression, Kirk\'s live walk: "west wall is a featureless dark slab while the north wall shows brick tile detail")', () => {
  it("every envelope run's facing is a genuine unit vector pointing away from the region's own center — the contract wallRunMeshHelpers.facingCorrectedRotationY depends on", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    for (const run of result.envelopeRuns) {
      const len = Math.hypot(run.facing.x, run.facing.z);
      expect(len).toBeCloseTo(1, 9);

      const mid = {
        x: (run.start.x + run.end.x) / 2,
        z: (run.start.z + run.end.z) / 2,
      };
      const regionRuns = result.envelopeRuns.filter(
        (r) => r.regionId === run.regionId
      );
      const center = {
        x:
          regionRuns.reduce((s, r) => s + (r.start.x + r.end.x) / 2, 0) /
          regionRuns.length,
        z:
          regionRuns.reduce((s, r) => s + (r.start.z + r.end.z) / 2, 0) /
          regionRuns.length,
      };
      const toMid = { x: mid.x - center.x, z: mid.z - center.z };
      const toMidLen = Math.hypot(toMid.x, toMid.z);
      const dot = (run.facing.x * toMid.x + run.facing.z * toMid.z) / toMidLen;
      expect(dot).toBeGreaterThan(0.9); // points the same way as "away from center"
    }
  });

  it("hall's left and right sides share the same tileWallSegment rotationY (same direction pair) but have OPPOSITE facing — the exact defect: without per-side facing, one of every {left,right} and {top,bottom} pair always shows its flat back outward", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallRight = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    )!;
    const hallTop = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'top'
    )!;
    const hallBottom = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'bottom'
    )!;

    // left/right run top-to-bottom (share direction); top/bottom run
    // left-to-right (share a DIFFERENT direction) — verified directly,
    // not assumed, since this sharing is exactly why the pre-fix
    // direction-only rotationY failed on one side of each pair.
    const dir = (r: typeof hallLeft) => ({
      x: r.end.x - r.start.x,
      z: r.end.z - r.start.z,
    });
    const leftDir = dir(hallLeft);
    const rightDir = dir(hallRight);
    expect(leftDir.x).toBeCloseTo(rightDir.x, 6);
    expect(leftDir.z).toBeCloseTo(rightDir.z, 6);
    const topDir = dir(hallTop);
    const bottomDir = dir(hallBottom);
    expect(topDir.x).toBeCloseTo(bottomDir.x, 6);
    expect(topDir.z).toBeCloseTo(bottomDir.z, 6);

    // Despite sharing a direction (and therefore the same naive
    // direction-only rotationY), left/right facing points opposite ways
    // — same for top/bottom.
    const dot = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      a.x * b.x + a.z * b.z;
    expect(dot(hallLeft.facing, hallRight.facing)).toBeLessThan(-0.9);
    expect(dot(hallTop.facing, hallBottom.facing)).toBeLessThan(-0.9);
  });

  it("a connector run's facing is a unit vector pointing from its own column toward regionBId (the higher-column side)", () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    const result = computeWallRuns({ regions, doors });
    const run = result.connectorRuns[0]!;
    expect(run.regionBId).toBe('hall'); // higher column than 'entrance'
    const len = Math.hypot(run.facing.x, run.facing.z);
    expect(len).toBeCloseTo(1, 9);

    // regionB ('hall') sits at higher columns -> higher world x (odd-q
    // pointy-top cubeToWorld's worldX grows with column) -> facing.x > 0.
    expect(run.facing.x).toBeGreaterThan(0);
  });
});

describe('computeWallRuns — connector-facing envelope suppression (option (b), rpg-project#132 connector-single-wall: audit found 3 correct-but-crowding wall systems ~0.5 world units apart at every door)', () => {
  it("a region's connector-facing side has NO envelope run at all — the connector's own wall is the sole one there; non-connector-facing sides are untouched", () => {
    const { regions, doorEntranceHallCol, doorHallTombCol } =
      referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
      { id: 'd2', position: cubeAtColRow(doorHallTombCol, DOOR_ROW) },
    ];
    const result = computeWallRuns({ regions, doors });
    const sidesFor = (regionId: string) =>
      new Set(
        result.envelopeRuns
          .filter((r) => r.regionId === regionId)
          .map((r) => r.side)
      );

    // entrance: only 'right' is connector-facing (nothing to its left).
    expect(sidesFor('entrance')).toEqual(new Set(['left', 'top', 'bottom']));
    // hall: BOTH 'left' and 'right' are connector-facing.
    expect(sidesFor('hall')).toEqual(new Set(['top', 'bottom']));
    // tomb: only 'left' is connector-facing (nothing to its right).
    expect(sidesFor('tomb')).toEqual(new Set(['right', 'top', 'bottom']));
  });

  it('with no doors at all, every side still renders (pre-option-(b) behavior) — suppression is purely door-driven, never a hardcoded per-region assumption', () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const hallSides = new Set(
      result.envelopeRuns
        .filter((r) => r.regionId === 'hall')
        .map((r) => r.side)
    );
    expect(hallSides).toEqual(new Set(['left', 'right', 'top', 'bottom']));
  });

  it("far-room-dark reveal state: suppresses the near region's connector-facing side even while the far region has ZERO known hexes — suppression can't depend on connectorRegionsForDoor's two-sided pair resolution, since doors are whole-dungeon/unconditional from wave 1 while region hex membership is per-viewer reveal-gated (this file's own header doc)", () => {
    const { doorEntranceHallCol } = referenceTombFixture();
    const entrance: RegionInput = {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, ENTRANCE_START),
    };
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    // Only entrance is passed — hall/tomb haven't revealed a single hex.
    const result = computeWallRuns({ regions: [entrance], doors });

    const entranceSides = new Set(result.envelopeRuns.map((r) => r.side));
    expect(entranceSides).toEqual(new Set(['left', 'top', 'bottom']));
    // And no ConnectorRun resolves yet either (needs both sides) — so the
    // fallback-segment safety net (wallRunAdapters.ts, a separate module)
    // is left to cover the column alone, never alongside an unsuppressed
    // envelope run at the same side.
    expect(result.connectorRuns).toHaveLength(0);
  });

  it('revealed reveal state: the SAME side stays suppressed once the far region resolves too, AND a real ConnectorRun now covers the column — never both a rendered envelope run and a ConnectorRun on the same side at once', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const entrance = regions.find((r) => r.id === 'entrance')!;
    const hall = regions.find((r) => r.id === 'hall')!;
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    const result = computeWallRuns({ regions: [entrance, hall], doors });

    const entranceSides = new Set(
      result.envelopeRuns
        .filter((r) => r.regionId === 'entrance')
        .map((r) => r.side)
    );
    expect(entranceSides).toEqual(new Set(['left', 'top', 'bottom']));
    expect(result.connectorRuns).toHaveLength(1);
    expect(result.connectorRuns[0]).toMatchObject({
      regionAId: 'entrance',
      regionBId: 'hall',
    });
  });

  it("the true outer-perimeter side ('left', with nothing suppressed adjacent to it) is numerically UNCHANGED by 'right' being suppressed; 'top'/'bottom' keep their non-connector-facing endpoint unchanged but extend their connector-facing endpoint FURTHER out to meet the connector's line — requirement (1): \"extend them to the connector wall line so corners still close\", not \"leave every other side untouched\"", () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const withoutDoors = computeWallRuns({ regions, doors: [] });
    const withDoors = computeWallRuns({
      regions,
      doors: [
        { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
      ],
    });
    const find = (
      result: typeof withoutDoors,
      side: 'left' | 'top' | 'bottom'
    ) =>
      result.envelopeRuns.find(
        (r) => r.regionId === 'entrance' && r.side === side
      )!;

    // 'left' shares no corner with the suppressed 'right' side — fully
    // unchanged, both endpoints.
    const leftBefore = find(withoutDoors, 'left');
    const leftAfter = find(withDoors, 'left');
    expect(leftAfter.start).toEqual(leftBefore.start);
    expect(leftAfter.end).toEqual(leftBefore.end);

    // 'top'/'bottom' each have one corner shared with 'left' (topLeft/
    // bottomLeft — untouched) and one that used to be shared with
    // entrance's own 'right' side (topRight/bottomRight). That corner now
    // sits on the connector's own column line instead — strictly further
    // out than entrance's own (now-suppressed) right envelope line ever
    // reached, since the connector column sits a full column beyond
    // entrance's true edge while the old right line was only offset a
    // fraction of a hex radius past it — so the run's far endpoint moves
    // to meet it.
    for (const side of ['top', 'bottom'] as const) {
      const before = find(withoutDoors, side);
      const after = find(withDoors, side);
      expect(after.start).toEqual(before.start);
      expect(after.end).not.toEqual(before.end);
      // Higher world x = further toward higher columns (this file's own
      // established odd-q pointy-top fact) = further from entrance toward
      // the connector, not an arbitrary unrelated shift.
      expect(after.end.x).toBeGreaterThan(before.end.x);
    }
  });

  it("hall's top run still terminates cleanly at both ends even with BOTH its left and right sides suppressed: its topLeft/topRight corners now sit exactly on each neighboring connector's own column line (not hall's own unrendered left/right line), and hall's top run still reaches exactly envelopeCornerOverlapMargin past each — the identical exact-intersection-plus-margin contract every other corner in this file already gets, just against a connector's line instead of a suppressed side's", () => {
    const { regions, doorEntranceHallCol, doorHallTombCol } =
      referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
      { id: 'd2', position: cubeAtColRow(doorHallTombCol, DOOR_ROW) },
    ];
    const margin = 0.2;
    const result = computeWallRuns({
      regions,
      doors,
      envelopeCornerOverlapMargin: margin,
    });
    const hallTop = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'top'
    )!;
    const hallTopLeftCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;
    const hallTopRightCorner = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topRight'
    )!;

    const crossZ = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      a.x * b.z - a.z * b.x;
    const onColumnLine = (
      point: { x: number; z: number },
      col: number
    ): number => {
      const top = cubeToWorld(cubeAtColRow(col, 0), HEX_SIZE);
      const bottom = cubeToWorld(cubeAtColRow(col, HEIGHT - 1), HEX_SIZE);
      const dir = { x: bottom.x - top.x, z: bottom.z - top.z };
      const toPoint = { x: point.x - top.x, z: point.z - top.z };
      return Math.abs(crossZ(dir, toPoint));
    };

    // topLeft sits on the entrance<->hall connector's column line; topRight
    // sits on the hall<->tomb connector's column line.
    expect(
      onColumnLine(hallTopLeftCorner.position, doorEntranceHallCol)
    ).toBeLessThan(1e-9);
    expect(
      onColumnLine(hallTopRightCorner.position, doorHallTombCol)
    ).toBeLessThan(1e-9);

    // hall's top run still reaches EXACTLY margin past each corner.
    expect(
      Math.hypot(
        hallTop.start.x - hallTopLeftCorner.position.x,
        hallTop.start.z - hallTopLeftCorner.position.z
      )
    ).toBeCloseTo(margin, 9);
    expect(
      Math.hypot(
        hallTop.end.x - hallTopRightCorner.position.x,
        hallTop.end.z - hallTopRightCorner.position.z
      )
    ).toBeCloseTo(margin, 9);
  });

  // Gate review (rpg-dnd5e-web#626, BLOCK verdict): nearestConnectorColumns
  // suppressed a side whenever ANY door column lay beyond a region's
  // bounds, at ANY distance — under partial reveal, a region's own edge
  // is usually nowhere near that connector, so the suppressed side
  // removed the room's only wall there while the connector run meant to
  // replace it (needing the FAR side revealed too) frequently didn't
  // exist yet. Fixed via an adjacency gate (`col === bounds.maxCol + 1` /
  // `col === bounds.minCol - 1`) — nearestConnectorColumns' own doc
  // comment has the full reasoning + trade-off. These two fixtures are
  // the reviewer's own live reproductions on this exact reference-tomb
  // shape, pinned as permanent regressions.
  it("reviewer's repro 1: hall revealed cols 7-10 only (NOT yet reaching its own true right edge, col 16) with tomb dark — hall's right side must NOT be suppressed (no connector run exists to replace it yet), closing the open-frontier bug", () => {
    const { doorEntranceHallCol, doorHallTombCol } = referenceTombFixture();
    const entrance: RegionInput = {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, ENTRANCE_START),
    };
    const hallPartial: RegionInput = {
      id: 'hall',
      hexes: colRangeCubes(HALL_START, HALL_START + 3, HEIGHT), // cols 7-10
    };
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
      { id: 'd2', position: cubeAtColRow(doorHallTombCol, DOOR_ROW) },
    ];
    const result = computeWallRuns({
      regions: [entrance, hallPartial],
      doors,
    });
    const hallSides = new Set(
      result.envelopeRuns
        .filter((r) => r.regionId === 'hall')
        .map((r) => r.side)
    );
    expect(hallSides.has('right')).toBe(true);
    // Confirms the bug's own root cause is absent here: no connector run
    // resolves for the hall<->tomb door (tomb is dark), so if 'right'
    // WERE suppressed, nothing would be standing in for it at all.
    expect(result.connectorRuns).toHaveLength(1);
    expect(result.connectorRuns[0]).toMatchObject({
      regionAId: 'entrance',
      regionBId: 'hall',
    });
  });

  it("reviewer's repro 2 (the sharper case): hall revealed cols 10-12 only — a middle slice touching NEITHER door column — with entrance and tomb both dark — hall must render BOTH sides, not zero, even though nothing backs either boundary yet", () => {
    const { doorEntranceHallCol, doorHallTombCol } = referenceTombFixture();
    const hallMiddleOnly: RegionInput = {
      id: 'hall',
      hexes: colRangeCubes(HALL_START + 3, HALL_START + 5, HEIGHT), // cols 10-12
    };
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
      { id: 'd2', position: cubeAtColRow(doorHallTombCol, DOOR_ROW) },
    ];
    // Only hall is passed — entrance/tomb haven't revealed a single hex,
    // matching the reviewer's own repro exactly (isolates suppression
    // from any real ConnectorRun ever resolving on either side).
    const result = computeWallRuns({ regions: [hallMiddleOnly], doors });
    const hallSides = new Set(result.envelopeRuns.map((r) => r.side));
    expect(hallSides.has('left')).toBe(true);
    expect(hallSides.has('right')).toBe(true);
    expect(result.connectorRuns).toHaveLength(0);
  });
});

describe('computeWallRuns — connector run corner termination (Kirk\'s live-walk regression on the connector-single-wall prototype: "a corner went missing... roughly a hex of open gap" at the room corner adjacent to a suppressed side)', () => {
  // Root cause (found by pure-math investigation, not guessed): once a
  // room's connector-facing envelope side is suppressed, that side can no
  // longer close its shared corner via the overlap-miter cheat (WallRunMesh's
  // own doc comment — no dedicated corner GLB; two perpendicular runs
  // physically overlapping IS what closes a corner). The connector run
  // becomes the joint's other half, but its OLD near/far endpoints only
  // reached a flat `cornerExtension` (half a hex radius) past the row
  // boundary — while the true corner (the room's own offset 'top'/'bottom'
  // line crossing the connector's column) can sit far past that flat
  // reach, since `envelopeOffsetTopBottom` (default sqrt(3) ~= 1.73) is
  // over 3x the old flat constant. Fix: connector endpoints now reach the
  // exact corner intersection (the SAME `EnvelopeCorner` position each
  // neighboring room already computes) plus the small overlap margin —
  // the identical exact-intersection contract envelope runs already use.
  //
  // The extension distance is `max(distance-to-regionA-corner,
  // distance-to-regionB-corner) + margin` (measured BEFORE extension, from
  // the connector's own unextended row-boundary point) — so AFTER
  // extension, the corner that was farther away lands at EXACTLY margin
  // (the SMALLER of the two post-extension distances, since it was the
  // one the extension was sized for), while the corner that was nearer
  // lands at margin-plus-the-original-gap (the LARGER post-extension
  // distance, still comfortably >= margin, never left short of it).

  it("the near (top-side) connector segment's endpoint: whichever neighboring corner (entrance's topRight or hall's topLeft) was farther from the connector's own row-boundary point lands at EXACTLY envelopeCornerOverlapMargin after extension; the nearer one lands at margin or more — never short of margin, which is what reopens Kirk's gap", () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    const margin = 0.23;
    const result = computeWallRuns({
      regions,
      doors,
      envelopeCornerOverlapMargin: margin,
    });

    const entranceTopRight = result.envelopeCorners.find(
      (c) => c.regionId === 'entrance' && c.corner === 'topRight'
    )!;
    const hallTopLeft = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topLeft'
    )!;

    const run = result.connectorRuns[0]!;
    expect(run.segments).toHaveLength(2);
    const nearEnd = run.segments[0]!.start; // doorRow > minRow branch, pushed first

    const distToEntrance = Math.hypot(
      nearEnd.x - entranceTopRight.position.x,
      nearEnd.z - entranceTopRight.position.z
    );
    const distToHall = Math.hypot(
      nearEnd.x - hallTopLeft.position.x,
      nearEnd.z - hallTopLeft.position.z
    );

    // The formerly-farther corner is the CLOSER of the two post-extension
    // distances (the extension was sized exactly to reach it plus margin).
    expect(Math.min(distToEntrance, distToHall)).toBeCloseTo(margin, 9);
    // The formerly-nearer corner is still fully enclosed, never short of
    // margin — a regression here would reopen exactly the gap Kirk found.
    expect(Math.max(distToEntrance, distToHall)).toBeGreaterThanOrEqual(
      margin - 1e-9
    );
  });

  it('same contract for the far (bottom-side) connector segment, against bottomRight/bottomLeft', () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    const margin = 0.23;
    const result = computeWallRuns({
      regions,
      doors,
      envelopeCornerOverlapMargin: margin,
    });

    const entranceBottomRight = result.envelopeCorners.find(
      (c) => c.regionId === 'entrance' && c.corner === 'bottomRight'
    )!;
    const hallBottomLeft = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'bottomLeft'
    )!;

    const run = result.connectorRuns[0]!;
    const farEnd = run.segments[1]!.end; // doorRow < maxRow branch, pushed second

    const distToEntrance = Math.hypot(
      farEnd.x - entranceBottomRight.position.x,
      farEnd.z - entranceBottomRight.position.z
    );
    const distToHall = Math.hypot(
      farEnd.x - hallBottomLeft.position.x,
      farEnd.z - hallBottomLeft.position.z
    );

    expect(Math.min(distToEntrance, distToHall)).toBeCloseTo(margin, 9);
    expect(Math.max(distToEntrance, distToHall)).toBeGreaterThanOrEqual(
      margin - 1e-9
    );
  });

  it("connector run endpoints now reach substantially FARTHER than the old flat half-hex-radius cornerExtension default whenever the room offset pushes the true corner well past that flat reach — regression guard for the exact defect class Kirk's live walk found (a silent revert to a flat constant would quietly reopen this gap without failing the exact-distance tests above, since a flat reach could coincidentally still equal one specific margin value)", () => {
    const { regions, doorEntranceHallCol } = referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW) },
    ];
    const result = computeWallRuns({ regions, doors });
    const run = result.connectorRuns[0]!;
    const nearEnd = run.segments[0]!.start;
    const rawRowZeroPoint = cubeToWorld(
      cubeAtColRow(doorEntranceHallCol, 0),
      HEX_SIZE
    );
    const reach = Math.hypot(
      nearEnd.x - rawRowZeroPoint.x,
      nearEnd.z - rawRowZeroPoint.z
    );
    // Old flat default was 0.5 hex radii; the true corner (pushed out by
    // envelopeOffsetTopBottom, default sqrt(3) ~= 1.73) sits well past
    // that, so the actual reach must clear it by a wide margin, not
    // barely tie it.
    expect(reach).toBeGreaterThan(0.7);
  });

  it("generalizes to an asymmetric connector (rooms of DIFFERENT widths — entrance 6 vs hall 10 vs tomb 12): the hall<->tomb connector's near endpoint independently satisfies the same farther-corner-reaches-exactly-margin contract", () => {
    const { regions, doorHallTombCol } = referenceTombFixture();
    const doors = [
      { id: 'd1', position: cubeAtColRow(doorHallTombCol, DOOR_ROW) },
    ];
    const margin = 0.19;
    const result = computeWallRuns({
      regions,
      doors,
      envelopeCornerOverlapMargin: margin,
    });

    const hallTopRight = result.envelopeCorners.find(
      (c) => c.regionId === 'hall' && c.corner === 'topRight'
    )!;
    const tombTopLeft = result.envelopeCorners.find(
      (c) => c.regionId === 'tomb' && c.corner === 'topLeft'
    )!;
    const run = result.connectorRuns[0]!;
    const nearEnd = run.segments[0]!.start;
    const distToHall = Math.hypot(
      nearEnd.x - hallTopRight.position.x,
      nearEnd.z - hallTopRight.position.z
    );
    const distToTomb = Math.hypot(
      nearEnd.x - tombTopLeft.position.x,
      nearEnd.z - tombTopLeft.position.z
    );
    expect(Math.min(distToHall, distToTomb)).toBeCloseTo(margin, 9);
    expect(Math.max(distToHall, distToTomb)).toBeGreaterThanOrEqual(
      margin - 1e-9
    );
  });
});

describe("computeWallRuns — connector reach under ASYMMETRIC partial reveal (Kirk's live-walk regression on the lab-b<->lab-vault connector: wall around the door mostly VANISHED once the far region — an 8-wide vault behind a 10-wide chamber — started partially revealing, immediately after the corner-termination fix above shipped)", () => {
  // Root cause (found by pure-math investigation before touching any live
  // state, matching the corner-gap investigation's own methodology):
  // `connectorRunForDoor`'s reach originally took `Math.max` across BOTH
  // neighboring regions' own envelope corners unconditionally. A region's
  // own corner tracks ITS OWN reveal frontier (accepted v1 fog behavior —
  // this file's own header doc), which is only a MEANINGFUL stand-in for
  // "where the connector should reach" when that region's own bounds
  // actually reach the SAME row `coveredRows` (the union of both regions'
  // bounds) claims for that end. Once one region (the vault) is only
  // partially revealed while the OTHER (the chamber) is fully revealed,
  // the vault's own corner sits at ITS OWN frontier row — a value with no
  // relationship to the boundary the connector is actually reaching for —
  // and blindly taking the max let that irrelevant, reveal-window-
  // dependent value swing the connector's reach by over a world unit
  // (verified directly against these exact dimensions before the fix:
  // moved by >1.4 units depending purely on which rows of an 8-wide
  // partially-revealed region happened to be visible). Fix: a region's
  // corner is only included as a reach target when its own bounds match
  // the boundary in question — always true for symmetric/full reveal
  // (see the corner-termination describe block above, unaffected by this
  // change), and correctly excludes the not-yet-relevant region under
  // asymmetric partial reveal.
  const HEIGHT = 8;
  const DOOR_ROW = 4;
  const LAB_B_WIDTH = 10;
  const LAB_VAULT_WIDTH = 8;
  const LAB_B_START = 9;
  const LAB_VAULT_START = 20;
  const DOOR_COL = LAB_B_START + LAB_B_WIDTH; // 19

  function labBFullyRevealed(): RegionInput {
    return {
      id: 'lab-b',
      hexes: regionCubes(LAB_B_WIDTH, HEIGHT, LAB_B_START),
    };
  }
  function labVaultRowRange(minRow: number, maxRow: number): RegionInput {
    const hexes: RegionInput['hexes'] = [];
    for (
      let col = LAB_VAULT_START;
      col < LAB_VAULT_START + LAB_VAULT_WIDTH;
      col++
    ) {
      for (let row = minRow; row <= maxRow; row++) {
        hexes.push(cubeAtColRow(col, row));
      }
    }
    return { id: 'lab-vault', hexes };
  }
  const doors = [
    { id: 'door-b-vault', position: cubeAtColRow(DOOR_COL, DOOR_ROW) },
  ];

  it("the near segment's reach is IDENTICAL across different partial-reveal windows of the far region (vault), as long as none of them reach the true row-0 boundary — proving the fix genuinely EXCLUDES the vault's own (irrelevant) corner rather than merely diluting its influence", () => {
    const nearStarts = (
      ['near-door-only', 'sight-range', 'one-sided-below'] as const
    ).map((label) => {
      const vault =
        label === 'near-door-only'
          ? labVaultRowRange(3, 5)
          : label === 'sight-range'
            ? labVaultRowRange(2, 6)
            : labVaultRowRange(4, 7); // one-sided-below: reveals down to maxRow, never row 0
      const result = computeWallRuns({
        regions: [labBFullyRevealed(), vault],
        doors,
      });
      return result.connectorRuns.find((r) => r.doorId === 'door-b-vault')!
        .segments[0]!.start;
    });
    for (let i = 1; i < nearStarts.length; i++) {
      expect(nearStarts[i]!.x).toBeCloseTo(nearStarts[0]!.x, 9);
      expect(nearStarts[i]!.z).toBeCloseTo(nearStarts[0]!.z, 9);
    }
  });

  it("that stable (vault-excluded) reach stays within a small tolerance of the fully-revealed case — both are legitimate exact-intersection results, just not required to be bit-identical (the two rooms' independently-offset lines were never exactly the same physical point, this file's own established ~0.02-0.15 unit tolerance elsewhere) — never displaced by an order of magnitude the way the regression was (>1 world unit)", () => {
    const fullResult = computeWallRuns({
      regions: [labBFullyRevealed(), labVaultRowRange(0, 7)],
      doors,
    });
    const partialResult = computeWallRuns({
      regions: [labBFullyRevealed(), labVaultRowRange(3, 5)],
      doors,
    });
    const fullStart = fullResult.connectorRuns.find(
      (r) => r.doorId === 'door-b-vault'
    )!.segments[0]!.start;
    const partialStart = partialResult.connectorRuns.find(
      (r) => r.doorId === 'door-b-vault'
    )!.segments[0]!.start;
    const drift = Math.hypot(
      partialStart.x - fullStart.x,
      partialStart.z - fullStart.z
    );
    expect(drift).toBeLessThan(0.1);
  });

  it('a region whose OWN bounds DO reach the shared boundary (vault revealed all the way to row 0) is still included as a reach target, exactly like the fully-revealed case — the exclusion is conditional on the boundary match, not a blanket "always ignore the partially-revealed region"', () => {
    const oneSidedAbove = computeWallRuns({
      regions: [labBFullyRevealed(), labVaultRowRange(0, 4)],
      doors,
    });
    const full = computeWallRuns({
      regions: [labBFullyRevealed(), labVaultRowRange(0, 7)],
      doors,
    });
    const a = oneSidedAbove.connectorRuns.find(
      (r) => r.doorId === 'door-b-vault'
    )!.segments[0]!.start;
    const b = full.connectorRuns.find((r) => r.doorId === 'door-b-vault')!
      .segments[0]!.start;
    // Vault's own minRow is 0 in BOTH cases here, so it's included in both
    // — the near segment should land at essentially the same reach.
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  });
});

describe('computeWallRuns — real look-lab gallery<->staged partial reveal (Kirk\'s live-walk regression, the asymmetric-partial-reveal takeover\'s second cousin: "wall gone for a couple hexes left of [the door], right run offset")', () => {
  // Real, live-captured wire data (lookLabRealWireFixture.ts) from the
  // exact moment Kirk found this: the gallery(20)<->staged(10) door had
  // just been opened and staged (the far region) had only begun
  // revealing — 22 of its 80 hexes, an irregular fog-of-war disc around
  // the player standing at the door, NOT a clean rectangular slice (see
  // the fixture's own doc comment). Gallery is essentially fully revealed
  // (159/160 hexes). Root cause: unlike the lab-b<->lab-vault regression
  // above (a bug in connectorRunForDoor's OWN reach-target selection),
  // this is a DIFFERENT bug in envelopeGeometryForRegion: staged's OWN
  // "bottom" envelope run (its cross wall, running along the column axis
  // at a FIXED row) sat at staged's own reveal frontier (row 4) instead of
  // the TRUE row (7) the gallery<->staged connector had ALREADY
  // established via gallery — an ~0.88 world-unit gap between staged's
  // own run and the connector's validated far reach, confirmed via this
  // exact real data BEFORE the widenRegionBoundsAlongConnectors fix.
  function doors() {
    return [
      {
        id: 'gs',
        position: REAL_LOOK_LAB_DOORS['look-lab-door-gallery-staged'],
      },
      { id: 'sv', position: REAL_LOOK_LAB_DOORS['look-lab-door-staged-vault'] },
    ];
  }
  function computeReal() {
    return computeWallRuns({
      regions: [
        { id: 'gallery', hexes: REAL_LOOK_LAB_GALLERY_REVEALED_HEXES },
        { id: 'staged', hexes: REAL_LOOK_LAB_STAGED_REVEALED_HEXES },
      ],
      doors: doors(),
    });
  }
  function dist(a: WorldPos, b: WorldPos): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  it('staged\'s own "bottom" run reaches within the SAME small tolerance every other corner-match in this file already has (~0.06-0.35), not the ~0.88 gap the regression measured — proving the fix, not merely asserting an arbitrary number', () => {
    const result = computeReal();
    const conn = result.connectorRuns.find((r) => r.doorId === 'gs')!;
    const stagedBottom = result.envelopeRuns.find(
      (r) => r.regionId === 'staged' && r.side === 'bottom'
    )!;
    const farEnd = conn.segments[1]!.end;
    expect(dist(stagedBottom.start, farEnd)).toBeLessThan(0.35);
  });

  it("gallery's own \"bottom\" run (the side that was ALREADY fully revealed, unaffected by the fix) still reaches the connector's far end at the same tolerance as before — the fix doesn't perturb the side that was already correct", () => {
    const result = computeReal();
    const conn = result.connectorRuns.find((r) => r.doorId === 'gs')!;
    const galleryBottom = result.envelopeRuns.find(
      (r) => r.regionId === 'gallery' && r.side === 'bottom'
    )!;
    const farEnd = conn.segments[1]!.end;
    expect(dist(galleryBottom.end, farEnd)).toBeLessThan(0.35);
  });

  it('staged\'s own "top" run (the end that ALREADY matched before the fix, since staged\'s own reveal already reached row 0) is unaffected by widening — still within the same small tolerance', () => {
    const result = computeReal();
    const conn = result.connectorRuns.find((r) => r.doorId === 'gs')!;
    const stagedTop = result.envelopeRuns.find(
      (r) => r.regionId === 'staged' && r.side === 'top'
    )!;
    const nearStart = conn.segments[0]!.start;
    expect(dist(stagedTop.start, nearStart)).toBeLessThan(0.35);
  });

  it("gallery's own envelope runs are byte-identical regardless of how much of staged has revealed (partial, the real 22-hex case, vs a hypothetical FULLY revealed staged) — widening only ever pushes staged's bounds UP to match gallery's already-true extent, never pulls gallery's own (already-correct) bounds down; same doors/suppression pattern in both cases, isolating widening from the (expected, unrelated) suppression-changes-corner-geometry effect", () => {
    const partialResult = computeReal();
    const fullyRevealedResult = computeWallRuns({
      regions: [
        { id: 'gallery', hexes: REAL_LOOK_LAB_GALLERY_REVEALED_HEXES },
        {
          id: 'staged',
          hexes: regionCubes(10, 8, 21), // staged's TRUE full extent
        },
      ],
      doors: doors(),
    });
    const galleryPartial = partialResult.envelopeRuns.filter(
      (r) => r.regionId === 'gallery'
    );
    const galleryFull = fullyRevealedResult.envelopeRuns.filter(
      (r) => r.regionId === 'gallery'
    );
    expect(galleryPartial.length).toBe(galleryFull.length);
    for (const run of galleryPartial) {
      const full = galleryFull.find((r) => r.side === run.side)!;
      expect(run.start.x).toBeCloseTo(full.start.x, 9);
      expect(run.start.z).toBeCloseTo(full.start.z, 9);
      expect(run.end.x).toBeCloseTo(full.end.x, 9);
      expect(run.end.z).toBeCloseTo(full.end.z, 9);
    }
  });
});

describe('computeWallRuns — widening propagation across a 3+ room chain (gate review finding, rpg-dnd5e-web#626): a fixed-point pass over doors makes widening actually transitive in ONE call, regardless of door array order', () => {
  // entrance fully revealed (proves the true row extent 0-7). hall and
  // tomb are each revealed at a SINGLE row only (row 4) across their own
  // full column width — degenerate raw bounds (minRow=maxRow=4) with
  // nothing to prove their own true height directly. hall connects
  // DIRECTLY to entrance (one hop); tomb connects ONLY to hall, never
  // directly to entrance — so tomb's own widening can only happen via
  // hall's ALREADY-widened bounds, the exact transitivity the pre-fix
  // single pass (reading raw bounds for both sides of every door) could
  // not deliver when door-b was processed before door-a fully widened
  // hall. Doors are deliberately ordered [door-b, door-a] below — hall<->
  // tomb BEFORE entrance<->hall — the unfavorable order for the old code.
  function singleRowColumnSpan(minCol: number, maxCol: number): CubeCoord[] {
    const hexes: CubeCoord[] = [];
    for (let col = minCol; col <= maxCol; col++) {
      hexes.push(cubeAtColRow(col, DOOR_ROW));
    }
    return hexes;
  }

  it("tomb's row extent widens to the full 0-7 range (entrance's proven height) via hall as an intermediary, even though tomb never directly connects to entrance and hall itself is only known at a single row", () => {
    const { doorEntranceHallCol, doorHallTombCol } = referenceTombFixture();
    const entrance: RegionInput = {
      id: 'entrance',
      hexes: regionCubes(ENTRANCE_WIDTH, HEIGHT, ENTRANCE_START),
    };
    const hallSingleRow: RegionInput = {
      id: 'hall',
      hexes: singleRowColumnSpan(HALL_START, HALL_START + HALL_WIDTH - 1),
    };
    const tombSingleRow: RegionInput = {
      id: 'tomb',
      hexes: singleRowColumnSpan(TOMB_START, TOMB_START + TOMB_WIDTH - 1),
    };
    const doorB = {
      id: 'door-b',
      position: cubeAtColRow(doorHallTombCol, DOOR_ROW),
    };
    const doorA = {
      id: 'door-a',
      position: cubeAtColRow(doorEntranceHallCol, DOOR_ROW),
    };

    const result = computeWallRuns({
      regions: [entrance, hallSingleRow, tombSingleRow],
      doors: [doorB, doorA], // unfavorable order for the pre-fix code
    });

    // tomb's own "top"/"bottom" envelope runs should now span the FULL
    // true row range (0 to HEIGHT-1), not just row 4 -- proving tomb's
    // bounds widened all the way through hall to entrance's proven
    // extent, in ONE computeWallRuns call.
    const tombTop = result.envelopeRuns.find(
      (r) => r.regionId === 'tomb' && r.side === 'top'
    )!;
    const tombBottom = result.envelopeRuns.find(
      (r) => r.regionId === 'tomb' && r.side === 'bottom'
    )!;
    const expectedTop = cubeToWorld(cubeAtColRow(TOMB_START, 0), HEX_SIZE);
    const expectedBottom = cubeToWorld(
      cubeAtColRow(TOMB_START, HEIGHT - 1),
      HEX_SIZE
    );
    // A magic-number distance tolerance would be brittle here (the
    // envelope offset/corner-extension math legitimately moves a run's
    // endpoint some distance past the raw hex corner) — instead, prove
    // widening happened by showing the actual endpoint is unambiguously
    // CLOSER to the true row-0/row-7 corner than to where it would sit
    // had tomb stayed stuck at its own raw single-row (row 4) bounds.
    const stuckAtRow4 = cubeToWorld(
      cubeAtColRow(TOMB_START, DOOR_ROW),
      HEX_SIZE
    );
    const distance = (a: { z: number }, b: { z: number }) =>
      Math.abs(a.z - b.z);
    expect(distance(tombTop.start, expectedTop)).toBeLessThan(
      distance(tombTop.start, stuckAtRow4)
    );
    expect(distance(tombBottom.start, expectedBottom)).toBeLessThan(
      distance(tombBottom.start, stuckAtRow4)
    );
  });
});

describe('computeWallRuns — door-frame junctions (#635)', () => {
  it.each([
    { height: 4, doorRow: 1, label: 'short connector' },
    { height: 12, doorRow: 6, label: 'long connector' },
  ])(
    '$label terminates both wall halves at the calibrated frame envelope without crossing the door center',
    ({ height, doorRow }) => {
      const doorCol = 2;
      const regions: RegionInput[] = [
        { id: 'left', hexes: regionCubes(2, height, 0) },
        { id: 'right', hexes: regionCubes(2, height, 3) },
      ];
      const door = {
        id: `door-${height}`,
        position: cubeAtColRow(doorCol, doorRow),
      };
      const run = computeWallRuns({ regions, doors: [door] }).connectorRuns[0]!;
      const [beforeDoor, afterDoor] = run.segments;
      const center = cubeToWorld(door.position, HEX_SIZE);
      const next = cubeToWorld(cubeAtColRow(doorCol, doorRow + 1), HEX_SIZE);
      const length = Math.hypot(next.x - center.x, next.z - center.z);
      const direction = {
        x: (next.x - center.x) / length,
        z: (next.z - center.z) / length,
      };
      const along = (point: WorldPos) =>
        (point.x - center.x) * direction.x + (point.z - center.z) * direction.z;

      // Prior geometry ended these at +/-sqrt(3) (the adjacent row centers),
      // leaving the reported 1.15-unit daylight gap after #634's 0.08 tile
      // overlap. The renderer now overlaps this exact frame envelope by 0.08.
      const halfFrame = DOOR_FRAME_CALIBRATED_WIDTH / 2;
      expect(along(beforeDoor!.end)).toBeCloseTo(-halfFrame, 9);
      expect(along(afterDoor!.start)).toBeCloseTo(halfFrame, 9);
      expect(Math.abs(along(beforeDoor!.end))).toBeLessThan(1);
      expect(Math.abs(along(afterDoor!.start))).toBeLessThan(1);

      // Nearest endpoints are outside, never through, the door center.
      expect(along(beforeDoor!.end)).toBeLessThan(0);
      expect(along(afterDoor!.start)).toBeGreaterThan(0);
    }
  );
});
