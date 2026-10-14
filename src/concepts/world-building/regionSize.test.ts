import { describe, expect, it } from 'vitest';
import { regionSize, regionSizeText } from './regionSize';

const workspace = { hexRadius: 6, horizontalLimit: 12 };

describe('regionSize', () => {
  it("a hex-union region's size is its cell count", () => {
    const size = regionSize(
      { workspace },
      {
        id: 'forest',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 2, r: 0 },
          ],
        },
      }
    );
    expect(size?.hexes).toBe(3);
    expect(size?.cells).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it("a polygon region's size counts cells whose centre is inside", () => {
    // Centres inside the square: three on row 0, two each on rows -1 and 1.
    const size = regionSize(
      { workspace },
      {
        id: 'room',
        status: 'resolved',
        area: {
          kind: 'polygon',
          ring: [
            { x: -2, z: -2 },
            { x: 2, z: -2 },
            { x: 2, z: 2 },
            { x: -2, z: 2 },
          ],
        },
      }
    );
    expect(size?.hexes).toBe(7);
    expect(size?.cells).toContainEqual({ q: 0, r: 0 });
    expect(size?.cells).not.toContainEqual({ q: 2, r: 0 });
  });

  it("a region's width and height are its column and row spans", () => {
    // Odd-r columns: (0,0) is column 0, (3,0) column 3, (0,2) column 1.
    const size = regionSize(
      { workspace },
      {
        id: 'l',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 0, r: 0 },
            { q: 3, r: 0 },
            { q: 0, r: 2 },
          ],
        },
      }
    );
    expect(size).toMatchObject({ hexes: 3, width: 4, height: 3 });
    expect(regionSizeText(size)).toBe('3 hexes · 4 × 3');
  });

  it('an unresolved region has no size', () => {
    const size = regionSize(
      { workspace },
      { id: 'r', status: 'unresolved', reason: 'open' }
    );
    expect(size).toBeNull();
    expect(regionSizeText(size)).toBe('unresolved');
  });
});
