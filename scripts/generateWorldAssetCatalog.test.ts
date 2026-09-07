// @vitest-environment node
import { execFileSync } from 'node:child_process';
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
import { afterEach, describe, expect, it } from 'vitest';
import { generateWorldAssetCatalog } from './generate-world-asset-catalog.mjs';

const temporary: string[] = [];
const digest = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

interface Fixture {
  root: string;
  provider: string;
  runtime: string;
  output: string;
  catalogPath: string;
  assetPath: string;
  catalog: {
    schemaVersion: number;
    generatedBy: string;
    recipes: Array<{ batchId: string; sha256: string }>;
    assets: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

const put = (path: string, bytes: string | Buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
};

function commit(provider: string, message = 'fixture') {
  execFileSync('git', ['add', '--all'], { cwd: provider });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: provider });
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'world-asset-generator-'));
  temporary.push(root);
  const provider = join(root, 'provider');
  const runtime = join(root, 'web', 'public', 'models', 'synty');
  const output = join(root, 'web', 'src', 'generated', 'worldAssetCatalog.ts');
  const catalogPath = join(
    provider,
    'harness',
    'catalogs',
    'synty-world-assets.json'
  );
  const file = 'world-assets/props/dark-fortress/brazier_01.glb';
  const assetPath = join(provider, 'harness', 'models', 'synty', file);
  const assetBytes = Buffer.from('fixture GLB bytes');
  const recipeBytes = Buffer.from('{"fixture":"recipe"}\n');
  const recipePath = join(
    provider,
    'scripts',
    'configs',
    'world-asset-promotion',
    'dark-fortress-world-assets-v1.json'
  );
  put(assetPath, assetBytes);
  put(join(runtime, file), assetBytes);
  put(recipePath, recipeBytes);
  const catalog: Fixture['catalog'] = {
    schemaVersion: 1,
    generatedBy: 'build_world_asset_catalog@1.0.0',
    recipes: [
      {
        batchId: 'dark-fortress-world-assets-v1',
        sha256: digest(recipeBytes),
      },
    ],
    assets: [
      {
        ref: 'dnd5e:props:dark-fortress:brazier_01',
        displayName: 'Brazier 01',
        category: 'props',
        file,
        glbSha256: digest(assetBytes),
        sizeBytes: assetBytes.byteLength,
        boundsMeters: [1, 2, 1],
        tags: ['dark-fortress'],
        supportsDecoration: false,
      },
    ],
  };
  put(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  execFileSync('git', ['init', '--quiet'], { cwd: provider });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: provider });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
    cwd: provider,
  });
  commit(provider);
  return { root, provider, runtime, output, catalogPath, assetPath, catalog };
}

function rewriteCatalog(fixture: Fixture) {
  put(fixture.catalogPath, `${JSON.stringify(fixture.catalog, null, 2)}\n`);
  commit(fixture.provider, 'mutate fixture');
}

afterEach(() => {
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true }));
});

