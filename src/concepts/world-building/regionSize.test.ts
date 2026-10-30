import { describe, expect, it } from 'vitest';
import { regionSize, regionSizeText } from './regionSize';

describe('regionSize', () => {
  it("a region's size is its cell count", () => {
    const size = regionSize({
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
    });
    expect(size?.hexes).toBe(3);
    expect(size?.cells).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it("a region's width and height are its column and row spans", () => {
    // Odd-r columns: (0,0) is column 0, (3,0) column 3, (0,2) column 1.
    const size = regionSize({
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
    });
    expect(size).toMatchObject({ hexes: 3, width: 4, height: 3 });
    expect(regionSizeText(size)).toBe('3 hexes · 4 × 3');
    expect(
      regionSizeText(
        regionSize({
          id: 'one',
          status: 'resolved',
          area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
        })
      )
    ).toBe('1 hex · 1 × 1');
  });

  // Regions are their cells (rpg-project#725): the only unresolved region is a
  // declared, unpainted one, which reads "no hexes".
  it('an unpainted region has no size', () => {
    const size = regionSize({ id: 'r', status: 'unresolved', reason: 'empty' });
    expect(size).toBeNull();
    expect(regionSizeText(size)).toBe('no hexes');
  });
});
