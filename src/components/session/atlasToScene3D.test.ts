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
import { resolveDungeonLighting } from '@/rendering/dungeonLighting';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { describe, expect, it } from 'vitest';
import { cellBoundingBox } from '../../author/hexGeometry';
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
        {
          cells: [],
          props: [],
          segments: [],
          doorways: [],
          regions: [],
        } as never,
        1,
        'flat'
      )
    ).toThrow(/pointy-top hexes only.*#763/);
  });

  it('normalizes authored region lighting and recognized prop sources once', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(1, 0)],
        props: [
          {
            ref: 'dnd5e:props:brazier',
            at: pos(0, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
            facing: 'ne',
            offsetX: 0.25,
            offsetY: -0.15,
            offsetZ: 0.4,
          },
          {
            ref: 'dnd5e:props:pillar',
            at: pos(1, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
          },
        ],
        segments: [],
        doorways: [],
        regions: [
          {
            id: 'bright',
            archetype: 'crypt',
            cells: [pos(0, 0)],
            lighting: { intensity: 0.6 },
          },
          {
            id: 'dark',
            archetype: 'crypt',
            cells: [pos(1, 0)],
            lighting: { intensity: 0.15 },
          },
        ],
      } as never,
      1,
      'pointy'
    );

    expect(scene.lighting.mode).toBe('crypt');
    expect([...scene.lighting.intensityByCell.entries()]).toEqual([
      ['0,0,0', 0.6],
      ['1,-1,0', 0.15],
    ]);
    expect(scene.lighting.sources).toHaveLength(1);
    expect(scene.lighting.sources[0]?.ref).toBe('dnd5e:props:brazier');
    // The planar offset is bounding-box fractions, not raw hexSize —
    // see propWorldPosition's own tests below for the acceptance pin.
    const { width, height } = cellBoundingBox('pointy', 1);
    expect(scene.lighting.sources[0]?.position).toEqual([
      0.25 * width,
      0.4 + DUNGEON_SURFACE_Y + 0.9,
      -0.15 * height,
    ]);
    expect(scene.lighting.sources[0]?.position[1]).not.toBe(
      0.4 + DUNGEON_SURFACE_Y + 0.9 + 0.4
    );
  });

  it('falls back atomically for malformed recognized source placement', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0)],
        props: [
          {
            ref: 'dnd5e:props:brazier',
            at: pos(0, 0),
            offsetX: Number.NaN,
            offsetY: 0,
            offsetZ: 0,
          },
        ],
        segments: [],
        doorways: [],
        regions: [
          {
            id: 'room',
            archetype: 'crypt',
            cells: [pos(0, 0)],
            lighting: { intensity: 0.6 },
          },
        ],
      } as never,
      1,
      'pointy'
    );

    expect(scene.lighting.fallbackReason).toBe('invalid-source-placement');
    const plan = resolveDungeonLighting(scene.lighting, { x: 0, z: 0 });
    expect(plan.mode).toBe('legacy');
    expect(plan.ambientIntensity).toBe(0.6);
    expect(plan.directionalIntensity).toBe(0.8);
    expect(plan.pointLights).toEqual([]);
    expect(plan.floorExposureByCell.size).toBe(0);
    expect(plan.floorPoolsByCell.size).toBe(0);
    expect(plan.pointLights.flatMap(({ position }) => position)).not.toContain(
      Number.NaN
    );
  });

  it('copies region archetypes in order into a frozen scene field', () => {
    const scene = buildScene3D(
      {
        cells: [],
        props: [],
        segments: [],
        doorways: [],
        regions: [
          { id: 'second', archetype: 'crypt' },
          { id: 'first', archetype: 'crypt' },
        ],
      } as never,
      1,
      'pointy'
    );

    expect(scene.archetypes).toEqual(['crypt', 'crypt']);
    expect(Object.isFrozen(scene.archetypes)).toBe(true);
  });

  it('does not trim or select archetype words while building the scene', () => {
    const scene = buildScene3D(
      {
        cells: [],
        props: [],
        segments: [],
        doorways: [],
        regions: [
          { id: 'first', archetype: ' crypt ' },
          { id: 'second', archetype: '' },
        ],
      } as never,
      1,
      'pointy'
    );

    expect(scene.archetypes).toEqual([' crypt ', '']);
  });

  it('places every cell as a floor tile keyed by its cube coordinate', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(1, 0)],
        props: [],
        segments: [],
        doorways: [],
        regions: [],
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
        segments: [],
        doorways: [],
        regions: [],
        props: [
          {
            ref: 'dnd5e:props:pillar',
            at: pos(3, -2),
            blocksMovement: true,
            blocksLineOfSight: true,
            facing: 'ne',
            offsetX: 0.2,
            offsetY: -0.1,
            offsetZ: 0.6,
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
        offset: { x: 0.2, y: -0.1, z: 0.6 },
      },
      {
        ref: 'homebrew:props:unknown',
        position: { x: 0, y: -1, z: 1 },
        facing: '',
        offset: { x: 0, y: 0, z: 0 },
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
        segments: [],
        doorways: [],
        regions: [],
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
    expect(prop.offset).toEqual({ x: 0, y: 0, z: 0 });

    const world = propWorldPosition(prop, 1);
    expect(Number.isFinite(world.x)).toBe(true);
    expect(Number.isFinite(world.z)).toBe(true);
    expect(world).toEqual({ ...worldPositionOf(pos(1, 0), 1), y: 0 });
  });

  /**
   * Not a re-test of the wall-run geometry itself (atlasWallRuns.test.ts
   * owns that) — just confirms buildScene3D actually calls through to
   * `segmentsToWallRuns` with both `segments` AND `doorways`, and returns
   * what it returns, so the two modules can't silently drift apart (e.g.
   * a future edit renaming a field in one without the other).
   */
  it('wires atlasWallRuns.segmentsToWallRuns straight through', () => {
    const cells = [pos(0, 0), pos(0, 1), pos(1, 0), pos(1, 1)];
    const segments = [{ from: { q: 0, r: 0 }, to: { q: 3, r: 0 }, height: 0 }];
    const doorways = [{ connection: 'door-1', from: pos(1, 0), to: pos(1, 1) }];
    const scene = buildScene3D(
      { cells, props: [], segments, doorways, regions: [] } as never,
      1,
      'pointy'
    );
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    // A doorway whose crossing lies on no segment still draws its own
    // gap (atlasWallRuns.ts's documented "a door with no wall" fallback)
    // — proving buildScene3D passes `doorways` through as well as
    // `segments`, not just one of the two.
    expect(scene.doorGaps).toHaveLength(1);
  });
});

