// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { stageWorldMaterialPreview } from './stage-world-material-preview.mjs';
const roots: string[] = [];
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'material-preview-'));
  roots.push(root);
  const modelRoot = join(root, 'models'),
    runtimeRoot = join(root, 'runtime'),
    outputRoot = join(root, '.local/world-material-preview');
  mkdirSync(join(modelRoot, 'world-materials/images'), { recursive: true });
  mkdirSync(join(runtimeRoot, 'world-assets/env/test'), { recursive: true });
  const bytes = PNG.sync.write({
      width: 1,
      height: 1,
      data: Buffer.from([128, 128, 255, 255]),
    }),
    sha256 = hash(bytes);
  const image = {
    file: `world-materials/images/${sha256}.png`,
    sha256,
    sizeBytes: bytes.length,
    width: 1,
    height: 1,
  };
  writeFileSync(join(modelRoot, image.file), bytes);
  const catalogPath = join(root, 'materials.json');
  writeFileSync(
    catalogPath,
    JSON.stringify({
      schemaVersion: 1,
      materials: [
        {
          ref: 'dnd5e:material:test:gray',
          displayName: 'Gray',
          family: 'masonry',
          baseColor: image,
          normal: image,
          repeatMeters: [3.3, 3.3],
          normalScale: [1, 1],
          roughness: 0.5,
          metalness: 0,
        },
      ],
    })
  );
  const glb = Buffer.from('synthetic runtime file'),
    file = 'world-assets/env/test/wall.glb',
    glbSha256 = hash(glb),
    ref = 'dnd5e:env:test:wall';
  writeFileSync(join(runtimeRoot, file), glb);
  const worldCatalogPath = join(root, 'world.json');
  const world = {
    schemaVersion: 1,
    assets: [
      {
        ref,
        file,
        glbSha256,
        surfaces: [
          {
            id: 'front',
            node: 'WallBody_v1',
            material: 'Front',
            side: 'positive-z',
            family: 'masonry',
          },
        ],
      },
    ],
  };
  writeFileSync(worldCatalogPath, JSON.stringify(world));
  return {
    root,
    modelRoot,
    runtimeRoot,
    outputRoot,
    catalogPath,
    worldCatalogPath,
    world,
    image,
    file,
    assets: {
      [ref]: { url: `/models/synty/${file}`, glbSha256, sizeBytes: glb.length },
    },
  };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
describe('explicit private material preview staging', () => {
  it('projects candidate metadata and only copies verified images outside public and provider roots', () => {
    const f = fixture(),
      before = readFileSync(join(f.runtimeRoot, f.file));
    const receipt = stageWorldMaterialPreview(f);
    expect(receipt.images).toBe(1);
    const output = JSON.parse(
      readFileSync(join(f.outputRoot, 'catalog.json'), 'utf8')
    );
    expect(output.kind).toBe('candidate');
    expect(output.materials[0].normal.url).toBe(
      `/world-material-preview/images/${f.image.sha256}.png?v=${f.image.sha256}`
    );
    expect(JSON.stringify(output)).not.toContain(f.root);
    expect(readFileSync(join(f.runtimeRoot, f.file))).toEqual(before);
    expect(stageWorldMaterialPreview(f)).toEqual(receipt);
  });
  it.each(['glb', 'image', 'binding', 'symlink', 'pin'])(
    'refuses %s without replacing an existing stage',
    (kind) => {
      const f = fixture();
      stageWorldMaterialPreview(f);
      const before = readFileSync(join(f.outputRoot, 'catalog.json'));
      if (kind === 'glb') writeFileSync(join(f.runtimeRoot, f.file), 'drift');
      if (kind === 'image')
        writeFileSync(join(f.modelRoot, f.image.file), 'drift');
      if (kind === 'binding') {
        f.world.assets[0].surfaces[0].side = 'unknown';
        writeFileSync(f.worldCatalogPath, JSON.stringify(f.world));
      }
      if (kind === 'symlink') {
        unlinkSync(join(f.runtimeRoot, f.file));
        symlinkSync(
          join(f.modelRoot, f.image.file),
          join(f.runtimeRoot, f.file)
        );
      }
      if (kind === 'pin') {
        f.world.assets[0].glbSha256 = 'a'.repeat(64);
        writeFileSync(f.worldCatalogPath, JSON.stringify(f.world));
      }
      expect(() => stageWorldMaterialPreview(f)).toThrow();
      expect(readFileSync(join(f.outputRoot, 'catalog.json'))).toEqual(before);
    }
  );
  it('refuses to replace an unowned directory', () => {
    const f = fixture();
    mkdirSync(f.outputRoot, { recursive: true });
    writeFileSync(join(f.outputRoot, 'keep'), 'mine');
    expect(() => stageWorldMaterialPreview(f)).toThrow(/unowned/);
    expect(readFileSync(join(f.outputRoot, 'keep'), 'utf8')).toBe('mine');
  });
});
