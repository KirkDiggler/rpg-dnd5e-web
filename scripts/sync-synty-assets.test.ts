// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitLocalEnvironment } from './testGitEnvironment';

const roots: string[] = [];
const gitEnvironment = withoutGitLocalEnvironment(process.env);
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
);

function commitFixture(assets: string, message: string): void {
  for (const args of [
    ['add', '--all'],
    ['commit', '--quiet', '-m', message],
  ]) {
    const result = spawnSync('git', args, {
      cwd: assets,
      encoding: 'utf8',
      env: gitEnvironment,
    });
    expect(result.status, result.stderr).toBe(0);
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'asset-sync-'));
  roots.push(root);
  const web = join(root, 'web');
  const assets = join(root, 'assets');
  const bin = join(root, 'bin');
  await mkdir(join(web, 'scripts'), { recursive: true });
  await mkdir(join(web, 'public/models/synty'), { recursive: true });
  await mkdir(join(assets, 'harness/models/synty'), { recursive: true });
  await mkdir(join(assets, 'harness/models/custom-dice'), { recursive: true });
  await writeFile(
    join(assets, 'harness/models/synty/provider-sentinel.txt'),
    'provider'
  );
  await writeFile(
    join(assets, 'harness/models/custom-dice/provider-sentinel.txt'),
    'provider'
  );
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Asset Fixture'],
    ['config', 'user.email', 'fixture@example.invalid'],
  ]) {
    const result = spawnSync('git', args, {
      cwd: assets,
      encoding: 'utf8',
      env: gitEnvironment,
    });
    expect(result.status, result.stderr).toBe(0);
  }
  commitFixture(assets, 'fixture');
  await mkdir(bin);
  await Promise.all(
    ['sync-synty-assets.sh', 'sync-game-assets.sh'].map((script) =>
      copyFile(
        join(process.cwd(), 'scripts', script),
        join(web, 'scripts', script)
      )
    )
  );

  const fakeGenerator = join(root, 'fake-generator.ts');
  const fakeRunner = join(root, 'fake-runner.sh');
  await writeFile(fakeGenerator, '// generator fixture\n');
  await writeFile(
    fakeRunner,
    `#!/bin/sh
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) OUTPUT=$2; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$(dirname "$OUTPUT")"
printf 'generated fixture\\n' > "$OUTPUT"
`
  );
  await chmod(fakeRunner, 0o755);

  const forbiddenLog = join(root, 'forbidden.log');
  for (const command of ['ssh', 'curl', 'wget']) {
    await writeFile(
      join(bin, command),
      `#!/bin/sh\nprintf '%s %s\\n' "${command}" "$*" >> "${forbiddenLog}"\nexit 97\n`
    );
    await chmod(join(bin, command), 0o755);
  }
  return {
    root,
    web,
    assets,
    bin,
    forbiddenLog,
    fakeGenerator,
    fakeRunner,
  };
}

function syncEnvironment(fixtureValue: Awaited<ReturnType<typeof fixture>>) {
  return {
    ...gitEnvironment,
    RPG_GAME_ASSETS_PATH: fixtureValue.assets,
    RPG_DWARF_CATALOG_GENERATOR: fixtureValue.fakeGenerator,
    RPG_DWARF_CATALOG_RUNNER: fixtureValue.fakeRunner,
    PATH: `${fixtureValue.bin}:${process.env.PATH}`,
  };
}

describe('sync-synty-assets', () => {
  it('copies exact explicit assets from a clean commit and avoids network commands', async () => {
    const fixtureValue = await fixture();
    await writeFile(
      join(fixtureValue.assets, 'harness/models/synty/keep.glb'),
      'new-bytes'
    );
    await writeFile(
      join(fixtureValue.web, 'public/models/synty/stale.glb'),
      'stale'
    );
    commitFixture(fixtureValue.assets, 'add exact runtime asset');

    const run = spawnSync(
      'sh',
      [join(fixtureValue.web, 'scripts/sync-synty-assets.sh')],
      {
        env: syncEnvironment(fixtureValue),
        encoding: 'utf8',
      }
    );

    expect(run.status, run.stderr).toBe(0);
    expect(
      await readFile(
        join(fixtureValue.web, 'public/models/synty/keep.glb'),
        'utf8'
      )
    ).toBe('new-bytes');
    expect(
      existsSync(join(fixtureValue.web, 'public/models/synty/stale.glb'))
    ).toBe(false);
    expect(existsSync(fixtureValue.forbiddenLog)).toBe(false);
  });

  it('fails for a missing explicit source before mutating the destination', async () => {
    const fixtureValue = await fixture();
    await rm(join(fixtureValue.assets, 'harness/models/synty'), {
      recursive: true,
    });
    commitFixture(fixtureValue.assets, 'remove Synty runtime root');
    const stale = join(fixtureValue.web, 'public/models/synty/stale.glb');
    await writeFile(stale, 'stale');

    const run = spawnSync(
      'sh',
      [join(fixtureValue.web, 'scripts/sync-synty-assets.sh')],
      {
        env: syncEnvironment(fixtureValue),
        encoding: 'utf8',
      }
    );

    expect(run.status).not.toBe(0);
    expect(await readFile(stale, 'utf8')).toBe('stale');
    expect(existsSync(fixtureValue.forbiddenLog)).toBe(false);
  });

  it('uses the legacy sibling checkout when RPG_GAME_ASSETS_PATH is unset', async () => {
    const fixtureValue = await fixture();
    const legacyAssets = join(fixtureValue.root, 'rpg-game-assets');
    await mkdir(join(legacyAssets, '.git'), { recursive: true });
    await writeFile(
      join(fixtureValue.bin, 'git'),
      `#!/bin/sh\nprintf '%s %s\\n' "git" "$*" >> "${fixtureValue.forbiddenLog}"\nexit 97\n`
    );
    await chmod(join(fixtureValue.bin, 'git'), 0o755);

    const legacyEnv = syncEnvironment(fixtureValue);
    delete legacyEnv.RPG_GAME_ASSETS_PATH;
    const run = spawnSync(
      'sh',
      [join(fixtureValue.web, 'scripts/sync-synty-assets.sh')],
      {
        env: legacyEnv,
        encoding: 'utf8',
      }
    );

    expect(run.status).toBe(97);
    expect(await readFile(fixtureValue.forbiddenLog, 'utf8')).toBe(
      `git -C ${legacyAssets} pull\n`
    );
  });
});
