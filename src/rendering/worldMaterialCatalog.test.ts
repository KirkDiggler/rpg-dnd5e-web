// @vitest-environment node
import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { describe, expect, it } from 'vitest';
import {
  createPinnedWorldMaterialCatalog,
  parseWorldMaterialPreview,
} from './worldMaterialCatalog';
import type { WorldSurfaceMaterial } from './worldMaterialTypes';
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
const asset = GENERATED_WORLD_ASSETS[ref];
const image = {
  url: '/models/synty/world-materials/images/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  width: 1,
  height: 1,
};
const material: WorldSurfaceMaterial = {
  ref: 'dnd5e:material:test:gray',
  displayName: 'Gray',
  family: 'masonry',
  baseColor: image,
  normal: image,
  repeatMeters: [3.3, 3.3],
  normalScale: [1, 1],
  roughness: 0.5,
  metalness: 0,
};
const provider = { commit: 'c'.repeat(40), catalogSha256: 'a'.repeat(64) };
describe('independently pinned material/world registry', () => {
  it('joins only declared surfaces with their own model identity', () => {
    const bindings = [
      {
        id: 'front',
        node: 'WallBody_v1',
        material: 'Masonry_Front',
        side: 'positive-z' as const,
        family: 'masonry',
      },
    ];
    const result = createPinnedWorldMaterialCatalog({
      provider,
      materials: [material],
      assets: { [ref]: { ...asset, surfaces: bindings } },
    });
    expect(result).toMatchObject({
      kind: 'pinned',
      providerCommit: provider.commit,
      catalogSha256: provider.catalogSha256,
    });
    expect(result!.materials[0]).toBe(material);
    expect(result!.surfaces).toEqual([
      { assetRef: ref, glbSha256: asset.glbSha256, bindings },
    ]);
  });
  it('preserves detached channel declarations through pinned and preview projections', () => {
    const channels = [
      {
        assetRef: ref,
        representation: 'model' as const,
        glbSha256: asset.glbSha256,
        targets: [
          {
            id: 'body',
            label: 'Body',
            selectors: [{ node: 'Body', material: 'Paint' }],
            normal: {
              kind: 'adjustable' as const,
              minMultiplier: 0.5,
              maxMultiplier: 2,
            },
            emissive: { kind: 'absent' as const },
          },
        ],
      },
    ];
    const pinned = createPinnedWorldMaterialCatalog({
      provider,
      materials: [],
      assets: {},
      channelBindings: channels,
    });
    const preview = parseWorldMaterialPreview({
      kind: 'candidate',
      catalogSha256: provider.catalogSha256,
      materials: [],
      surfaces: [],
      channelBindings: channels,
    });
    channels[0].targets[0].selectors[0].node = 'changed';
    expect(pinned!.channelBindings![0].targets[0].selectors[0].node).toBe(
      'Body'
    );
    expect(preview.channelBindings![0].targets[0].selectors[0].node).toBe(
      'Body'
    );
    expect(() =>
      createPinnedWorldMaterialCatalog({
        provider: { ...provider, catalogSha256: null },
        materials: [],
        assets: {},
        channelBindings: channels,
      })
    ).toThrow(/Absent/);
    expect(() =>
      parseWorldMaterialPreview({ ...preview, channelBindings: null })
    ).toThrow();
  });

  it('does not treat miter tags as enrollment or silently fill absent resources', () => {
    const plain = { ...asset };
    delete plain.surfaces;
    expect(
      createPinnedWorldMaterialCatalog({
        provider,
        materials: [material],
        assets: { [ref]: plain },
      })!.surfaces
    ).toEqual([]);
    expect(
      createPinnedWorldMaterialCatalog({
        provider: { ...provider, catalogSha256: null },
        materials: [],
        assets: {},
      })
    ).toBeNull();
    expect(() =>
      createPinnedWorldMaterialCatalog({
        provider: { ...provider, catalogSha256: null },
        materials: [material],
        assets: {},
      })
    ).toThrow(/Absent/);
  });
});
