/**
 * The discriminator for `toOffset`/`fromOffset` (plan W, `offsetBridge`
 * test): an L-shaped region under BOTH orientations, one named cell,
 * and its world position computed two ways that share no code —
 *
 *   1. builder: offset `[col,row]` → `fromOffset` → axial → the game's
 *      own placement (`positionToCube` + `cubeToWorld` for pointy, which
 *      is what `buildScene3D` draws; `hexCenter` for both layouts, which
 *      the 2D canvas draws);
 *   2. the OFFSET pixel formula straight off Red Blob's odd-r / odd-q
 *      definitions, never touching axial at all.
 *
 * A swapped-both-ways bridge (rpg-toolkit#1150's failure) passes
 * `fromOffset(toOffset(x)) === x` and fails this.
 */
import { cubeToWorld } from '@/components/hex-grid/hexMath';
import { positionToCube } from '@/components/session/positionBridge';
import { describe, expect, it } from 'vitest';
import { hexCenter } from '../concepts/session-tomb/atlas';
import {
  areAdjacent,
  fromOffset,
  toOffset,
  type Axial,
  type OffsetPair,
  type Orientation,
} from './hexOffset';

const SQRT3 = Math.sqrt(3);
const SIZE = 1;

/** Red Blob's odd-r pixel formula, written in OFFSET terms only. */
function oddRPixel([col, row]: OffsetPair) {
  return {
    x: SIZE * SQRT3 * (col + 0.5 * (row & 1)),
    y: SIZE * 1.5 * row,
  };
}

/** Red Blob's odd-q pixel formula, written in OFFSET terms only. */
function oddQPixel([col, row]: OffsetPair) {
  return {
    x: SIZE * 1.5 * col,
    y: SIZE * SQRT3 * (row + 0.5 * (col & 1)),
  };
}

/** An L: a 4-wide bar on row 0 plus a 3-tall leg down column 0. Odd rows
 * AND odd columns both appear, so a scheme that shifts the wrong axis
 * moves at least one named cell. */
const L_SHAPE: OffsetPair[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [0, 1],
  [0, 2],
  [1, 2],
];

const NAMED: OffsetPair = [1, 2]; // odd row, odd column — bites either way

describe('toOffset / fromOffset pixel discriminator', () => {
  it('pointy: the named cell lands where odd-r says, via the game placement', () => {
    const axial = fromOffset('pointy', NAMED);
    const world = cubeToWorld(
      positionToCube({ x: axial.q, y: axial.r } as never),
      SIZE
    );
    const expected = oddRPixel(NAMED);
    expect(world.x).toBeCloseTo(expected.x, 10);
    expect(world.z).toBeCloseTo(expected.y, 10);
    // and the 2D canvas agrees with the 3D placement for pointy
    const center = hexCenter(
      { x: axial.q, y: axial.r } as never,
      SIZE,
      'pointy'
    );
    expect(center.x).toBeCloseTo(expected.x, 10);
    expect(center.y).toBeCloseTo(expected.y, 10);
  });

  it('flat: the named cell lands where odd-q says, via the 2D canvas placement', () => {
    const axial = fromOffset('flat', NAMED);
    const center = hexCenter({ x: axial.q, y: axial.r } as never, SIZE, 'flat');
    const expected = oddQPixel(NAMED);
    expect(center.x).toBeCloseTo(expected.x, 10);
    expect(center.y).toBeCloseTo(expected.y, 10);
  });

  it('the two orientations disagree on the same [col,row] (not one scheme wearing two labels)', () => {
    expect(fromOffset('pointy', NAMED)).not.toEqual(fromOffset('flat', NAMED));
    // pointy odd-r: [-1,1] neighbours the origin; flat odd-q: it does not.
    const origin: Axial = { q: 0, r: 0 };
    expect(areAdjacent(origin, fromOffset('pointy', [-1, 1]))).toBe(true);
    expect(areAdjacent(origin, fromOffset('flat', [-1, 1]))).toBe(false);
    expect(areAdjacent(origin, fromOffset('flat', [1, -1]))).toBe(true);
    expect(areAdjacent(origin, fromOffset('pointy', [1, -1]))).toBe(false);
  });

  it.each<Orientation>(['pointy', 'flat'])(
    '%s: every L cell maps to its own pixel and back (negative rows/cols too)',
    (orientation) => {
      const pixel = orientation === 'pointy' ? oddRPixel : oddQPixel;
      for (const pair of [
        ...L_SHAPE,
        [-3, -1],
        [-2, 3],
        [5, -4],
      ] as OffsetPair[]) {
        const axial = fromOffset(orientation, pair);
        const center = hexCenter(
          { x: axial.q, y: axial.r } as never,
          SIZE,
          orientation
        );
        const expected = pixel(pair);
        expect(center.x).toBeCloseTo(expected.x, 10);
        expect(center.y).toBeCloseTo(expected.y, 10);
        expect(toOffset(orientation, axial)).toEqual(pair);
      }
    }
  );

  it('matches the toolkit on the tomb corner: [0,6] under pointy is axial (-3,6)', () => {
    // referenceTombCells.json's first cell — the v1 embed's own output.
    expect(fromOffset('pointy', [0, 6])).toEqual({ q: -3, r: 6 });
    expect(toOffset('pointy', { q: -3, r: 6 })).toEqual([0, 6]);
  });
});
