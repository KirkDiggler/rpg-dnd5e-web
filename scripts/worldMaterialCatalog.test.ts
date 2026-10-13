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
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { readWorldMaterialCatalog } from './world-material-catalog.mjs';

const roots: string[] = [];
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const put = (file: string, bytes: Buffer | string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'world-material-reader-'));
  roots.push(root);
  const modelRoot = join(root, 'models');
  const catalogPath = join(root, 'catalog.json');
  const image = (color: number) => {
    const bytes = PNG.sync.write({
      width: 2,
      height: 2,
      data: Buffer.alloc(16, color),
    });
    const sha256 = hash(bytes);
    const file = `world-materials/images/${sha256}.png`;
    put(join(modelRoot, file), bytes);
    return { file, sha256, sizeBytes: bytes.length, width: 2, height: 2 };
  };
  const row = {
    ref: 'dnd5e:material:test:large_gray',
    displayName: 'Large gray masonry',
    family: 'masonry',
    baseColor: image(255),
    normal: image(128),
    repeatMeters: [3.3, 3.3],
    normalScale: [1, 1],
    roughness: 0.5,
    metalness: 0,
  };
  const document = { schemaVersion: 1, materials: [row] };
  const save = () => put(catalogPath, JSON.stringify(document));
  save();
  return { root, modelRoot, catalogPath, document, row, save };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

describe('world material consumer reader', () => {
  it('projects paired maps and physical parameters without source paths or a fake release pin', () => {
    const f = fixture();
    const result = readWorldMaterialCatalog(f);
    expect(result.catalogSha256).toBe(hash(readFileSync(f.catalogPath)));
    expect(result.materials).toHaveLength(1);
    expect(result.materials[0]).toEqual({
      ...f.row,
      baseColor: {
        ...f.row.baseColor,
        file: undefined,
        url: `/models/synty/${f.row.baseColor.file}?v=${f.row.baseColor.sha256}`,
      },
      normal: {
        ...f.row.normal,
        file: undefined,
        url: `/models/synty/${f.row.normal.file}?v=${f.row.normal.sha256}`,
      },
    });
    expect(JSON.stringify(result)).not.toContain(f.root);
    expect(result).not.toHaveProperty('providerCommit');
  });

  it('allows shared immutable bytes across sampling roles, and optional packed ORM/AO', () => {
    const f = fixture();
    Object.assign(f.row, {
      metallicRoughness: f.row.normal,
      occlusion: f.row.normal,
    });
    f.document.materials.push({
      ...f.row,
      ref: 'dnd5e:material:test:small_gray',
    });
    f.save();
    const { materials } = readWorldMaterialCatalog(f);
    expect(materials).toHaveLength(2);
    expect(materials[0].metallicRoughness).toEqual(materials[0].occlusion);
    expect(materials[0].normal).toEqual(materials[1].normal);
  });

  it.each([
    ['repeatMeters', [0, 1]],
    ['repeatMeters', [1]],
    ['repeatMeters', [true, 1]],
    ['normalScale', [null, 1]],
    ['normalScale', [1, 1, 1]],
    ['roughness', -1],
    ['metalness', 1.1],
    ['roughness', false],
    ['ref', 'dnd5e:env:test:wall'],
    ['family', '../masonry'],
    ['displayName', ''],
    ['privateSource', '/tmp/source'],
    ['baseColor', null],
    ['normal', undefined],
  ])('refuses invalid material %s=%j', (key, value) => {
    const f = fixture();
    Object.assign(f.row, { [key]: value });
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow();
  });

  it.each([
    ['file', '../escape.png'],
    ['file', '/tmp/a.png'],
    ['file', 'https://x/image.png'],
    ['file', `world-materials/images/${'a'.repeat(64)}.png`],
    ['sha256', 'bad'],
    ['sizeBytes', 0],
    ['sizeBytes', 1.5],
    ['width', true],
    ['height', 0],
    ['width', 3],
    ['height', 100000000],
    ['source', '/tmp/a'],
  ])('refuses invalid resource %s=%j', (key, value) => {
    const f = fixture();
    Object.assign(f.row.normal, { [key]: value });
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow();
  });

  it.each(['keys', 'version', 'duplicate', 'rows', 'conflicting-shared-image'])(
    'refuses malformed catalog: %s',
    (kind) => {
      const f = fixture();
      if (kind === 'keys') Object.assign(f.document, { extra: true });
      if (kind === 'version') f.document.schemaVersion = 2;
      if (kind === 'rows') Object.assign(f.document, { materials: null });
      if (kind === 'duplicate') f.document.materials.push({ ...f.row });
      if (kind === 'conflicting-shared-image')
        f.row.normal = { ...f.row.baseColor, width: 3 };
      f.save();
      expect(() => readWorldMaterialCatalog(f)).toThrow();
    }
  );

  it.each([
    'missing',
    'drift',
    'symlink',
    'parent-symlink',
    'root-symlink',
    'undeclared',
  ])('refuses resource custody failure: %s', (kind) => {
    const f = fixture();
    const target = join(f.modelRoot, f.row.normal.file);
    if (kind === 'missing') unlinkSync(target);
    if (kind === 'drift') writeFileSync(target, 'not the image');
    if (kind === 'symlink') {
      unlinkSync(target);
      symlinkSync(join(f.modelRoot, f.row.baseColor.file), target);
    }
    if (kind === 'parent-symlink') {
      rmSync(join(f.modelRoot, 'world-materials'), { recursive: true });
      symlinkSync(f.root, join(f.modelRoot, 'world-materials'));
    }
    if (kind === 'root-symlink') {
      symlinkSync(f.modelRoot, join(f.root, 'alias'));
      f.modelRoot = join(f.root, 'alias');
    }
    if (kind === 'undeclared')
      put(join(f.modelRoot, 'world-materials/extra.png'), 'extra');
    expect(() => readWorldMaterialCatalog(f)).toThrow();
  });

  it('rejects hash-bound corrupt PNG data, not only its header', () => {
    const f = fixture();
    const bytes = Buffer.from(
      readFileSync(join(f.modelRoot, f.row.normal.file))
    );
    bytes[bytes.length - 5] ^= 0xff;
    unlinkSync(join(f.modelRoot, f.row.normal.file));
    const sha256 = hash(bytes);
    const file = `world-materials/images/${sha256}.png`;
    Object.assign(f.row.normal, { sha256, file });
    put(join(f.modelRoot, file), bytes);
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow(/PNG/);
  });

  it('does not inspect or remove other runtime owners', () => {
    const f = fixture();
    put(join(f.modelRoot, 'characters/keep.glb'), 'other owner');
    expect(readWorldMaterialCatalog(f).materials).toHaveLength(1);
    expect(readFileSync(join(f.modelRoot, 'characters/keep.glb'), 'utf8')).toBe(
      'other owner'
    );
  });
});