describe('propWorldPosition', () => {
  it('is exactly the cell center when offset is {0, 0}', () => {
    const world = propWorldPosition(
      { position: positionToCube(pos(2, -1)), offset: { x: 0, y: 0, z: 0 } },
      1
    );
    expect(world).toEqual({ ...worldPositionOf(pos(2, -1), 1), y: 0 });
  });

  /**
   * The planar offset is BOUNDING-BOX FRACTIONS, not raw hexSize
   * (propWorldPosition's own doc comment, design §1.11): x in cell
   * WIDTHS (√3·hexSize for pointy-top), y in cell HEIGHTS (2·hexSize).
   */
  it('adds offset * the cell bounding box to the cell center, exactly, on both axes', () => {
    const hexSize = 1.75;
    const cell = positionToCube(pos(-3, 5));
    const center = worldPositionOf(pos(-3, 5), hexSize);
    const { width, height } = cellBoundingBox('pointy', hexSize);
    const world = propWorldPosition(
      { position: cell, offset: { x: 0.2, y: -0.4, z: 0 } },
      hexSize
    );
    expect(world.x).toBeCloseTo(center.x + 0.2 * width, 12);
    expect(world.z).toBeCloseTo(center.z + -0.4 * height, 12);
  });

  /**
   * ACCEPTANCE: a prop at offset [0.5, 0] sits on the SIDE of its hex,
   * not inside it. Under the OLD circumradius unit, `[0.5, 0]` put a
   * prop at 0.5·hexSize east of centre — halfway to a VERTEX, a point
   * with no meaning on the hex's own boundary, still inside the hex's
   * interior. In bounding-box fractions the same `[0.5, 0]` lands
   * exactly `√3/2 · hexSize` east of centre: the pointy-top hex's own
   * flat-to-flat inradius, i.e. the midpoint of its east side.
   */
  it('a prop at offset [0.5, 0] sits on the SIDE of its hex, not inside it', () => {
    const hexSize = 2;
    const cell = positionToCube(pos(0, 0));
    const center = worldPositionOf(pos(0, 0), hexSize);
    const world = propWorldPosition(
      { position: cell, offset: { x: 0.5, y: 0, z: 0 } },
      hexSize
    );
    const inradius = (Math.sqrt(3) / 2) * hexSize;
    expect(world.x).toBeCloseTo(center.x + inradius, 12);
    expect(world.z).toBeCloseTo(center.z, 12);
    // The old, wrong answer: 0.5 * hexSize (a vertex-ward point strictly
    // inside the hex, not its side) — named explicitly so a regression
    // back to the circumradius unit shows up as a wrong number, not just
    // a missing one.
    expect(world.x).not.toBeCloseTo(center.x + 0.5 * hexSize, 6);
  });

  it('raises world-Y by offset.z * hexSize, exactly — floor + offset_z · HEX_SIZE (rpg-project#272)', () => {
    const hexSize = 1.75;
    const world = propWorldPosition(
      {
        position: positionToCube(pos(-3, 5)),
        offset: { x: 0, y: 0, z: 2.4 },
      },
      hexSize
    );
    expect(world.y).toBe(2.4 * hexSize);
  });
});
