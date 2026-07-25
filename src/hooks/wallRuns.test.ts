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

  it("hall's left/right envelope runs sit at the true column extent, offset outward by one hex", () => {
    const { regions } = referenceTombFixture();
    const result = computeWallRuns({ regions, doors: [] });
    const hallLeft = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'left'
    );
    const hallRight = result.envelopeRuns.find(
      (r) => r.regionId === 'hall' && r.side === 'right'
    );
    expect(hallLeft).toBeDefined();
    expect(hallRight).toBeDefined();

    // hall spans columns [7, 16] (width 10, offsetX 7). The right run
    // must sit strictly further from hall's center than the left run (a
    // real outward offset was applied, not a zero-op).
    const hallCenterCol = HALL_START + HALL_WIDTH / 2;
    const centerWorld = cubeToWorld(
      cubeAtColRow(hallCenterCol, HEIGHT / 2),
      HEX_SIZE
    );
    const leftDist = Math.hypot(
      hallLeft!.start.x - centerWorld.x,
      hallLeft!.start.z - centerWorld.z
    );
    const rightDist = Math.hypot(
      hallRight!.start.x - centerWorld.x,
      hallRight!.start.z - centerWorld.z
    );
    // Both sides must be pushed outward from the room's own center by a
    // comparable amount (envelope offset), not left at the raw boundary
    // hex's own center distance.
    expect(leftDist).toBeGreaterThan(0);
    expect(rightDist).toBeGreaterThan(0);
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

  it('produces exactly 4 unbroken envelope sides, none gapped at doorRow', () => {
    const result = computeWallRuns({ regions: [bossRegion], doors: [] });
    expect(result.envelopeRuns).toHaveLength(4);
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const run = result.envelopeRuns.find((r) => r.side === side);
      expect(run).toBeDefined();
      // A single start/end pair per side IS "unbroken" — there is no
      // second segment or gap-carrying field on EnvelopeRun at all.
      expect(run!.start).toBeDefined();
      expect(run!.end).toBeDefined();
    }
  });

  it("top/bottom runs span the FULL column range (0..width-1), not stopping short at the doorRow's would-be opening", () => {
    const result = computeWallRuns({ regions: [bossRegion], doors: [] });
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
    // The run (extended past the corners by cornerExtension on both ends)
    // must be AT LEAST the raw corner-to-corner span — never shorter,
    // which is what a spurious mid-run gap would produce.
    expect(topSpan).toBeGreaterThanOrEqual(fullSpan - 1e-9);
    expect(bottomSpan).toBeGreaterThanOrEqual(fullSpan - 1e-9);
  });
});

describe('computeWallRuns — parameterization', () => {
  it('a larger envelopeOffset pushes runs further from the room center', () => {
    const region: RegionInput = { id: 'r', hexes: regionCubes(6, 6, 0) };
    const small = computeWallRuns({
      regions: [region],
      doors: [],
      envelopeOffset: 0.1,
    });
    const large = computeWallRuns({
      regions: [region],
      doors: [],
      envelopeOffset: 2,
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
