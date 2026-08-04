import { describe, expect, it } from 'vitest';
import { deriveCanvasFloorCells } from './canvasFloor';

describe('deriveCanvasFloorCells', () => {
  it('produces every cell in a small canvas bounds, none missing or duplicated', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 3, height: 2 },
      holes: [],
    });
    expect(cells).toHaveLength(6);
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    expect(keys.size).toBe(6);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 2; row++) {
        expect(keys.has(`${col},${row}`)).toBe(true);
      }
    }
  });

  it('excludes every hole cell, and only those', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 4, height: 4 },
      holes: [
        [1, 1],
        [2, 2],
      ],
    });
    expect(cells).toHaveLength(4 * 4 - 2);
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    expect(keys.has('1,1')).toBe(false);
    expect(keys.has('2,2')).toBe(false);
    // A cell NOT punched as a hole stays present.
    expect(keys.has('0,0')).toBe(true);
    expect(keys.has('3,3')).toBe(true);
  });

  it('a hole outside the canvas bounds is simply irrelevant — no crash, no phantom exclusion', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 2, height: 2 },
      holes: [[99, 99]],
    });
    expect(cells).toHaveLength(4);
  });

  it('falls back to DEFAULT_CANVAS (20x30) when doc.canvas is null', () => {
    const cells = deriveCanvasFloorCells({ canvas: null, holes: [] });
    expect(cells).toHaveLength(20 * 30);
  });

  it('a fully-holed canvas produces an empty floor, not an error', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 1, height: 1 },
      holes: [[0, 0]],
    });
    expect(cells).toEqual([]);
  });
});
