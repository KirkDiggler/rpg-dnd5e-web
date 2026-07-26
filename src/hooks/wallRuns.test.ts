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
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
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
    // column/row extent" from the extension/offset dial entirely.
    const zeroed = computeWallRuns({
      regions,
      doors: [],
      cornerExtension: 0,
      envelopeOffsetLeftRight: 0,
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
    // output).
    const envelopeOffsetLeftRight = 1.23;
    const offsetResult = computeWallRuns({
      regions,
      doors: [],
      cornerExtension: 0,
      envelopeOffsetLeftRight,
    });
    const hallLeftOffset = offsetResult.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    )!;
    const hallRightOffset = offsetResult.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    )!;
    const leftShift = Math.hypot(
      hallLeftOffset.start.x - topLeft.x,
      hallLeftOffset.start.z - topLeft.z
    );
    const rightShift = Math.hypot(
      hallRightOffset.start.x - topRight.x,
      hallRightOffset.start.z - topRight.z
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
      cornerExtension: 0,
      envelopeOffsetTopBottom: 0,
      envelopeOffsetLeftRight: 0,
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

  it('top/bottom span length equals the true corner-to-corner distance plus exactly 2x cornerExtension — an exact expected value, not just a >= inequality that any non-shrinking implementation would satisfy', () => {
    const cornerExtension = 0.37;
    const result = computeWallRuns({
      regions: [bossRegion],
      doors: [],
      cornerExtension,
      // envelopeOffset only translates both endpoints by the same
      // vector, so it never affects span length — 0 keeps this test
      // focused on cornerExtension alone.
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
    expect(topSpan).toBeCloseTo(fullSpan + 2 * cornerExtension, 9);
    expect(bottomSpan).toBeCloseTo(fullSpan + 2 * cornerExtension, 9);
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
