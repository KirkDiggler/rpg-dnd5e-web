import { describe, expect, it } from 'vitest';
import { parseWorldAtlasPreview } from './worldAtlasCatalog';
import {
  createPinnedWorldMaterialCatalog,
  parseWorldMaterialPreview,
} from './worldMaterialCatalog';

const ref = 'dnd5e:env:test:wall',
  sha = 'a'.repeat(64),
  color = 'b'.repeat(64);
function fixture() {
  return {
    materials: [
      {
        ref: 'dnd5e:material:test:atlas_01_a',
        displayName: '01_A',
        family: 'main-atlas',
        mapping: 'authored-uv',
        normal: null,
        emissive: null,
        baseColor: {
          url: `/world-material-preview/images/${color}.png?v=${color}`,
          sha256: color,
          sizeBytes: 40,
          width: 2,
          height: 2,
        },
      },
    ],
    collections: [
      {
        ref: 'dnd5e:material-collection:test:main_atlas',
        displayName: 'Main atlas',
        materials: ['dnd5e:material:test:atlas_01_a'],
      },
    ],
    bindings: [
      {
        assetRef: ref,
        glbSha256: sha,
        surfaces: [
          {
            id: 'atlas',
            node: 'Wall',
            material: 'Atlas',
            texCoord: 0,
            defaultBaseColorSha256: color,
            sampler: {
              wrapS: 10497,
              wrapT: 10497,
              magFilter: 9728,
              minFilter: 9984,
            },
            suggestedCollections: ['dnd5e:material-collection:test:main_atlas'],
          },
        ],
      },
    ],
  };
}
describe('private atlas preview boundary', () => {
  it('retains the complete authored-UV view bound to current geometry', () => {
    const raw = fixture();
    expect(parseWorldAtlasPreview(raw, { [ref]: { glbSha256: sha } })).toEqual(
      raw
    );
  });
  it('retains an atlas view beside masonry in the pinned catalog', () => {
    const atlas = parseWorldAtlasPreview(fixture(), {
      [ref]: { glbSha256: sha },
    });
    const catalog = createPinnedWorldMaterialCatalog({
      provider: { commit: 'a'.repeat(40), catalogSha256: sha },
      materials: [],
      assets: {},
      atlas,
    });
    expect(catalog?.atlas).toEqual(atlas);
    expect(catalog?.materials).toEqual([]);
  });
  it('does not let the enclosing preview silently ignore malformed atlas data', () => {
    const atlas = fixture();
    atlas.materials[0].baseColor.url = 'https://example.test/image.png';
    expect(() =>
      parseWorldMaterialPreview({
        kind: 'candidate',
        catalogSha256: sha,
        materials: [],
        surfaces: [],
        atlas,
      })
    ).toThrow();
  });
  it.each([
    'url',
    'stale',
    'normal',
    'mapping',
    'scope',
    'collection',
    'extra',
    'dimensions',
  ])('refuses invalid %s without treating atlas rows as masonry', (kind) => {
    const raw = fixture();
    if (kind === 'url')
      raw.materials[0].baseColor.url = 'https://example.test/image.png';
    if (kind === 'stale') raw.bindings[0].glbSha256 = 'c'.repeat(64);
    if (kind === 'normal')
      Object.assign(raw.materials[0], { normal: { url: 'fake-normal' } });
    if (kind === 'mapping') raw.materials[0].mapping = 'planar';
    if (kind === 'scope')
      raw.bindings[0].surfaces.push({
        ...raw.bindings[0].surfaces[0],
        id: 'other',
      });
    if (kind === 'collection')
      raw.bindings[0].surfaces[0].suggestedCollections = ['missing'];
    if (kind === 'extra') Object.assign(raw, { localPath: '/tmp/private' });
    if (kind === 'dimensions') raw.materials[0].baseColor.width = NaN;
    expect(() =>
      parseWorldAtlasPreview(raw, { [ref]: { glbSha256: sha } })
    ).toThrow();
  });
});
