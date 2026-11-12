import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

/** Real image files and the agreed mixed catalog, not a mocked reader. */
export function worldAtlasFixture(root: string) {
  const modelRoot = join(root, 'models');
  const catalogPath = join(root, 'catalog.json');
  const image = (value: number) => {
    const bytes = PNG.sync.write({
      width: 2,
      height: 2,
      data: Buffer.alloc(16, value),
    });
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const file = `world-materials/images/${sha256}.png`;
    mkdirSync(dirname(join(modelRoot, file)), { recursive: true });
    writeFileSync(join(modelRoot, file), bytes);
    return { file, sha256, sizeBytes: bytes.length, width: 2, height: 2 };
  };
  const masonry = {
    ref: 'dnd5e:material:test:brick',
    displayName: 'Brick',
    family: 'masonry',
    baseColor: image(255),
    normal: image(128),
    repeatMeters: [3.3, 3.3],
    normalScale: [1, 1],
    roughness: 0.5,
    metalness: 0,
  };
  const atlas = {
    ref: 'dnd5e:material:test:atlas_01_a',
    displayName: '01_A',
    family: 'main-atlas',
    mapping: 'authored-uv',
    baseColor: image(80),
    normal: null,
    emissive: null,
  };
  const collection = {
    ref: 'dnd5e:material-collection:test:main_atlas',
    displayName: 'Main atlas',
    materials: [atlas.ref],
  };
  const binding = {
    assetRef: 'dnd5e:env:test:house_wall_05',
    glbSha256: 'a'.repeat(64),
    surfaces: [
      {
        id: 'atlas',
        node: 'HouseWall',
        material: 'SyntyAtlas',
        texCoord: 0,
        defaultBaseColorSha256: atlas.baseColor.sha256,
        sampler: {
          wrapS: 10497,
          wrapT: 10497,
          minFilter: 9984,
          magFilter: 9728,
        },
        compatibleFamilies: ['main-atlas'],
        suggestedCollections: [collection.ref],
      },
    ],
  };
  const document = {
    schemaVersion: 3,
    materials: [masonry, atlas],
    collections: [collection],
    bindings: [binding],
  };
  const save = () => writeFileSync(catalogPath, JSON.stringify(document));
  save();
  return {
    root,
    modelRoot,
    catalogPath,
    document,
    masonry,
    atlas,
    collection,
    binding,
    save,
  };
}
