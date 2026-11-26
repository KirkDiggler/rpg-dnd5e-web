import { describe, expect, it, vi } from 'vitest';
import type { StructuralWallSurface } from './structuralWalls';
import { assertWallHeightEdit } from './wallHeightEdits';

vi.mock('@/generated/worldAssetCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/generated/worldAssetCatalog')>();
  return {
    ...actual,
    GENERATED_WORLD_ASSETS: {
      ...actual.GENERATED_WORLD_ASSETS,
      'anchored-height-fixture': {
        boundsMeters: [2, 3.5, 0.3],
        heightFit: {
          mode: 'anchored',
          node: 'Infill',
          capNode: 'Cap',
          lowerAnchor: 'Lower',
          upperAnchor: 'Upper',
          lowerHeight: 2,
          upperHeight: 3,
          extension: 'stretch',
        },
      },
    },
  };
});

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
  it('uses the anchored native minimum before committing new wall or door heights', () => {
    const anchored = (height: number) => {
      const result = wall(height);
      result.appearance.assetRef = 'anchored-height-fixture';
      result.openings = [];
      return result;
    };
    expect(() =>
      assertWallHeightEdit({
        walls: [anchored(6)],
        previousWalls: [anchored(3.5)],
      })
    ).not.toThrow();
    expect(() =>
      assertWallHeightEdit({
        walls: [anchored(3.4)],
        previousWalls: [anchored(3.5)],
      })
    ).toThrow('native minimum');
    expect(() =>
      assertWallHeightEdit({
        walls: [anchored(1)],
        previousWalls: [anchored(1)],
      })
    ).not.toThrow();
    const attached = wall(3.4);
    attached.openings[0]!.door!.assetRef = 'anchored-height-fixture';
    expect(() =>
      assertWallHeightEdit({ walls: [attached], previousWalls: [] })
    ).toThrow('native minimum');
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
