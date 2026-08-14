// @vitest-environment node
import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const syncScript = join(repoRoot, 'scripts', 'sync-game-assets.sh');
const temporaryRoots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'game-assets-sync-'));
  temporaryRoots.push(root);
  return root;
}

async function put(path: string, bytes: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function makeFixture() {
  const root = await temporaryRoot();
  const assetsRoot = join(root, 'rpg-game-assets');
  const webRoot = join(root, 'web');
  const syntySource = join(assetsRoot, 'harness', 'models', 'synty');
  const customDiceSource = join(assetsRoot, 'harness', 'models', 'custom-dice');
  const syntyDestination = join(webRoot, 'public', 'models', 'synty');
  const customDiceDestination = join(
    webRoot,
    'public',
    'models',
    'custom-dice'
  );

  await put(join(syntySource, 'dice-tray.glb'), 'synty-runtime');
  await put(join(customDiceSource, 'd20.glb'), 'custom-d20-runtime');
  await put(
    join(customDiceSource, 'dice-tray-presets.json'),
    '{"schemaVersion":1}'
  );
  await put(join(syntySource, 'source.blend'), 'private-source');
  await put(join(customDiceSource, 'nested', 'source.blend'), 'private-source');
  await put(
    join(customDiceSource, 'evidence', 'private.png'),
    'private-evidence'
  );
  await put(
    join(assetsRoot, 'library', 'models', 'synty', 'library.glb'),
    'library-only'
  );
  await put(join(assetsRoot, 'evidence', 'review.glb'), 'review-only');

  return {
    assetsRoot,
    webRoot,
    syntySource,
    customDiceSource,
    syntyDestination,
    customDiceDestination,
  };
}

async function runSync(assetsRoot: string, webRoot: string) {
  return execFileAsync('sh', [syncScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RPG_GAME_ASSETS_DIR: assetsRoot,
      RPG_WEB_ROOT: webRoot,
      ASSETS_SYNC_SKIP_UPDATE: '1',
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      })
    )
  );
});

describe('private game asset sync boundary', () => {
  it('independently mirrors only the two approved runtime roots', async () => {
    const fixture = await makeFixture();
    await put(join(fixture.syntyDestination, 'stale-synty.glb'), 'stale');
    await put(join(fixture.customDiceDestination, 'stale-custom.glb'), 'stale');

    await runSync(fixture.assetsRoot, fixture.webRoot);

    await expect(
      readFile(join(fixture.syntyDestination, 'dice-tray.glb'), 'utf8')
    ).resolves.toBe('synty-runtime');
    await expect(
      readFile(join(fixture.customDiceDestination, 'd20.glb'), 'utf8')
    ).resolves.toBe('custom-d20-runtime');
    await expect(
      readFile(
        join(fixture.customDiceDestination, 'dice-tray-presets.json'),
        'utf8'
      )
    ).resolves.toBe('{"schemaVersion":1}');

    expect(
      await exists(join(fixture.syntyDestination, 'stale-synty.glb'))
    ).toBe(false);
    expect(
      await exists(join(fixture.customDiceDestination, 'stale-custom.glb'))
    ).toBe(false);
    expect(await exists(join(fixture.syntyDestination, 'source.blend'))).toBe(
      false
    );
    expect(
      await exists(
        join(fixture.customDiceDestination, 'nested', 'source.blend')
      )
    ).toBe(false);
    expect(
      await exists(
        join(fixture.customDiceDestination, 'evidence', 'private.png')
      )
    ).toBe(false);
    expect(await exists(join(fixture.webRoot, 'public', 'library'))).toBe(
      false
    );
    expect(await exists(join(fixture.webRoot, 'public', 'evidence'))).toBe(
      false
    );
  });

  it.each(['synty', 'custom-dice'])(
    'preflights a missing %s root before mutating either destination',
    async (missingRoot) => {
      const fixture = await makeFixture();
      await rm(
        missingRoot === 'synty'
          ? fixture.syntySource
          : fixture.customDiceSource,
        { recursive: true }
      );
      const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
      const customSentinel = join(
        fixture.customDiceDestination,
        'keep-custom.txt'
      );
      await put(syntySentinel, 'do-not-mutate');
      await put(customSentinel, 'do-not-mutate');

      await expect(
        runSync(fixture.assetsRoot, fixture.webRoot)
      ).rejects.toMatchObject({
        code: expect.any(Number),
        stderr: expect.stringContaining(
          join(fixture.assetsRoot, 'harness', 'models', missingRoot)
        ),
      });
      await expect(readFile(syntySentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
      await expect(readFile(customSentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
    }
  );

  it('gitignores both private public runtime roots', async () => {
    for (const root of ['synty', 'custom-dice']) {
      const probe = `public/models/${root}/.private-provider-probe`;
      await expect(
        execFileAsync('git', ['check-ignore', '--quiet', '--no-index', probe], {
          cwd: repoRoot,
        })
      ).resolves.toBeDefined();
    }
  });
});
