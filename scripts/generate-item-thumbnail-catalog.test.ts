import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const hash = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');
function fixture(version: 1 | 2 = 1) {
  const root = mkdtempSync(join(tmpdir(), 'item-thumbnails-'));
  roots.push(root);
  const provider = join(root, 'provider');
  mkdirSync(provider);
  const put = (file: string, bytes: string | Buffer) => {
    const path = join(provider, file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
  };
  const ref = 'dnd5e:item:spear';
  const file = `thumbnails/items/${hash(ref)}.png`;
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  const dimension = version === 2 ? 512 : 128;
  png.writeUInt32BE(dimension, 16);
  png.writeUInt32BE(dimension, 20);
  const model = Buffer.from('fixture-glb');
  const manifest = JSON.stringify({
    items: { [ref]: { path: 'weapons/spear.glb', sha256: hash(model) } },
  });
  const catalog = {
    schemaVersion: version,
    generatedBy: `item-thumbnails@${version}.0.0`,
    sourceManifestSha256: hash(manifest),
    renderer:
      version === 2
        ? {
            id: 'item-thumbnail-v2',
            sourceSha256: 'a'.repeat(64),
            threeVersion: '0.181.2',
          }
        : {},
    items: {
      [ref]: {
        modelFile: 'weapons/spear.glb',
        modelSha256: hash(model),
        thumbnail: {
          file,
          sha256: hash(png),
          sizeBytes: png.length,
          width: dimension,
          height: dimension,
        },
      },
    },
  };
  put('harness/models/synty/weapons/manifest.json', manifest);
  put('harness/models/synty/weapons/spear.glb', model);
  put(`harness/models/synty/${file}`, png);
  const save = () =>
    put('harness/catalogs/synty-item-thumbnails.json', JSON.stringify(catalog));
  save();
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', provider, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  git('init');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@example.test');
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const pin = commit();
  const output = join(root, 'catalog.ts');
  const run = (...args: string[]) =>
    execFileSync(
      'node',
      [
        resolve('scripts/generate-item-thumbnail-catalog.mjs'),
        '--provider-root',
        provider,
        '--output',
        output,
        ...args,
      ],
      { stdio: 'pipe' }
    );
  return { root, provider, put, catalog, save, commit, pin, file, output, run };
}

