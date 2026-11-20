import { describe, expect, it } from 'vitest';
import type { StructuralWallSurface } from './structuralWalls';
import { assertWallHeightEdit } from './wallHeightEdits';

function wall(height: number): StructuralWallSurface {
  return {
    id: 'wall',
    label: 'Wall',
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    appearance: {
      assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_01',
      height,
      thickness: 0.3,
      elevation: 0,
    },
    openings: [
      {
        id: 'opening',
        position: 5,
        width: 1,
        door: {
          id: 'door',
          assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01',
        },
      },
    ],
  };
}
describe('height edits before owner commit', () => {
  it('accepts explicit supported heights and refuses to squash the opening', () => {
    expect(() =>
      assertWallHeightEdit({ walls: [wall(6)], previousWalls: [wall(3)] })
    ).not.toThrow();
    expect(() =>
      assertWallHeightEdit({ walls: [wall(1)], previousWalls: [wall(3)] })
    ).toThrow('fixed region');
    expect(() =>
      assertWallHeightEdit({ walls: [wall(1)], previousWalls: [] })
    ).toThrow('fixed region');
  });
  it('preserves unchanged imported intent so unrelated edits do not block repair', () => {
    expect(() =>
      assertWallHeightEdit({ walls: [wall(1)], previousWalls: [wall(1)] })
    ).not.toThrow();
    const plain = { ...wall(1), openings: [] };
    expect(() =>
      assertWallHeightEdit({ walls: [wall(1)], previousWalls: [plain] })
    ).toThrow('fixed region');
    expect(() =>
      assertWallHeightEdit({ walls: [plain], previousWalls: [wall(1)] })
    ).not.toThrow();
  });
});
