import { resolveNpcAppearance } from '@/generated/npcAppearanceCatalog';
import type { MaterialChannelBinding } from '@/rendering/materialChannelTypes';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { expect, it } from 'vitest';
import { resolveNpcMaterialChannelTreatment } from './npcAppearanceModel';

function fixture() {
  const appearance = resolveNpcAppearance('dnd5e:npcs:kingdom:merchant-01')!;
  const targets: MaterialChannelBinding['targets'] = [
    {
      id: 'body',
      label: 'Body',
      selectors: [{ node: 'Body', material: 'BodyMaterial' }],
      normal: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
      emissive: { kind: 'fixed' },
    },
  ];
  const catalog: WorldMaterialCatalog = {
    kind: 'pinned',
    catalogSha256: 'c'.repeat(64),
    materials: [],
    surfaces: [],
    channelBindings: [
      {
        assetRef: appearance.assetRef,
        representation: 'standing',
        glbSha256: appearance.standingSha256,
        targets,
      },
      {
        assetRef: appearance.assetRef,
        representation: 'downed',
        glbSha256: appearance.downedSha256,
        targets: [
          {
            ...targets[0],
            selectors: [{ node: 'FallenBody', material: 'BodyMaterial' }],
          },
        ],
      },
    ],
  };
  return {
    appearance,
    catalog,
    adjustments: [
      { targetId: 'body', normal: { mode: 'scale' as const, multiplier: 1 } },
    ],
  };
}
it('binds the current body representation to its exact existing owner identity', () => {
  const f = fixture();
  for (const downed of [false, true]) {
    const result = resolveNpcMaterialChannelTreatment({
      appearanceRef: f.appearance.assetRef,
      url: downed ? f.appearance.downedUrl : f.appearance.standingUrl,
      downed,
      catalog: f.catalog,
      adjustments: f.adjustments,
    })!;
    expect(result.representation).toBe(downed ? 'downed' : 'standing');
    expect(result.glbSha256).toBe(
      downed ? f.appearance.downedSha256 : f.appearance.standingSha256
    );
    expect(result.binding?.targets[0].selectors[0].node).toBe(
      downed ? 'FallenBody' : 'Body'
    );
    expect(result.adjustments).toEqual(f.adjustments);
    expect(result.adjustments).not.toBe(f.adjustments);
  }
});
it('refuses missing, stale or mismatched body identities rather than guessing from rules or URL names', () => {
  const f = fixture();
  const input = {
    appearanceRef: f.appearance.assetRef,
    url: f.appearance.standingUrl,
    catalog: f.catalog,
    adjustments: f.adjustments,
  };
  expect(() =>
    resolveNpcMaterialChannelTreatment({ ...input, appearanceRef: undefined })
  ).toThrow(/appearance|identity/);
  expect(() =>
    resolveNpcMaterialChannelTreatment({ ...input, url: '/other.glb' })
  ).toThrow(/identity|URL/);
  expect(() =>
    resolveNpcMaterialChannelTreatment({ ...input, catalog: null })
  ).toThrow(/catalog|binding/);
  expect(() =>
    resolveNpcMaterialChannelTreatment({
      ...input,
      catalog: {
        ...f.catalog,
        channelBindings: f.catalog.channelBindings!.slice(0, 1),
      },
    })
  ).toThrow(/downed|representation/);
  expect(() =>
    resolveNpcMaterialChannelTreatment({
      ...input,
      catalog: {
        ...f.catalog,
        channelBindings: f.catalog.channelBindings!.map((binding) => ({
          ...binding,
          glbSha256: '0'.repeat(64),
        })),
      },
    })
  ).toThrow(/hash|stale/);
});
it('keeps legacy Default independent of any channel enrollment', () => {
  expect(
    resolveNpcMaterialChannelTreatment({
      url: '/legacy.glb',
      catalog: null,
      adjustments: [],
    })
  ).toBeUndefined();
});
