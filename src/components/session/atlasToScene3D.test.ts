/**
 * atlasToScene3D tests — the axial<->cube bridge and floor-tile
 * placement. Wall-run geometry (envelope/connector runs, door gaps) has
 * its own dedicated coverage in atlasWallRuns.test.ts; this file only
 * checks that `buildScene3D` actually WIRES that module's output through,
 * not the geometry itself.
 *
 * The most important assertion here is the same discriminator that file's
 * own doc comment names: a conversion swapped identically both ways is
 * invisible to a round-trip test and only visible in a drawing
 * (rpg-toolkit#1150's own postmortem). So the primary check below is not
 * "does positionToCube round-trip" — it's "does the 3D world-space
 * placement this file produces land in exactly the same picture the
 * already-verified 2D SVG placement (`atlas.ts`'s `hexCenter`) produces",
 * cross-checked against the real reference-tomb capture.
 */
import { coordToKey } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { hexCenter } from '../../concepts/session-tomb/atlas';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import {
  buildScene3D,
  positionToCube,
  propWorldPosition,
  worldPositionOf,
} from './atlasToScene3D';

const pos = (x: number, y: number) => ({ x, y }) as never;

describe('positionToCube', () => {
  it('keeps the wire axial (q, r) as cube.x/cube.z, deriving cube.y', () => {
    expect(positionToCube(pos(3, -2))).toEqual({ x: 3, y: -1, z: -2 });
  });

  it('satisfies the cube invariant x + y + z = 0 for any input', () => {
    for (const [q, r] of [
      [0, 0],
      [5, -3],
      [-7, 4],
      [27, 0],
    ]) {
      const cube = positionToCube(pos(q, r));
      expect(cube.x + cube.y + cube.z).toBe(0);
    }
  });
});

describe('worldPositionOf agrees with the SVG concept page', () => {
  /**
   * hexMath's `cubeToWorld` (pointy-top: worldX = size*sqrt3*(x + z/2),
   * worldZ = size*1.5*z) and atlas.ts's `hexCenter` (pointy: x =
   * size*sqrt3*(q + r/2), y = size*1.5*r) are the SAME formula once
   * cube.x=q and cube.z=r — this asserts that identity holds exactly,
   * cell by cell, over the entire real 224-cell reference tomb capture.
   * If a future edit to either file's constant/sign drifted the two
   * apart, this is what would catch it; a bare round-trip test would not
   * (the swapped-both-ways failure mode rpg-toolkit#1150 taught).
   */
  it('matches hexCenter(pointy) exactly for every cell of the real tomb', () => {
    for (const cell of referenceTombCells.cells as { x: number; y: number }[]) {
      const world = worldPositionOf(cell as never, 1);
      const svg = hexCenter(cell as never, 1, 'pointy');
      expect(world.x).toBeCloseTo(svg.x, 10);
      expect(world.z).toBeCloseTo(svg.y, 10);
    }
  });

  /**
   * The pixel-formula discriminator itself: the authored tomb is three
   * chambers in a row (atlas.test.ts: "6 + 10 + 12 cells wide and 8
   * tall"), so a CORRECT 3D placement is comfortably wider than it is
   * tall. The diagonal-staircase bug this guards against (rpg-toolkit
   * #1140/#1150) produced a roughly-square/diagonal footprint instead —
   * a wrong axial basis does not merely shift the picture, it changes
   * its shape.
   */
  it('places the real tomb as a wide footprint, not a diagonal staircase', () => {
    const worlds = (referenceTombCells.cells as { x: number; y: number }[]).map(
      (c) => worldPositionOf(c as never, 1)
    );
    const xs = worlds.map((w) => w.x);
    const zs = worlds.map((w) => w.z);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...zs) - Math.min(...zs);
    expect(width / height).toBeGreaterThan(3);
    // ~28 columns * sqrt(3) hex spacing, ~8 rows * 1.5 hex spacing.
    expect(width).toBeGreaterThan(40);
    expect(width).toBeLessThan(55);
    expect(height).toBeGreaterThan(8);
    expect(height).toBeLessThan(13);
  });
});