describe('world asset catalog generator', () => {
  it('pins deterministic exact refs, catalog/recipe hashes, and synchronized GLB bytes without provider identity', () => {
    const fixture = makeFixture();
    fixture.catalog.assets.unshift({ ...fixture.catalog.assets[0]! });
    fixture.catalog.assets[0]!.ref =
      'dnd5e:props:dark-fortress:alchemy_tools_01';
    fixture.catalog.assets[0]!.displayName = 'Alchemy Tools 01';
    fixture.catalog.assets[0]!.file =
      'world-assets/props/dark-fortress/alchemy_tools_01.glb';
    put(
      join(
        fixture.provider,
        'harness/models/synty/world-assets/props/dark-fortress/alchemy_tools_01.glb'
      ),
      'fixture GLB bytes'
    );
    put(
      join(
        fixture.runtime,
        'world-assets/props/dark-fortress/alchemy_tools_01.glb'
      ),
      'fixture GLB bytes'
    );
    rewriteCatalog(fixture);

    const receipt = generateWorldAssetCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      outputPath: fixture.output,
    });
    const first = readFileSync(fixture.output, 'utf8');
    generateWorldAssetCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      outputPath: fixture.output,
    });
    expect(readFileSync(fixture.output, 'utf8')).toBe(first);
    expect(receipt.assetCount).toBe(2);
    expect(first.indexOf('alchemy_tools_01')).toBeLessThan(
      first.indexOf('brazier_01')
    );
    expect(first).toContain(receipt.providerCommit);
    expect(first).toContain(receipt.catalogSha256);
    expect(first).toContain(fixture.catalog.recipes[0]!.sha256);
    expect(first).not.toContain(fixture.provider);
    expect(first).not.toMatch(/harness\/|sourcePath|packSlug|licensed/i);
  });

  it('rejects a dirty or uncommitted provider', () => {
    const fixture = makeFixture();
    put(join(fixture.provider, 'untracked'), 'dirty');
    expect(() =>
      generateWorldAssetCatalog({
        providerRoot: fixture.provider,
        outputPath: fixture.output,
      })
    ).toThrow(/exactly clean/);
  });

  it.each([
    [
      'extra catalog field',
      (f: Fixture) => (f.catalog.privateSource = '/tmp/source'),
    ],
    [
      'unknown category',
      (f: Fixture) => {
        f.catalog.assets[0]!.category = 'characters';
        f.catalog.assets[0]!.ref = 'dnd5e:characters:dark-fortress:brazier_01';
      },
    ],
    [
      'malformed bounds',
      (f: Fixture) => (f.catalog.assets[0]!.boundsMeters = [1, 0, 1]),
    ],
    [
      'traversal',
      (f: Fixture) =>
        (f.catalog.assets[0]!.file = 'world-assets/props/../secret.glb'),
    ],
    [
      'duplicate ref',
      (f: Fixture) => f.catalog.assets.push({ ...f.catalog.assets[0]! }),
    ],
    [
      'duplicate runtime URL',
      (f: Fixture) => {
        f.catalog.assets.push({
          ...f.catalog.assets[0]!,
          ref: 'dnd5e:props:dark-fortress:brazier_02',
        });
      },
    ],
    [
      'recipe digest disagreement',
      (f: Fixture) => (f.catalog.recipes[0]!.sha256 = '0'.repeat(64)),
    ],
  ] as Array<[string, (fixture: Fixture) => void]>)(
    'rejects %s',
    (_label, mutate) => {
      const fixture = makeFixture();
      mutate(fixture);
      rewriteCatalog(fixture);
      expect(() =>
        generateWorldAssetCatalog({
          providerRoot: fixture.provider,
          outputPath: fixture.output,
        })
      ).toThrow();
    }
  );

  it('rejects symlinked provider GLBs and size/hash disagreement in either provider or synchronized bytes', () => {
    const symlinked = makeFixture();
    const target = join(symlinked.provider, 'target.glb');
    put(target, 'fixture GLB bytes');
    unlinkSync(symlinked.assetPath);
    symlinkSync(target, symlinked.assetPath);
    commit(symlinked.provider, 'symlink asset');
    expect(() =>
      generateWorldAssetCatalog({
        providerRoot: symlinked.provider,
        outputPath: symlinked.output,
      })
    ).toThrow(/symlink/);

    const changed = makeFixture();
    put(
      join(changed.runtime, 'world-assets/props/dark-fortress/brazier_01.glb'),
      'wrong synchronized bytes'
    );
    expect(() =>
      generateWorldAssetCatalog({
        providerRoot: changed.provider,
        runtimeRoot: changed.runtime,
        outputPath: changed.output,
      })
    ).toThrow(/synchronized GLB size\/hash/);
  });

  it('--check detects stale generated bytes and never rewrites them', () => {
    const fixture = makeFixture();
    generateWorldAssetCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      outputPath: fixture.output,
    });
    put(fixture.output, 'stale bytes\n');
    expect(() =>
      generateWorldAssetCatalog({
        providerRoot: fixture.provider,
        runtimeRoot: fixture.runtime,
        outputPath: fixture.output,
        check: true,
      })
    ).toThrow(/stale/);
    expect(readFileSync(fixture.output, 'utf8')).toBe('stale bytes\n');
  });
});
