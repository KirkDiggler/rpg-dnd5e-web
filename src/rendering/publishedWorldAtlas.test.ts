import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import {
  GENERATED_WORLD_ATLAS_BINDINGS,
  GENERATED_WORLD_ATLAS_MATERIALS,
  GENERATED_WORLD_MATERIAL_COLLECTIONS,
  GENERATED_WORLD_MATERIAL_PROVIDER,
  GENERATED_WORLD_MATERIALS,
} from '@/generated/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { resolveWorldAtlasMaterials } from './worldAtlasCatalog';
import { createPinnedWorldMaterialCatalog } from './worldMaterialCatalog';

// Actual independently pinned model/material metadata, not a candidate fixture.
const catalog = createPinnedWorldMaterialCatalog({
  provider: GENERATED_WORLD_MATERIAL_PROVIDER,
  materials: GENERATED_WORLD_MATERIALS,
  assets: GENERATED_WORLD_ASSETS,
  atlas: {
    materials: GENERATED_WORLD_ATLAS_MATERIALS,
    collections: GENERATED_WORLD_MATERIAL_COLLECTIONS,
    bindings: GENERATED_WORLD_ATLAS_BINDINGS,
  },
})!;

const owners = [
  'dnd5e:env:fantasy-kingdom:house_wall_05',
  'dnd5e:props:fantasy-kingdom:chair_fancy_01',
];

describe('normal pinned Kingdom atlas delivery', () => {
  it.each([
    '01_A',
    '01_B',
    '01_C',
    '02_A',
    '02_B',
    '02_C',
    '03_A',
    '03_B',
    '03_C',
    '04_A',
    '04_B',
    '04_C',
  ])(
    'resolves %s on actual wall and prop owners without preview resources',
    (pack) => {
      expect(catalog.kind).toBe('pinned');
      for (const assetRef of owners) {
        const materialRef = `dnd5e:material:fantasy-kingdom:atlas_${pack.toLowerCase()}`;
        const result = resolveWorldAtlasMaterials({
          assetRef,
          glbSha256: GENERATED_WORLD_ASSETS[assetRef].glbSha256,
          overrides: [{ surfaceId: 'atlas', materialRef }],
          atlas: catalog.atlas,
        })!;
        expect(result.plans[0].material.ref).toBe(materialRef);
        expect(
          result.binding.surfaces.find((surface) => surface.id === 'atlas')
            ?.texCoord
        ).toBe(0);
        const material = result.plans[0].material;
        expect(material.mapping).toBe('authored-uv');
        expect(material.normal).toBeNull();
        expect(material.emissive).toBeNull();
        expect(material.baseColor.url).toBe(
          `/models/synty/world-materials/images/${material.baseColor.sha256}.png?v=${material.baseColor.sha256}`
        );
        expect(
          resolveWorldAtlasMaterials({
            assetRef,
            glbSha256: GENERATED_WORLD_ASSETS[assetRef].glbSha256,
            overrides: [],
            atlas: catalog.atlas,
          })
        ).toBeUndefined();
      }
    }
  );

  it('joins every declared target to the independently pinned model bytes', () => {
    expect(catalog.atlas!.bindings.length).toBeGreaterThan(0);
    for (const binding of catalog.atlas!.bindings) {
      expect(
        GENERATED_WORLD_ASSETS[binding.assetRef]?.glbSha256,
        binding.assetRef
      ).toBe(binding.glbSha256);
    }
  });
});