describe('buildScene3D', () => {
  it('refuses a flat layout by name instead of drawing the rotated picture', () => {
    expect(() =>
      buildScene3D(
        { cells: [], props: [], boundaries: [], doorways: [] } as never,
        1,
        'flat'
      )
    ).toThrow(/pointy-top hexes only.*#763/);
  });

  it('places every cell as a floor tile keyed by its cube coordinate', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(1, 0)],
        props: [],
        boundaries: [],
        doorways: [],
      } as never,
      1,
      'pointy'
    );
    expect(scene.floorTiles.size).toBe(2);
    const cube = positionToCube(pos(1, 0));
    expect(scene.floorTiles.get(coordToKey(cube))).toEqual({
      ...cube,
      roomId: '',
    });
  });

  it('projects every positioned AtlasProp by its opaque ref and axial cell, carrying facing/offset verbatim', () => {
    const scene = buildScene3D(
      {
        cells: [pos(3, -2), pos(0, 1)],
        boundaries: [],
        doorways: [],
        props: [
          {
            ref: 'dnd5e:props:pillar',
            at: pos(3, -2),
            blocksMovement: true,
            blocksLineOfSight: true,
            facing: 'ne',
            offsetX: 0.2,
            offsetY: -0.1,
          },
          {
            ref: 'homebrew:props:unknown',
            at: pos(0, 1),
            blocksMovement: false,
            blocksLineOfSight: false,
            facing: '',
            offsetX: 0,
            offsetY: 0,
          },
        ],
      } as never,
      1,
      'pointy'
    );

    expect(scene.props).toEqual([
      {
        ref: 'dnd5e:props:pillar',
        position: { x: 3, y: -1, z: -2 },
        facing: 'ne',
        offset: { x: 0.2, y: -0.1 },
      },
      {
        ref: 'homebrew:props:unknown',
        position: { x: 0, y: -1, z: 1 },
        facing: '',
        offset: { x: 0, y: 0 },
      },
    ]);
  });

  it('coerces a schema-skewed AtlasProp (facing/offsetX/offsetY entirely absent, not just empty/zero) to the same "unfaced, centered" default a well-formed one gets — never a NaN-invisible prop (rpg-project#261, live-walk field report on PR #795)', () => {
    // Simulates an older server / a stale client-side proto schema: the
    // decoded AtlasProp is genuinely MISSING these three fields, not
    // just carrying their zero values — a plain `as never` cast, same
    // as this file's other AtlasProp fixtures, so TypeScript can't
    // paper over the absence the way a real generated type would.
    const scene = buildScene3D(
      {
        cells: [pos(1, 0)],
        boundaries: [],
        doorways: [],
        props: [
          {
            ref: 'dnd5e:props:statue-reaper',
            at: pos(1, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
            // facing / offsetX / offsetY intentionally omitted.
          },
        ],
      } as never,
      1,
      'pointy'
    );

    const prop = scene.props[0];
    expect(prop.facing).toBe('');
    expect(prop.offset).toEqual({ x: 0, y: 0 });

    const world = propWorldPosition(prop, 1);
    expect(Number.isFinite(world.x)).toBe(true);
    expect(Number.isFinite(world.z)).toBe(true);
    expect(world).toEqual(worldPositionOf(pos(1, 0), 1));
  });

  /**
   * Not a re-test of the wall-run geometry itself (atlasWallRuns.test.ts
   * owns that) — just confirms buildScene3D actually calls through to it
   * and returns what it returns, so the two modules can't silently drift
   * apart (e.g. a future edit renaming a field in one without the other).
   * Not an exact run count: this tiny 4-cell fixture's real hex-corner
   * outline is a small irregular diamond, not a rectangle (a corner cell
   * only has 2 of its 6 neighbors as other floor cells), so the real
   * outline-tracing chain (rpg-dnd5e-web#787) legitimately produces more
   * than the old bounding-rectangle envelope's fixed 4 — that fixed count
   * was exactly the "envelope follows the bounding box, not the real
   * outline" bug #787 fixed, so asserting it here would re-pin the bug.
   */
  it('wires atlasWallRuns.boundariesToWallRuns straight through', () => {
    const cells = [pos(0, 0), pos(0, 1), pos(1, 0), pos(1, 1)];
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
      {
        from: pos(1, 0),
        to: pos(0, 1),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
      {
        from: pos(0, 1),
        to: pos(1, 1),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ];
    const scene = buildScene3D(
      { cells, props: [], boundaries, doorways: [] } as never,
      1,
      'pointy'
    );
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    expect(scene.doorGaps).toHaveLength(0);
  });
});

describe('propWorldPosition', () => {
  it('is exactly the cell center when offset is {0, 0}', () => {
    const world = propWorldPosition(
      { position: positionToCube(pos(2, -1)), offset: { x: 0, y: 0 } },
      1
    );
    expect(world).toEqual(worldPositionOf(pos(2, -1), 1));
  });

  it('adds offset * hexSize to the cell center, exactly, on both axes', () => {
    const hexSize = 1.75;
    const cell = positionToCube(pos(-3, 5));
    const center = worldPositionOf(pos(-3, 5), hexSize);
    const world = propWorldPosition(
      { position: cell, offset: { x: 0.2, y: -0.4 } },
      hexSize
    );
    expect(world.x).toBeCloseTo(center.x + 0.2 * hexSize, 12);
    expect(world.z).toBeCloseTo(center.z + -0.4 * hexSize, 12);
  });
});
