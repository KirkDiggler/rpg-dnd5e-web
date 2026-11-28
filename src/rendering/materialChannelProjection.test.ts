import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import { expect, it } from 'vitest';
import { projectMasonryMaterialChannels } from './materialChannelProjection';
import type { MaterialChannelBinding } from './materialChannelTypes';
import type { WorldMaterialCatalog } from './worldMaterialCatalog';

type Asset = Pick<
  GeneratedWorldAsset,
  'ref' | 'glbSha256' | 'surfaces' | 'roles'
>;
function fixture() {
  const source: Asset = {
    ref: 'dnd5e:env:test:wall',
    glbSha256: 'a'.repeat(64),
    surfaces: [
      {
        id: 'front',
        node: 'Body',
        material: 'Stone',
        side: 'positive-z',
        family: 'masonry',
      },
    ],
  };
  const destination: Asset = {
    ref: 'dnd5e:env:test:frame',
    glbSha256: 'b'.repeat(64),
    surfaces: ['Frame', 'Cap'].map((node) => ({
      id: node,
      node,
      material: 'Stone',
      side: 'positive-z',
      family: 'masonry',
    })),
    roles: [
      { node: 'Frame', role: 'frame' },
      { node: 'Cap', role: 'cap' },
      { node: 'Leaf', role: 'leaf', door: 'entry' },
    ],
  };
  const target = {
    id: 'masonry',
    label: 'Masonry',
    normal: {
      kind: 'adjustable' as const,
      minMultiplier: 0.5,
      maxMultiplier: 2,
    },
    emissive: { kind: 'fixed' as const },
  };
  const bindings: MaterialChannelBinding[] = [
    {
      assetRef: source.ref,
      glbSha256: source.glbSha256,
      representation: 'model',
      targets: [
        { ...target, selectors: [{ node: 'Body', material: 'Stone' }] },
      ],
    },
    {
      assetRef: destination.ref,
      glbSha256: destination.glbSha256,
      representation: 'model',
      targets: [
        {
          ...target,
          selectors: ['Frame', 'Cap'].map((node) => ({
            node,
            material: 'Stone',
          })),
        },
      ],
    },
  ];
  const image = {
    url: '/stone.png',
    sha256: 'c'.repeat(64),
    sizeBytes: 1,
    width: 1,
    height: 1,
  };
  const catalog: WorldMaterialCatalog = {
    kind: 'pinned',
    catalogSha256: 'c'.repeat(64),
    materials: [
      {
        ref: 'dnd5e:material:test:stone',
        displayName: 'Stone',
        family: 'masonry',
        baseColor: image,
        normal: image,
        normalScale: [1, 1],
        repeatMeters: [1, 1],
        roughness: 0.5,
        metalness: 0,
      },
    ],
    surfaces: [],
    channelBindings: bindings,
  };
  return {
    source,
    destination,
    catalog,
    values: [
      {
        targetId: 'masonry',
        normal: { mode: 'scale' as const, multiplier: 1 },
      },
    ],
  };
}
it('projects exact logical intent into declared compatible fixed masonry scopes', () => {
  const f = fixture();
  const result = projectMasonryMaterialChannels(f);
  expect(result).toEqual(f.values);
  expect(result).not.toBe(f.values);
  result[0].normal = { mode: 'off' };
  expect(f.values[0].normal.multiplier).toBe(1);
});
it('leaves unenrolled, differently named, trim and moving-leaf targets untouched', () => {
  const f = fixture(),
    binding = f.catalog.channelBindings![1],
    target = binding.targets[0];
  for (const targets of [
    [],
    [{ ...target, id: 'other' }],
    [{ ...target, selectors: [{ node: 'Trim', material: 'Stone' }] }],
    [{ ...target, selectors: [{ node: 'Leaf', material: 'Stone' }] }],
  ]) {
    const catalog = {
      ...f.catalog,
      channelBindings: [f.catalog.channelBindings![0], { ...binding, targets }],
    };
    expect(projectMasonryMaterialChannels({ ...f, catalog })).toEqual([]);
  }
  expect(
    projectMasonryMaterialChannels({
      ...f,
      catalog: {
        ...f.catalog,
        channelBindings: [f.catalog.channelBindings![0]],
      },
    })
  ).toEqual([]);
});
it('refuses stale identities and a declared compatible recipient with an incompatible range', () => {
  const f = fixture();
  expect(() =>
    projectMasonryMaterialChannels({
      ...f,
      destination: { ...f.destination, glbSha256: '0'.repeat(64) },
    })
  ).toThrow(/hash|stale/);
  const [source, destination] = f.catalog.channelBindings!;
  const catalog = {
    ...f.catalog,
    channelBindings: [
      source,
      {
        ...destination,
        targets: [
          {
            ...destination.targets[0],
            normal: {
              kind: 'adjustable' as const,
              minMultiplier: 1,
              maxMultiplier: 1,
            },
          },
        ],
      },
    ],
  };
  expect(() =>
    projectMasonryMaterialChannels({
      ...f,
      catalog,
      values: [
        { targetId: 'masonry', normal: { mode: 'scale', multiplier: 0.5 } },
      ],
    })
  ).toThrow(/range/);
});
it('does not need metadata for an absent adjustment', () => {
  const f = fixture();
  expect(
    projectMasonryMaterialChannels({ ...f, values: [], catalog: null })
  ).toEqual([]);
});
