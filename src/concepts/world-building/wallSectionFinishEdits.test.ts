import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { expect, it } from 'vitest';
import { finishRoomFixture, GRAY_REF } from './roomFinishTestFixtures';
import { assertWallSectionFinishEdit } from './wallSectionFinishEdits';
const image = {
  url: '/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 1,
  width: 1,
  height: 1,
};
const catalog: WorldMaterialCatalog = {
  kind: 'candidate',
  catalogSha256: 'a'.repeat(64),
  surfaces: [],
  materials: [
    {
      ref: GRAY_REF,
      displayName: 'Gray',
      family: 'masonry',
      baseColor: image,
      normal: image,
      repeatMeters: [3, 3],
      normalScale: [1, 1],
      roughness: 0.5,
      metalness: 0,
    },
  ],
};
function draft(ref: string) {
  const value = finishRoomFixture();
  value.room.walls = [value.room.walls![0]];
  value.room.walls[0].appearance.sections = [
    { id: 'feature', assetRef: ref, position: 4, width: 3.75 },
  ];
  value.scene.wallFinishes = { north: { 'positive-z': GRAY_REF } };
  return value;
}
it('accepts a configured masonry section but refuses an unpaintable frame before owner commit', () => {
  const previous = finishRoomFixture();
  for (const name of [
    'castle_wall_opening_single_01',
    'castle_wall_opening_single_02',
    'castle_wall_opening_double_01',
    'castle_gateway_opening_01',
    'castle_gateway_opening_large_01',
  ]) {
    expect(() =>
      assertWallSectionFinishEdit({
        draft: draft('dnd5e:env:fantasy-kingdom:' + name),
        previous,
        catalog,
      })
    ).not.toThrow();
  }
  expect(() =>
    assertWallSectionFinishEdit({
      draft: draft('dnd5e:env:fantasy-kingdom:house_wall_opening_01'),
      previous,
      catalog,
    })
  ).toThrow(/feature.*compatible/);
});
it('refuses a newly selected incompatible finish but preserves unchanged imported intent', () => {
  const value = draft('dnd5e:env:fantasy-kingdom:house_wall_opening_01');
  expect(() =>
    assertWallSectionFinishEdit({
      draft: value,
      previous: structuredClone(value),
      catalog: null,
    })
  ).not.toThrow();
  const previous = structuredClone(value);
  delete previous.scene.wallFinishes;
  expect(() =>
    assertWallSectionFinishEdit({ draft: value, previous, catalog })
  ).toThrow(/compatible/);
  const original = structuredClone(value);
  delete original.scene.wallFinishes;
  expect(() =>
    assertWallSectionFinishEdit({ draft: original, previous, catalog: null })
  ).not.toThrow();
});
