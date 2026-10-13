// @vitest-environment node
import { execFileSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
const script = fileURLToPath(new URL('./sync-game-assets.sh', import.meta.url));
const roots: string[] = [];
const put = (path: string, bytes: string | Buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
};
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const commit = (root: string) => {
  git(root, 'add', '--all');
  git(root, 'commit', '-qm', 'fixture');
  return git(root, 'rev-parse', 'HEAD');
};
function fixture(present = true) {
  const base = mkdtempSync(join(tmpdir(), 'material-sync-'));
  roots.push(base);
  const provider = join(base, 'provider'),
    web = join(base, 'web'),
    source = join(provider, 'harness/models/synty'),
    runtime = join(web, 'public/models/synty'),
    output = join(web, 'src/generated/worldMaterialCatalog.ts');
  const resources = (color: number) => {
    const bytes = PNG.sync.write({
        width: 1,
        height: 1,
        data: Buffer.from([color, 128, 255, 255]),
      }),
      sha256 = digest(bytes),
      file = `world-materials/images/${sha256}.png`;
    rmSync(join(source, 'world-materials'), { recursive: true, force: true });
    put(join(source, file), bytes);
    const image = {
      file,
      sha256,
      sizeBytes: bytes.length,
      width: 1,
      height: 1,
    };
    put(
      join(provider, 'harness/catalogs/synty-world-materials.json'),
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
    return { file, bytes };
  };
  for (const owner of ['characters', 'npcs', 'world-assets'])
    put(join(source, owner, 'keep.glb'), owner);
  put(join(provider, 'harness/models/custom-dice/model.glb'), 'dice');
  put(
    join(provider, 'harness/models/custom-dice/dice-tray-presets.json'),
    JSON.stringify({
      schemaVersion: 1,
      presets: [
        { presetId: 'dice.original.carved.d20', model: { path: 'model.glb' } },
      ],
    })
  );
  const material = present ? resources(100) : null;
  git(provider, 'init', '-q');
  git(provider, 'config', 'user.name', 'Fixture');
  git(provider, 'config', 'user.email', 'fixture@example.invalid');
  const pin = commit(provider);
  const runWith = (flags: string[], extra: NodeJS.ProcessEnv = {}) =>
    execFileSync('sh', [script, ...flags], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RPG_GAME_ASSETS_PATH: provider,
        RPG_WEB_ROOT: web,
        ASSETS_SYNC_SKIP_UPDATE: '1',
        ...extra,
      },
    });
  const run = (...flags: string[]) => runWith(flags);
  return {
    base,
    provider,
    web,
    source,
    runtime,
    output,
    resources,
    material,
    pin,
    run,
    runWith,
  };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
describe('world-material sync ownership', () => {
  it('adopts only material resources and metadata, preserves every unrelated destination, and checks without writes', () => {
    const f = fixture();
    for (const path of [
      'characters/keep.glb',
      'npcs/keep.glb',
      'world-assets/keep.glb',
      'thumbnails/keep.png',
    ])
      put(join(f.runtime, path), 'local unrelated');
    put(join(f.web, 'public/models/custom-dice/keep.glb'), 'local dice');
    put(
      join(f.web, 'src/generated/worldAssetCatalog.ts'),
      'unrelated world catalog'
    );
    f.run('--world-materials');
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain(f.pin);
    expect(readFileSync(join(f.runtime, f.material!.file))).toEqual(
      f.material!.bytes
    );
    for (const path of [
      'characters/keep.glb',
      'npcs/keep.glb',
      'world-assets/keep.glb',
      'thumbnails/keep.png',
    ])
      expect(readFileSync(join(f.runtime, path), 'utf8')).toBe(
        'local unrelated'
      );
    expect(
      readFileSync(join(f.web, 'public/models/custom-dice/keep.glb'), 'utf8')
    ).toBe('local dice');
    expect(
      readFileSync(join(f.web, 'src/generated/worldAssetCatalog.ts'), 'utf8')
    ).toBe('unrelated world catalog');
    f.run('--world-materials', '--check');
    expect(readFileSync(f.output, 'utf8')).toBe(output);
    put(join(f.runtime, f.material!.file), 'corrupt');
    expect(() => f.run('--world-materials', '--check')).toThrow();
    expect(readFileSync(f.output, 'utf8')).toBe(output);
  });
  it('reproduces the material pin rather than HEAD and does not rewrite tracked metadata', () => {
    const f = fixture();
    f.run('--world-materials');
    const output = readFileSync(f.output, 'utf8');
    const newer = f.resources(200);
    commit(f.provider);
    f.run('--pinned-runtime');
    expect(readFileSync(join(f.runtime, f.material!.file))).toEqual(
      f.material!.bytes
    );
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
    expect(readFileSync(f.output, 'utf8')).toBe(output);
    expect(readFileSync(join(f.source, newer.file))).toEqual(newer.bytes);
    expect(git(f.provider, 'status', '--porcelain')).toBe('');
  });
  it('preserves the separate material pin during ordinary customization/NPC adoption', () => {
    const f = fixture();
    f.run('--world-materials');
    const original = readFileSync(f.output, 'utf8');
    const newer = f.resources(201);
    commit(f.provider);
    const generator = join(f.base, 'other-owner-generator.mjs');
    put(
      generator,
      "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[process.argv.indexOf('--output')+1], 'other owner fixture');\n"
    );
    f.runWith([], {
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR: generator,
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER: process.execPath,
      RPG_NPC_APPEARANCE_CATALOG_GENERATOR: generator,
      RPG_NPC_APPEARANCE_CATALOG_RUNNER: process.execPath,
      RPG_NPC_APPEARANCE_RELEASE_SELECTION: generator,
    });
    expect(readFileSync(f.output, 'utf8')).toBe(original);
    expect(readFileSync(join(f.runtime, f.material!.file))).toEqual(
      f.material!.bytes
    );
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
  });
  it('pins absence and removes future HEAD material files only in the assembled/destination owner', () => {
    const f = fixture(false);
    f.run('--world-materials');
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain('catalogSha256: null');
    const newer = f.resources(200);
    commit(f.provider);
    put(join(f.runtime, newer.file), newer.bytes);
    f.run('--pinned-runtime');
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
    expect(readFileSync(join(f.source, newer.file))).toEqual(newer.bytes);
    expect(readFileSync(f.output, 'utf8')).toBe(output);
  });
  it('refuses corrupt source before copying or moving the pin', () => {
    const f = fixture();
    f.run('--world-materials');
    const output = readFileSync(f.output, 'utf8'),
      bytes = readFileSync(join(f.runtime, f.material!.file));
    put(join(f.source, f.material!.file), 'corrupt');
    commit(f.provider);
    expect(() => f.run('--world-materials')).toThrow();
    expect(readFileSync(f.output, 'utf8')).toBe(output);
    expect(readFileSync(join(f.runtime, f.material!.file))).toEqual(bytes);
  });
  it('refuses a missing pin without changing runtime bytes', () => {
    const f = fixture();
    f.run('--world-materials');
    put(
      f.output,
      readFileSync(f.output, 'utf8').replace(f.pin, 'f'.repeat(40))
    );
    expect(() => f.run('--pinned-runtime')).toThrow();
    expect(readFileSync(join(f.runtime, f.material!.file))).toEqual(
      f.material!.bytes
    );
  });
});
