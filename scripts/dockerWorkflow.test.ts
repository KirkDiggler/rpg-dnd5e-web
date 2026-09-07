// @vitest-environment node
import { execFile } from 'node:child_process';
import {
  access,
  chmod,
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
import { parse } from 'yaml';
import { withoutGitLocalEnvironment } from './testGitEnvironment';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workflowPath = join(repoRoot, '.github', 'workflows', 'docker.yml');
const syncScript = join(repoRoot, 'scripts', 'sync-game-assets.sh');
const temporaryRoots: string[] = [];
const gitEnvironment = withoutGitLocalEnvironment(process.env);

type WorkflowStep = {
  readonly env?: Readonly<Record<string, unknown>>;
  readonly run?: unknown;
};

type DockerWorkflow = {
  readonly jobs?: {
    readonly build?: {
      readonly steps?: readonly WorkflowStep[];
    };
  };
};

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'docker-runtime-assets-'));
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

async function assetStepScript() {
  const workflow = parse(
    await readFile(workflowPath, 'utf8')
  ) as DockerWorkflow;
  const step = workflow.jobs?.build?.steps?.find(
    (candidate) => candidate.env && 'ASSETS_READ_TOKEN' in candidate.env
  );
  if (!step || typeof step.run !== 'string') {
    throw new Error('docker workflow has no executable private asset step');
  }
  return step.run;
}

async function makeFixture() {
  const root = await temporaryRoot();
  const providerRoot = join(root, 'provider');
  const webRoot = join(root, 'web');
  const fakeBin = join(root, 'bin');
  const syntyRoot = join(providerRoot, 'harness', 'models', 'synty');
  const customDiceRoot = join(providerRoot, 'harness', 'models', 'custom-dice');

  await put(join(syntyRoot, 'world-assets', 'crypt-wall.glb'), 'world-runtime');
  await put(join(syntyRoot, 'source.blend'), 'private-source');
  await put(
    join(customDiceRoot, 'original-set', 'Original_D20_Source.glb'),
    'production-d20-runtime'
  );
  await put(
    join(customDiceRoot, 'dice-tray-presets.json'),
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
  await put(join(customDiceRoot, 'evidence', 'review.txt'), 'private-review');

  await execFileAsync('git', ['init', '--quiet'], {
    cwd: providerRoot,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['config', 'user.name', 'Asset Fixture'], {
    cwd: providerRoot,
    env: gitEnvironment,
  });
  await execFileAsync(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    { cwd: providerRoot, env: gitEnvironment }
  );
  await execFileAsync('git', ['add', '.'], {
    cwd: providerRoot,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: providerRoot,
    env: gitEnvironment,
  });

  await mkdir(join(webRoot, 'scripts'), { recursive: true });
  await writeFile(
    join(webRoot, 'scripts', 'sync-game-assets.sh'),
    await readFile(syncScript)
  );

  const realGit = (
    await execFileAsync('sh', ['-c', 'command -v git'])
  ).stdout.trim();
  const fakeGit = join(fakeBin, 'git');
  await put(
    fakeGit,
    `#!/bin/sh
if [ "$1" = "clone" ]; then
  for destination do :; done
  cp -R "$FIXTURE_PROVIDER"/. "$destination"/
  exit 0
fi
exec "$REAL_GIT" "$@"
`
  );
  await chmod(fakeGit, 0o755);

  return {
    providerRoot,
    webRoot,
    env: {
      ...gitEnvironment,
      ASSETS_READ_TOKEN: 'fixture-token',
      FIXTURE_PROVIDER: providerRoot,
      GITHUB_WORKSPACE: webRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      REAL_GIT: realGit,
    },
  };
}

async function runAssetStep(
  script: string,
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  token: string
) {
  return execFileAsync('sh', ['-c', script], {
    cwd: fixture.webRoot,
    env: { ...fixture.env, ASSETS_READ_TOKEN: token },
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

describe('production Docker private runtime packaging', () => {
  it('fails instead of building without the required provider secret', async () => {
    const script = await assetStepScript();
    const fixture = await makeFixture();

    await expect(runAssetStep(script, fixture, '')).rejects.toMatchObject({
      code: expect.any(Number),
    });
    expect(
      await exists(
        join(fixture.webRoot, 'public', 'models', 'synty', 'world-assets')
      )
    ).toBe(false);
  });

  it('executes the workflow step to package both approved roots and the production d20 only from runtime material', async () => {
    const script = await assetStepScript();
    const fixture = await makeFixture();

    await runAssetStep(script, fixture, 'fixture-token');

    await expect(
      readFile(
        join(
          fixture.webRoot,
          'public',
          'models',
          'synty',
          'world-assets',
          'crypt-wall.glb'
        ),
        'utf8'
      )
    ).resolves.toBe('world-runtime');
    await expect(
      readFile(
        join(
          fixture.webRoot,
          'public',
          'models',
          'custom-dice',
          'dice-tray-presets.json'
        ),
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
    await expect(
      readFile(
        join(
          fixture.webRoot,
          'public',
          'models',
          'custom-dice',
          'original-set',
          'Original_D20_Source.glb'
        ),
        'utf8'
      )
    ).resolves.toBe('production-d20-runtime');
    expect(
      await exists(
        join(fixture.webRoot, 'public', 'models', 'synty', 'source.blend')
      )
    ).toBe(false);
    expect(
      await exists(
        join(
          fixture.webRoot,
          'public',
          'models',
          'custom-dice',
          'evidence',
          'review.txt'
        )
      )
    ).toBe(false);
  });
});
