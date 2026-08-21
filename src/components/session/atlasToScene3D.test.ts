/**
 * atlasToScene3D tests — the 3D twin of `atlas.test.ts`.
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
import { coordToKey, hexEdgeBetween } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { hexCenter } from '../../concepts/session-tomb/atlas';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import {
  buildScene3D,
  positionToCube,
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
  it('places every cell as a floor tile keyed by its cube coordinate', () => {
    const scene = buildScene3D(
      { cells: [pos(0, 0), pos(1, 0)], boundaries: [], doorways: [] } as never,
      1
    );
    expect(scene.floorTiles.size).toBe(2);
    const cube = positionToCube(pos(1, 0));
    expect(scene.floorTiles.get(coordToKey(cube))).toEqual({
      ...cube,
      roomId: '',
    });
  });

  it('builds one edge-aligned wall per declared boundary between real neighbours', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(1, 0)],
        boundaries: [
          {
            from: pos(0, 0),
            to: pos(1, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
          },
        ],
        doorways: [],
      } as never,
      1
    );
    expect(scene.walls).toHaveLength(1);
    const expectedEdge = hexEdgeBetween(
      positionToCube(pos(0, 0)),
      positionToCube(pos(1, 0)),
      1
    );
    expect(scene.walls[0]!.edge).toEqual(expectedEdge);
    expect(scene.walls[0]!.blocksMovement).toBe(true);
    expect(scene.walls[0]!.blocksLineOfSight).toBe(true);
  });

  it('builds one edge-aligned door per declared doorway', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(1, 0)],
        boundaries: [],
        doorways: [{ connection: 'hall-1', from: pos(0, 0), to: pos(1, 0) }],
      } as never,
      1
    );
    expect(scene.doors).toHaveLength(1);
    expect(scene.doors[0]!.connection).toBe('hall-1');
  });

  /**
   * Same discipline as atlas.ts's buildScene: a wall/door silently drawn
   * from a missing endpoint would land somewhere plausible-looking and
   * wrong (the origin, or wherever the geometric construction happens to
   * put it) — dropped instead.
   */
  it('drops a boundary with a missing endpoint', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0)],
        boundaries: [
          {
            from: pos(0, 0),
            to: undefined,
            blocksMovement: true,
            blocksLineOfSight: true,
          },
        ],
        doorways: [],
      } as never,
      1
    );
    expect(scene.walls).toHaveLength(0);
  });

  it('drops a doorway with a missing endpoint', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0)],
        boundaries: [],
        doorways: [{ connection: 'broken', from: undefined, to: pos(1, 0) }],
      } as never,
      1
    );
    expect(scene.doors).toHaveLength(0);
  });

  /**
   * `hexEdgeBetween` itself does not check adjacency (its own doc comment:
   * "hexDistance must be 1 — callers get this for free... always adjacent
   * by construction") — it will happily compute a geometrically
   * plausible-looking edge for any two cube coordinates. This is the
   * check that keeps a non-adjacent boundary from being drawn anyway.
   */
  it('drops a boundary between cells that are not adjacent', () => {
    const scene = buildScene3D(
      {
        cells: [pos(0, 0), pos(4, 0)],
        boundaries: [
          {
            from: pos(0, 0),
            to: pos(4, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
          },
        ],
        doorways: [],
      } as never,
      1
    );
    expect(scene.walls).toHaveLength(0);
  });
});
