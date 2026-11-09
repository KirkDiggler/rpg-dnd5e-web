// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
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
  const base = mkdtempSync(join(tmpdir(), 'ground-sync-'));
  roots.push(base);
  const provider = join(base, 'provider'),
    web = join(base, 'web'),
    source = join(provider, 'harness/models/synty'),
    runtime = join(web, 'public/models/synty'),
    output = join(web, 'src/generated/groundCatalogProvider.ts');
  const resources = (color: number, alpha = 255) => {
    const bytes = PNG.sync.write({
        width: 1,
        height: 1,
        data: Buffer.from([color, 128, 30, alpha]),
      }),
      sha256 = digest(bytes),
      file = `ground/images/${sha256}.png`;
    rmSync(join(source, 'ground'), { recursive: true, force: true });
    put(join(source, file), bytes);
    put(
      join(source, 'ground/manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        styles: [
          {
            ref: 'dnd5e:ground:test:grass',
            displayName: 'Grass',
            diffuse: file,
            sha256,
            width: 1,
            height: 1,
            worldUnitsPerRepeat: 6,
          },
        ],
      })
    );
    return { bytes, file };
  };
  put(join(source, 'characters/keep.glb'), 'character');
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
  const ground = present ? resources(100) : null;
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
  return {
    base,
    provider,
    web,
    source,
    runtime,
    output,
    resources,
    ground,
    pin,
    runWith,
    run: (...flags: string[]) => runWith(flags),
  };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
describe('ground provider adoption', () => {
  it('installs only the ground owner and checks the installed bytes without rewriting its pin', () => {
    const f = fixture();
    put(join(f.runtime, 'characters/keep.glb'), 'local character');
    put(join(f.web, 'public/models/custom-dice/keep.glb'), 'local dice');
    f.run('--ground');
    const pin = readFileSync(f.output, 'utf8');
    expect(pin).toContain(f.pin);
    expect(pin).toContain(
      digest(readFileSync(join(f.source, 'ground/manifest.json')))
    );
    expect(readFileSync(join(f.runtime, f.ground!.file))).toEqual(
      f.ground!.bytes
    );
    expect(readFileSync(join(f.runtime, 'characters/keep.glb'), 'utf8')).toBe(
      'local character'
    );
    expect(
      readFileSync(join(f.web, 'public/models/custom-dice/keep.glb'), 'utf8')
    ).toBe('local dice');
    f.run('--ground', '--check');
    expect(readFileSync(f.output, 'utf8')).toBe(pin);
    put(join(f.runtime, f.ground!.file), 'corrupt');
    expect(() => f.run('--ground', '--check')).toThrow(/hash|PNG/);
    expect(readFileSync(f.output, 'utf8')).toBe(pin);
  });
  it('reproduces the adopted ground rather than newer provider HEAD, without changing provider or metadata', () => {
    const f = fixture();
    f.run('--ground');
    const pin = readFileSync(f.output, 'utf8');
    const newer = f.resources(200);
    const head = commit(f.provider);
    f.run('--pinned-runtime');
    expect(readFileSync(join(f.runtime, f.ground!.file))).toEqual(
      f.ground!.bytes
    );
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
    expect(readFileSync(f.output, 'utf8')).toBe(pin);
    expect(git(f.provider, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(f.provider, 'status', '--porcelain')).toBe('');
    const tampered = pin.replace(/[a-f0-9]{64}/, '0'.repeat(64));
    expect(tampered).not.toBe(pin);
    put(f.output, tampered);
    expect(() => f.run('--pinned-runtime')).toThrow(/stale/);
  });
  it('preserves the independent ground pin during ordinary customization/NPC adoption', () => {
    const f = fixture();
    f.run('--ground');
    const pin = readFileSync(f.output, 'utf8');
    const newer = f.resources(201);
    commit(f.provider);
    const generator = join(f.base, 'other-owner.mjs');
    put(
      generator,
      "import {writeFileSync} from 'node:fs';writeFileSync(process.argv[process.argv.indexOf('--output')+1],'other owner');"
    );
    f.runWith([], {
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR: generator,
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER: process.execPath,
      RPG_NPC_APPEARANCE_CATALOG_GENERATOR: generator,
      RPG_NPC_APPEARANCE_CATALOG_RUNNER: process.execPath,
      RPG_NPC_APPEARANCE_RELEASE_SELECTION: generator,
    });
    expect(readFileSync(join(f.runtime, f.ground!.file))).toEqual(
      f.ground!.bytes
    );
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
    expect(readFileSync(f.output, 'utf8')).toBe(pin);
  });
  it('pins absence so future HEAD resources cannot silently appear', () => {
    const f = fixture(false);
    f.run('--ground');
    const pin = readFileSync(f.output, 'utf8');
    expect(pin).toContain('catalogSha256: null');
    const newer = f.resources(200);
    commit(f.provider);
    f.run('--pinned-runtime');
    expect(existsSync(join(f.runtime, newer.file))).toBe(false);
    expect(readFileSync(f.output, 'utf8')).toBe(pin);
  });
  it.each([
    'dirty',
    'extra',
    'symlink',
    'transparent',
    'crc',
    'dimensions',
  ] as const)(
    'refuses %s provider input before touching the installed owner',
    (kind) => {
      const f = fixture();
      const sentinel = join(f.runtime, 'ground/keep.txt');
      put(sentinel, 'keep');
      if (kind === 'dirty') put(join(f.source, 'ground/new.txt'), 'dirty');
      if (kind === 'extra') put(join(f.source, 'ground/new.txt'), 'unowned');
      if (kind === 'symlink') {
        const path = join(f.source, f.ground!.file);
        rmSync(path);
        put(join(f.provider, 'external.png'), f.ground!.bytes);
        symlinkSync(join(f.provider, 'external.png'), path);
      }
      if (kind === 'transparent') f.resources(100, 0);
      if (kind === 'crc' || kind === 'dimensions') {
        const path = join(f.source, 'ground/manifest.json'),
          doc = JSON.parse(readFileSync(path, 'utf8'));
        if (kind === 'dimensions') doc.styles[0].width = 2;
        else {
          const bad = Buffer.from(f.ground!.bytes);
          bad[bad.length - 1] ^= 1;
          const sha = digest(bad);
          rmSync(join(f.source, f.ground!.file));
          doc.styles[0].sha256 = sha;
          doc.styles[0].diffuse = `ground/images/${sha}.png`;
          put(join(f.source, doc.styles[0].diffuse), bad);
        }
        put(path, JSON.stringify(doc));
      }
      if (kind !== 'dirty') commit(f.provider);
      expect(() => f.run('--ground')).toThrow(
        kind === 'dirty' ? /clean/ : /file set|symlink|opaque|PNG/
      );
      expect(readFileSync(sentinel, 'utf8')).toBe('keep');
      expect(existsSync(f.output)).toBe(false);
    }
  );
});
