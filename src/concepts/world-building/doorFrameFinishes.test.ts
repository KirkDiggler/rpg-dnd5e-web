import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { GENERATED_WORLD_MATERIALS } from '@/generated/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { projectDoorFrameFinishes } from './doorFrameFinishes';

const original =
  GENERATED_WORLD_ASSETS[
    'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01'
  ]!;
const material = GENERATED_WORLD_MATERIALS[0]!;
const input = {
  asset: {
    ...original,
    surfaces: [
      ...original.surfaces!.filter((binding) => binding.node === 'Door_Frame'),
      { ...original.surfaces![0]!, id: 'upper-front', node: 'Upper' },
    ],
  },
  frame: {
    span: { before: 2, after: 2 },
    faceFinishes: [
      { side: 'positive-z' as const, materialRef: material.ref, phaseU: 0.25 },
    ],
  },
  catalog: {
    kind: 'pinned' as const,
    catalogSha256: 'a'.repeat(64),
    materials: [material],
    surfaces: [],
  },
  elevation: 1,
};

describe('independent frame finishes across declared parts', () => {
  it('projects the same supplied finish and phase to both fixed and upper masonry', () => {
    const plans = projectDoorFrameFinishes(input);
    expect(plans.map((p) => p.chart.surfaceId)).toEqual([
      'front',
      'upper-front',
    ]);
    expect(plans[0]!.material).toBe(plans[1]!.material);
    expect(plans[0]!.chart).toEqual({ ...plans[1]!.chart, surfaceId: 'front' });
  });
  it('still refuses an unavailable face instead of guessing another part', () => {
    expect(() =>
      projectDoorFrameFinishes({
        ...input,
        asset: { ...input.asset, surfaces: [] },
      })
    ).toThrow('compatible');
  });
});
