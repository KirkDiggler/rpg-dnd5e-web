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
import { withoutGitLocalEnvironment } from './testGitEnvironment';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const syncScript = join(repoRoot, 'scripts', 'sync-game-assets.sh');
const temporaryRoots: string[] = [];
const gitEnvironment = withoutGitLocalEnvironment(process.env);

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
    join(customDiceSource, 'original-set', 'Original_D20_Source.glb'),
    'production-d20-runtime'
  );
  await put(
    join(customDiceSource, 'dice-tray-presets.json'),
    JSON.stringify({
      schemaVersion: 1,
      presets: [
        {
          presetId: 'dice.original.carved.d20',
          model: { path: 'original-set/Original_D20_Source.glb' },
        },
      ],
    })
  );
  await put(join(syntySource, 'source.blend'), 'private-source');
  await put(join(customDiceSource, 'nested', 'source.blend'), 'private-source');
  await put(join(syntySource, 'review', 'notes.txt'), 'private-review');
  await put(
    join(customDiceSource, 'evidence', 'private.png'),
    'private-evidence'
  );
  await put(
    join(assetsRoot, 'library', 'models', 'synty', 'library.glb'),
    'library-only'
  );
  await put(join(assetsRoot, 'evidence', 'review.glb'), 'review-only');

  await execFileAsync('git', ['init', '--quiet'], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['config', 'user.name', 'Asset Fixture'], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
  await execFileAsync(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    { cwd: assetsRoot, env: gitEnvironment }
  );
  await execFileAsync('git', ['add', '.'], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
  const { stdout: providerHead } = await execFileAsync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: assetsRoot, env: gitEnvironment }
  );

  const fakeGenerator = join(root, 'fake-catalog-generator.ts');
  await put(
    fakeGenerator,
    `const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
enum Phase { BeforeSync = 'before-sync' }
const value = (name: string): string => process.argv[process.argv.indexOf(name) + 1];
const providerRoot = value('--provider-root');
const output = value('--output');
const copiedFirst = existsSync(join(process.env.RPG_WEB_ROOT, 'public/models/synty/dice-tray.glb')) &&
  existsSync(join(process.env.RPG_WEB_ROOT, 'public/models/custom-dice/d20.glb'));
const head = execFileSync('git', ['-C', providerRoot, 'rev-parse', '--verify', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ providerRoot, copiedFirst, head, phase: Phase.BeforeSync }));
`
  );
  const generatedCatalog = join(
    webRoot,
    'src',
    'generated',
    'characterCustomizationCatalog.ts'
  );

  return {
    assetsRoot,
    webRoot,
    syntySource,
    customDiceSource,
    syntyDestination,
    customDiceDestination,
    fakeGenerator,
    generatedCatalog,
    providerHead: providerHead.trim(),
  };
}

async function runSync(assetsRoot: string, webRoot: string, generator: string) {
  return execFileAsync('sh', [syncScript], {
    cwd: repoRoot,
    env: {
      ...gitEnvironment,
      RPG_GAME_ASSETS_PATH: assetsRoot,
      RPG_WEB_ROOT: webRoot,
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR: generator,
      RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER: join(
        repoRoot,
        'node_modules',
        '.bin',
        'tsx'
      ),
      ASSETS_SYNC_SKIP_UPDATE: '1',
    },
  });
}

async function runRuntimeSync(assetsRoot: string, webRoot: string) {
  return execFileAsync('sh', [syncScript, '--runtime-assets'], {
    cwd: repoRoot,
    env: {
      ...gitEnvironment,
      RPG_GAME_ASSETS_PATH: assetsRoot,
      RPG_WEB_ROOT: webRoot,
      ASSETS_SYNC_SKIP_UPDATE: '1',
    },
  });
}

async function commitFixture(assetsRoot: string, message: string) {
  await execFileAsync('git', ['add', '--all'], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['commit', '--quiet', '-m', message], {
    cwd: assetsRoot,
    env: gitEnvironment,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
        // Every fixture root holds a real `git init` repo, and the script
        // under test runs `git status` then exits immediately (its "exactly
        // clean" guard). The rejection settles the instant `sh` exits, so
        // this delete can begin while git's own writes into .git are still
        // landing -- surfacing as ENOTEMPTY on a .git subdirectory. `force`
        // suppresses ENOENT, not that. These are the options node documents
        // for exactly that transient set (EBUSY/EMFILE/ENFILE/ENOTEMPTY/
        // EPERM); the tree is throwaway scratch whose only requirement is to
        // be gone, so retrying its removal is the intended API use rather
        // than a mask over a product bug.
        maxRetries: 3,
        retryDelay: 100,
      })
    )
  );
});