describe('item thumbnail catalog custody', () => {
  it('emits exact refs and versioned image URLs with an exact provider pin', () => {
    const f = fixture();
    f.run();
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain(`commit: '${f.pin}'`);
    expect(output).toContain('dnd5e:item:spear');
    expect(output).toContain(`/models/synty/${f.file}?v=`);
    expect(output).not.toContain(f.provider);
  });
  it('adopts the explicit v2 recipe and emits 512px image metadata', () => {
    const f = fixture(2);
    f.run();
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain(`commit: '${f.pin}'`);
    expect(output).toContain('width: 512');
    expect(output).toContain('height: 512');
    expect(output).toContain(
      `/models/synty/${f.file}?v=${f.catalog.items['dnd5e:item:spear'].thumbnail.sha256}`
    );
  });
  it.each([
    'unknown-version',
    'mixed-generator',
    'wrong-size',
    'wrong-renderer',
    'bad-renderer-hash',
  ])('refuses incompatible v2 metadata: %s', (failure) => {
    const f = fixture(2);
    const changed = JSON.parse(JSON.stringify(f.catalog));
    if (failure === 'unknown-version') changed.schemaVersion = 3;
    if (failure === 'mixed-generator')
      changed.generatedBy = 'item-thumbnails@1.0.0';
    if (failure === 'wrong-size')
      changed.items['dnd5e:item:spear'].thumbnail.width = 128;
    if (failure === 'wrong-renderer')
      changed.renderer.id = 'world-asset-thumbnail-v1';
    if (failure === 'bad-renderer-hash')
      changed.renderer.sourceSha256 = 'unbound';
    f.put(
      'harness/catalogs/synty-item-thumbnails.json',
      JSON.stringify(changed)
    );
    f.commit();
    expect(() => f.run()).toThrow();
  });
  it('uses the versioned provider image-byte limits without relaxing legacy pins', () => {
    for (const version of [1, 2] as const) {
      const f = fixture(version);
      const bytes = Buffer.alloc(1024 * 1024 + 24);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
      bytes.writeUInt32BE(version === 2 ? 512 : 128, 16);
      bytes.writeUInt32BE(version === 2 ? 512 : 128, 20);
      f.put(`harness/models/synty/${f.file}`, bytes);
      f.catalog.items['dnd5e:item:spear'].thumbnail.sha256 = hash(bytes);
      f.catalog.items['dnd5e:item:spear'].thumbnail.sizeBytes = bytes.length;
      f.save();
      f.commit();
      if (version === 1) expect(() => f.run()).toThrow();
      else expect(() => f.run()).not.toThrow();
    }
  });
  it('refuses a dirty provider instead of silently changing metadata', () => {
    const f = fixture();
    f.put('untracked', 'dirty');
    expect(() => f.run()).toThrow();
  });
  it('refuses PNG digest drift', () => {
    const f = fixture();
    f.put(`harness/models/synty/${f.file}`, 'broken');
    f.commit();
    expect(() => f.run()).toThrow();
  });
  it('refuses path traversal even in a clean committed catalog', () => {
    const f = fixture();
    f.catalog.items['dnd5e:item:spear'].thumbnail.file = '../escape.png';
    f.save();
    f.commit();
    expect(() => f.run()).toThrow();
  });
  it('refuses source-model drift', () => {
    const f = fixture();
    f.put('harness/models/synty/weapons/spear.glb', 'changed');
    f.commit();
    expect(() => f.run()).toThrow();
  });
  it('ordinary pinned sync preserves v1 item thumbnails when provider HEAD publishes v2', () => {
    const f = fixture();
    f.put('harness/models/custom-dice/original-set/d20.glb', 'dice');
    f.put(
      'harness/models/custom-dice/dice-tray-presets.json',
      JSON.stringify({
        schemaVersion: 1,
        presets: [
          {
            presetId: 'dice.original.carved.d20',
            model: { path: 'original-set/d20.glb' },
          },
        ],
      })
    );
    f.commit();
    f.run();
    const web = join(f.root, 'web');
    mkdirSync(join(web, 'src/generated'), { recursive: true });
    writeFileSync(
      join(web, 'src/generated/itemThumbnailCatalog.ts'),
      readFileSync(f.output)
    );
    const original = readFileSync(
      join(f.provider, 'harness/models/synty', f.file)
    );
    const newer = Buffer.from(original);
    newer.writeUInt32BE(512, 16);
    newer.writeUInt32BE(512, 20);
    f.put(`harness/models/synty/${f.file}`, newer);
    f.catalog.schemaVersion = 2;
    f.catalog.generatedBy = 'item-thumbnails@2.0.0';
    f.catalog.renderer = {
      id: 'item-thumbnail-v2',
      sourceSha256: 'a'.repeat(64),
      threeVersion: '0.181.2',
    };
    f.catalog.items['dnd5e:item:spear'].thumbnail = {
      file: f.file,
      sha256: hash(newer),
      sizeBytes: newer.length,
      width: 512,
      height: 512,
    };
    f.save();
    f.commit();
    f.run(); // The current provider is valid v2, while the consumer still pins v1.
    expect(readFileSync(f.output, 'utf8')).toContain('width: 512');
    execFileSync(
      'bash',
      [resolve('scripts/sync-game-assets.sh'), '--pinned-runtime'],
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          RPG_WEB_ROOT: web,
          RPG_GAME_ASSETS_PATH: f.provider,
          ASSETS_SYNC_SKIP_UPDATE: '1',
        },
      }
    );
    expect(readFileSync(join(web, 'public/models/synty', f.file))).toEqual(
      original
    );
  });
  it('checks the pinned catalog and refuses missing runtime image bytes', () => {
    const f = fixture();
    f.run();
    f.run(
      '--check-pin',
      f.pin,
      '--runtime-root',
      join(f.provider, 'harness/models/synty')
    );
    const runtime = join(f.root, 'empty-runtime');
    mkdirSync(runtime);
    expect(() =>
      f.run('--check-pin', f.pin, '--runtime-root', runtime)
    ).toThrow();
  });
});
