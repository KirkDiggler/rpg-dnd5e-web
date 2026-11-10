// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWorldMaterialCatalogModule } from './generate-world-material-catalog.mjs';
import { stageWorldMaterialPreview } from './stage-world-material-preview.mjs';
import { readWorldMaterialCatalog } from './world-material-catalog.mjs';
import { worldAtlasFixture } from './worldAtlasCatalog.testFixtures';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'world-atlas-reader-'));
  roots.push(root);
  return worldAtlasFixture(root);
}
type Fixture = ReturnType<typeof fixture>;
function readV3(f: Fixture) {
  const result = readWorldMaterialCatalog(f);
  if (result.schemaVersion !== 3) throw Error('Expected schema3 projection');
  return result;
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

describe('shared authored-UV material catalog', () => {
  it('retains masonry and exposes the atlas collection and exact bound scope from one catalog', () => {
    const f = fixture();
    const result = readV3(f);
    expect(result.schemaVersion).toBe(3);
    expect(result.materials.map((m) => m.ref)).toEqual([f.masonry.ref]);
    expect(result.materials[0].normalScale).toEqual([1, 1]);
    expect(result.atlasMaterials).toEqual([
      {
        ref: f.atlas.ref,
        displayName: '01_A',
        family: 'main-atlas',
        mapping: 'authored-uv',
        normal: null,
        emissive: null,
        baseColor: {
          url: `/models/synty/${f.atlas.baseColor.file}?v=${f.atlas.baseColor.sha256}`,
          sha256: f.atlas.baseColor.sha256,
          sizeBytes: f.atlas.baseColor.sizeBytes,
          width: 2,
          height: 2,
        },
      },
    ]);
    expect(result.collections).toEqual([f.collection]);
    expect(result.bindings).toEqual([f.binding]);
    expect(JSON.stringify(result)).not.toContain(f.root);
  });

  it('does not discard a valid atlas choice merely because no collection recommends it', () => {
    const f = fixture();
    const uncurated = { ...f.atlas, ref: 'dnd5e:material:test:other_atlas' };
    f.document.materials.push(uncurated);
    f.save();
    expect(readV3(f).atlasMaterials.map((m) => m.ref)).toContain(uncurated.ref);
    expect(readV3(f).collections).toEqual([f.collection]);
  });

  it('verifies atlas image bytes through the same resource boundary as masonry', () => {
    const f = fixture();
    const image = join(f.modelRoot, f.atlas.baseColor.file);
    const bytes = Buffer.from(readFileSync(image));
    bytes[bytes.length - 5] ^= 0xff;
    writeFileSync(image, bytes);
    expect(() => readWorldMaterialCatalog(f)).toThrow(/hash|digest|PNG/i);
  });

  it('generates all typed views under the same source digest without losing atlas records', async () => {
    const f = fixture(),
      catalog = readV3(f);
    const source = renderWorldMaterialCatalogModule({
      commit: 'a'.repeat(40),
      catalog,
    });
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = await import(
      'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
    );
    expect(module.GENERATED_WORLD_MATERIALS).toEqual(catalog.materials);
    expect(module.GENERATED_WORLD_ATLAS_MATERIALS).toEqual(
      catalog.atlasMaterials
    );
    expect(module.GENERATED_WORLD_MATERIAL_COLLECTIONS).toEqual(
      catalog.collections
    );
    expect(module.GENERATED_WORLD_ATLAS_BINDINGS).toEqual(catalog.bindings);
    expect(module.GENERATED_WORLD_MATERIAL_PROVIDER.catalogSha256).toBe(
      catalog.catalogSha256
    );
  });

  it('stages complete atlas metadata and refuses stale geometry without replacing the prior preview', () => {
    const f = fixture();
    const outputRoot = join(f.root, 'world-material-preview'),
      worldCatalogPath = join(f.root, 'world.json');
    const bytes = Buffer.from('hash-bound model fixture');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const file = 'world-assets/env/test/house_wall_05.glb';
    mkdirSync(dirname(join(f.modelRoot, file)), { recursive: true });
    writeFileSync(join(f.modelRoot, file), bytes);
    f.binding.glbSha256 = sha;
    f.save();
    const asset = {
      ref: f.binding.assetRef,
      glbSha256: sha,
      file,
      sizeBytes: bytes.length,
    };
    writeFileSync(
      worldCatalogPath,
      JSON.stringify({ schemaVersion: 1, assets: [asset] })
    );
    const assets = { [asset.ref]: { ...asset, url: `/models/synty/${file}` } };
    const input = {
      ...f,
      worldCatalogPath,
      runtimeRoot: f.modelRoot,
      outputRoot,
      assets,
    };
    stageWorldMaterialPreview(input);
    const saved = readFileSync(join(outputRoot, 'catalog.json'), 'utf8');
    const catalog = JSON.parse(saved);
    expect(catalog.atlas.bindings).toEqual([f.binding]);
    expect(catalog.atlas.collections).toEqual([f.collection]);
    expect(catalog.atlas.materials[0].baseColor.url).toBe(
      `/world-material-preview/images/${f.atlas.baseColor.sha256}.png?v=${f.atlas.baseColor.sha256}`
    );
    expect(
      existsSync(join(outputRoot, 'images', `${f.atlas.baseColor.sha256}.png`))
    ).toBe(true);
    f.binding.glbSha256 = 'd'.repeat(64);
    f.save();
    expect(() => stageWorldMaterialPreview(input)).toThrow(/geometry|binding/i);
    expect(readFileSync(join(outputRoot, 'catalog.json'), 'utf8')).toBe(saved);
  });

  const malformed: [string, (f: Fixture) => void][] = [
    [
      'incomplete v3 envelope',
      (f) => {
        Reflect.deleteProperty(f.document, 'bindings');
      },
    ],
    [
      'v3 data labeled v1',
      (f) => {
        f.document.schemaVersion = 1;
      },
    ],
    [
      'unknown version',
      (f) => {
        f.document.schemaVersion = 4;
      },
    ],
    [
      'unknown atlas field',
      (f) => {
        Object.assign(f.atlas, { localSource: '/tmp/pixels' });
      },
    ],
    [
      'wrong mapping',
      (f) => {
        f.atlas.mapping = 'wall-distance';
      },
    ],
    [
      'manufactured normal',
      (f) => {
        Object.assign(f.atlas, { normal: f.masonry.normal });
      },
    ],
    [
      'implicit absent emissive',
      (f) => {
        Reflect.deleteProperty(f.atlas, 'emissive');
      },
    ],
    [
      'duplicate material',
      (f) => {
        f.document.materials.push({ ...f.atlas });
      },
    ],
    [
      'empty collections',
      (f) => {
        f.document.collections = [];
      },
    ],
    [
      'empty bindings',
      (f) => {
        f.document.bindings = [];
      },
    ],
    [
      'empty recommendation',
      (f) => {
        f.binding.surfaces[0].suggestedCollections = [];
      },
    ],
    [
      'duplicate collection',
      (f) => {
        f.document.collections.push({ ...f.collection });
      },
    ],
    [
      'dangling material',
      (f) => {
        f.collection.materials = ['dnd5e:material:test:absent'];
      },
    ],
    [
      'masonry in atlas collection',
      (f) => {
        f.collection.materials = [f.masonry.ref];
      },
    ],
    [
      'duplicate collection member',
      (f) => {
        f.collection.materials.push(f.atlas.ref);
      },
    ],
    [
      'duplicate asset binding',
      (f) => {
        f.document.bindings.push(structuredClone(f.binding));
      },
    ],
    [
      'invalid asset identity',
      (f) => {
        f.binding.assetRef = 'https://example.test/model';
      },
    ],
    [
      'malformed model hash',
      (f) => {
        f.binding.glbSha256 = 'old';
      },
    ],
    [
      'empty target list',
      (f) => {
        f.binding.surfaces = [];
      },
    ],
    [
      'duplicate surface id',
      (f) => {
        f.binding.surfaces.push({ ...f.binding.surfaces[0], node: 'Other' });
      },
    ],
    [
      'overlapping material targets',
      (f) => {
        f.binding.surfaces.push({ ...f.binding.surfaces[0], id: 'other' });
      },
    ],
    [
      'empty node',
      (f) => {
        f.binding.surfaces[0].node = '';
      },
    ],
    [
      'ambiguous padded material',
      (f) => {
        f.binding.surfaces[0].material = ' Atlas ';
      },
    ],
    [
      'invalid UV channel',
      (f) => {
        f.binding.surfaces[0].texCoord = 4;
      },
    ],
    [
      'noninteger UV channel',
      (f) => {
        f.binding.surfaces[0].texCoord = 0.5;
      },
    ],
    [
      'bad default-image hash',
      (f) => {
        f.binding.surfaces[0].defaultBaseColorSha256 = 'bad';
      },
    ],
    [
      'unknown sampler field',
      (f) => {
        Object.assign(f.binding.surfaces[0].sampler, { guessed: true });
      },
    ],
    [
      'bad wrapping',
      (f) => {
        f.binding.surfaces[0].sampler.wrapS = 0;
      },
    ],
    [
      'bad magnification filter',
      (f) => {
        f.binding.surfaces[0].sampler.magFilter = 9984;
      },
    ],
    [
      'dangling recommendation',
      (f) => {
        f.binding.surfaces[0].suggestedCollections = [
          'dnd5e:material-collection:test:missing',
        ];
      },
    ],
    [
      'duplicate recommendation',
      (f) => {
        f.binding.surfaces[0].suggestedCollections.push(f.collection.ref);
      },
    ],
  ];
  it.each(malformed)(
    'refuses %s without dropping the offending row',
    (_, mutate) => {
      const f = fixture();
      mutate(f);
      f.save();
      expect(() => readWorldMaterialCatalog(f)).toThrow(
        /World material catalog:/
      );
    }
  );
});