describe('private game asset sync boundary', () => {
  it('packages both production runtime roots and the manifest-referenced d20 without regenerating catalogs', async () => {
    const fixture = await makeFixture();
    await put(join(fixture.syntyDestination, 'stale-synty.glb'), 'stale');
    await put(join(fixture.customDiceDestination, 'stale-custom.glb'), 'stale');
    await put(fixture.generatedCatalog, 'existing-catalog');

    await runRuntimeSync(fixture.assetsRoot, fixture.webRoot);

    await expect(
      readFile(join(fixture.syntyDestination, 'dice-tray.glb'), 'utf8')
    ).resolves.toBe('synty-runtime');
    await expect(
      readFile(
        join(
          fixture.customDiceDestination,
          'original-set',
          'Original_D20_Source.glb'
        ),
        'utf8'
      )
    ).resolves.toBe('production-d20-runtime');
    await expect(
      readFile(
        join(fixture.customDiceDestination, 'dice-tray-presets.json'),
        'utf8'
      ).then(JSON.parse)
    ).resolves.toMatchObject({
      presets: [
        {
          presetId: 'dice.original.carved.d20',
          model: { path: 'original-set/Original_D20_Source.glb' },
        },
      ],
    });
    await expect(readFile(fixture.generatedCatalog, 'utf8')).resolves.toBe(
      'existing-catalog'
    );

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
      await exists(join(fixture.syntyDestination, 'review', 'notes.txt'))
    ).toBe(false);
    expect(
      await exists(
        join(fixture.customDiceDestination, 'evidence', 'private.png')
      )
    ).toBe(false);
  });

  it.each([
    ['dice manifest', 'dice-tray-presets.json'],
    [
      'manifest-referenced d20',
      join('original-set', 'Original_D20_Source.glb'),
    ],
  ])(
    'fails before either destination is mutated when the production %s is missing',
    async (_artifact, relativePath) => {
      const fixture = await makeFixture();
      await rm(join(fixture.customDiceSource, relativePath));
      await commitFixture(fixture.assetsRoot, `remove ${relativePath}`);
      const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
      const customSentinel = join(
        fixture.customDiceDestination,
        'keep-custom.txt'
      );
      await put(syntySentinel, 'do-not-mutate');
      await put(customSentinel, 'do-not-mutate');

      await expect(
        runRuntimeSync(fixture.assetsRoot, fixture.webRoot)
      ).rejects.toMatchObject({
        code: expect.any(Number),
        stderr: expect.stringContaining(relativePath),
      });
      await expect(readFile(syntySentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
      await expect(readFile(customSentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
    }
  );

  it.each([
    ['top-level evidence directory', 'evidence/Original_D20_Source.glb'],
    ['top-level review directory', 'review/Original_D20_Source.glb'],
    [
      'nested evidence directory',
      'original-set/evidence/Original_D20_Source.glb',
    ],
    ['nested review directory', 'original-set/review/Original_D20_Source.glb'],
    [
      'blend directory component',
      'original-set/source.blend/Original_D20_Source.glb',
    ],
    ['blend file component', 'original-set/Original_D20_Source.blend'],
  ])(
    'fails before either destination is mutated when the production d20 path uses an excluded %s',
    async (_exclusion, relativePath) => {
      const fixture = await makeFixture();
      await rm(
        join(
          fixture.customDiceSource,
          'original-set',
          'Original_D20_Source.glb'
        )
      );
      await put(
        join(fixture.customDiceSource, relativePath),
        'excluded-production-d20'
      );
      await put(
        join(fixture.customDiceSource, 'dice-tray-presets.json'),
        JSON.stringify({
          schemaVersion: 1,
          presets: [
            {
              presetId: 'dice.original.carved.d20',
              model: { path: relativePath },
            },
          ],
        })
      );
      await commitFixture(fixture.assetsRoot, `exclude ${relativePath}`);
      const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
      const customSentinel = join(
        fixture.customDiceDestination,
        'keep-custom.txt'
      );
      await put(syntySentinel, 'do-not-mutate');
      await put(customSentinel, 'do-not-mutate');

      await expect(
        runRuntimeSync(fixture.assetsRoot, fixture.webRoot)
      ).rejects.toMatchObject({
        code: expect.any(Number),
        stderr: expect.stringContaining(relativePath),
      });
      await expect(readFile(syntySentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
      await expect(readFile(customSentinel, 'utf8')).resolves.toBe(
        'do-not-mutate'
      );
    }
  );

  it('fails when the explicit production provider root is missing', async () => {
    const fixture = await makeFixture();
    await rm(fixture.assetsRoot, { recursive: true });

    await expect(
      runRuntimeSync(fixture.assetsRoot, fixture.webRoot)
    ).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringContaining('provider root'),
    });
  });

  it('independently mirrors only the two approved runtime roots', async () => {
    const fixture = await makeFixture();
    await put(join(fixture.syntyDestination, 'stale-synty.glb'), 'stale');
    await put(join(fixture.customDiceDestination, 'stale-custom.glb'), 'stale');

    await runSync(fixture.assetsRoot, fixture.webRoot, fixture.fakeGenerator);

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
      ).then(JSON.parse)
    ).resolves.toMatchObject({
      presets: [
        {
          presetId: 'dice.original.carved.d20',
          model: { path: 'original-set/Original_D20_Source.glb' },
        },
      ],
    });

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
    await expect(
      readFile(fixture.generatedCatalog, 'utf8').then(JSON.parse)
    ).resolves.toEqual({
      providerRoot: fixture.assetsRoot,
      copiedFirst: false,
      head: fixture.providerHead,
      phase: 'before-sync',
    });
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
      await execFileAsync('git', ['add', '--all'], {
        cwd: fixture.assetsRoot,
        env: gitEnvironment,
      });
      await execFileAsync(
        'git',
        ['commit', '--quiet', '-m', `remove ${missingRoot}`],
        { cwd: fixture.assetsRoot, env: gitEnvironment }
      );
      const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
      const customSentinel = join(
        fixture.customDiceDestination,
        'keep-custom.txt'
      );
      await put(syntySentinel, 'do-not-mutate');
      await put(customSentinel, 'do-not-mutate');

      await expect(
        runSync(fixture.assetsRoot, fixture.webRoot, fixture.fakeGenerator)
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

  it('runs catalog validation before mutating either runtime destination', async () => {
    const fixture = await makeFixture();
    const failingGenerator = join(
      await temporaryRoot(),
      'failing-catalog-generator.ts'
    );
    await put(
      failingGenerator,
      `throw new Error('catalog validation failed');\n`
    );
    const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
    const customSentinel = join(
      fixture.customDiceDestination,
      'keep-custom.txt'
    );
    await put(syntySentinel, 'do-not-mutate');
    await put(customSentinel, 'do-not-mutate');

    await expect(
      runSync(fixture.assetsRoot, fixture.webRoot, failingGenerator)
    ).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringContaining('catalog validation failed'),
    });
    await expect(readFile(syntySentinel, 'utf8')).resolves.toBe(
      'do-not-mutate'
    );
    await expect(readFile(customSentinel, 'utf8')).resolves.toBe(
      'do-not-mutate'
    );
  });

  it('rejects a dirty provider before mutating either runtime destination', async () => {
    const fixture = await makeFixture();
    const syntySentinel = join(fixture.syntyDestination, 'keep-synty.txt');
    const customSentinel = join(
      fixture.customDiceDestination,
      'keep-custom.txt'
    );
    await put(syntySentinel, 'do-not-mutate');
    await put(customSentinel, 'do-not-mutate');
    await put(join(fixture.assetsRoot, 'untracked-provider-file'), 'dirty');

    await expect(
      runSync(fixture.assetsRoot, fixture.webRoot, fixture.fakeGenerator)
    ).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringContaining('exactly clean'),
    });
    await expect(readFile(syntySentinel, 'utf8')).resolves.toBe(
      'do-not-mutate'
    );
    await expect(readFile(customSentinel, 'utf8')).resolves.toBe(
      'do-not-mutate'
    );
    expect(await exists(fixture.generatedCatalog)).toBe(false);
  });

  it('gitignores both private public runtime roots', async () => {
    for (const root of ['synty', 'custom-dice']) {
      const probe = `public/models/${root}/.private-provider-probe`;
      await expect(
        execFileAsync('git', ['check-ignore', '--quiet', '--no-index', probe], {
          cwd: repoRoot,
          env: gitEnvironment,
        })
      ).resolves.toBeDefined();
    }
  });
});
