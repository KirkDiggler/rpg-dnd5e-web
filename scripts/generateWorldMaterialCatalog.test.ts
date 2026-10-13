// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkPinnedWorldMaterialCatalog,
  generateWorldMaterialCatalog,
} from './generate-world-material-catalog.mjs';
const roots: string[] = [];
const put = (p: string, b: string | Buffer) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, b);
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function commit(root: string) {
  git(root, 'add', '--all');
  git(root, 'commit', '-qm', 'fixture');
  return git(root, 'rev-parse', 'HEAD');
}
function fixture(materials = true) {
  const base = mkdtempSync(join(tmpdir(), 'material-generator-'));
  roots.push(base);
  const providerRoot = join(base, 'provider'),
    modelRoot = join(providerRoot, 'harness/models/synty'),
    outputPath = join(base, 'out/catalog.ts'),
    runtimeRoot = join(base, 'runtime');
  put(join(modelRoot, 'other-owner.txt'), 'unchanged');
  const payload = PNG.sync.write({
      width: 2,
      height: 2,
      data: Buffer.alloc(16, 128),
    }),
    hash = sha(payload);
  const image = {
    file: `world-materials/images/${hash}.png`,
    sha256: hash,
    sizeBytes: payload.length,
    width: 2,
    height: 2,
  };
  const document = {
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
  };
  const catalogPath = join(
    providerRoot,
    'harness/catalogs/synty-world-materials.json'
  );
  if (materials) {
    put(join(modelRoot, image.file), payload);
    put(catalogPath, JSON.stringify(document));
  }
  cpSync(modelRoot, runtimeRoot, { recursive: true });
  git(providerRoot, 'init', '-q');
  git(providerRoot, 'config', 'user.name', 'Fixture');
  git(providerRoot, 'config', 'user.email', 'fixture@example.invalid');
  const pin = commit(providerRoot);
  return {
    base,
    providerRoot,
    modelRoot,
    outputPath,
    runtimeRoot,
    catalogPath,
    document,
    image,
    pin,
  };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
describe('Git-bound production world material catalog', () => {
  it('generates deterministic public-safe metadata and verifies it without writing', () => {
    const f = fixture(),
      receipt = generateWorldMaterialCatalog(f),
      before = readFileSync(f.outputPath, 'utf8');
    expect(receipt.providerCommit).toBe(f.pin);
    expect(before).toContain(f.pin);
    expect(before).toContain(
      `/models/synty/${f.image.file}?v=${f.image.sha256}`
    );
    expect(before).not.toContain(f.providerRoot);
    expect(before).not.toContain('candidate');
    expect(generateWorldMaterialCatalog({ ...f, check: true })).toEqual(
      receipt
    );
    expect(readFileSync(f.outputPath, 'utf8')).toBe(before);
    put(f.outputPath, 'stale');
    expect(() => generateWorldMaterialCatalog({ ...f, check: true })).toThrow(
      /stale/
    );
    expect(readFileSync(f.outputPath, 'utf8')).toBe('stale');
  });
  it('pins truthful catalog absence but refuses orphan resources', () => {
    const f = fixture(false);
    expect(generateWorldMaterialCatalog(f).catalogSha256).toBeNull();
    expect(readFileSync(f.outputPath, 'utf8')).toContain('catalogSha256: null');
    checkPinnedWorldMaterialCatalog({ ...f, commit: f.pin });
    put(join(f.modelRoot, 'world-materials/orphan.png'), 'orphan');
    commit(f.providerRoot);
    expect(() => generateWorldMaterialCatalog(f)).toThrow(/unowned/);
  });
  it('checks the actual historical Git catalog instead of HEAD without rewriting a pin', () => {
    const f = fixture();
    generateWorldMaterialCatalog(f);
    f.document.materials[0].repeatMeters = [4.4, 4.4];
    put(f.catalogPath, JSON.stringify(f.document));
    const later = commit(f.providerRoot);
    expect(later).not.toBe(f.pin);
    expect(
      checkPinnedWorldMaterialCatalog({ ...f, commit: f.pin }).providerCommit
    ).toBe(f.pin);
    expect(() => generateWorldMaterialCatalog({ ...f, check: true })).toThrow(
      /stale/
    );
    expect(() =>
      checkPinnedWorldMaterialCatalog({ ...f, commit: later })
    ).toThrow(/stale/);
    expect(readFileSync(f.outputPath, 'utf8')).toContain(f.pin);
  });
  it.each([
    'dirty',
    'source-drift',
    'runtime-drift',
    'catalog-symlink',
    'root-symlink',
  ])('refuses %s before overwriting output', (kind) => {
    const f = fixture();
    put(f.outputPath, 'previous');
    if (kind === 'dirty') put(join(f.providerRoot, 'untracked'), 'dirty');
    if (kind === 'source-drift') {
      put(join(f.modelRoot, f.image.file), 'bad');
      commit(f.providerRoot);
    }
    if (kind === 'runtime-drift') put(join(f.runtimeRoot, f.image.file), 'bad');
    if (kind === 'catalog-symlink') {
      rmSync(f.catalogPath);
      symlinkSync(join(f.base, 'outside'), f.catalogPath);
      put(join(f.base, 'outside'), JSON.stringify(f.document));
      commit(f.providerRoot);
    }
    if (kind === 'root-symlink') {
      symlinkSync(f.providerRoot, join(f.base, 'alias'));
      f.providerRoot = join(f.base, 'alias');
    }
    expect(() => generateWorldMaterialCatalog(f)).toThrow();
    expect(readFileSync(f.outputPath, 'utf8')).toBe('previous');
  });
  it('rejects synchronized corruption on the pinned-check path', () => {
    const f = fixture();
    generateWorldMaterialCatalog(f);
    put(join(f.runtimeRoot, f.image.file), 'bad');
    expect(() =>
      checkPinnedWorldMaterialCatalog({ ...f, commit: f.pin })
    ).toThrow(/hash\/size/);
  });
});
