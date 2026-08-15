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

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))
  )
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'asset-sync-'));
  roots.push(root);
  const web = join(root, 'web');
  const assets = join(root, 'assets');
  const bin = join(root, 'bin');
  await mkdir(join(web, 'scripts'), { recursive: true });
  await mkdir(join(web, 'public/models/synty'), { recursive: true });
  await mkdir(join(assets, 'harness/models/synty'), { recursive: true });
  await mkdir(bin);
  await copyFile(
    join(process.cwd(), 'scripts/sync-synty-assets.sh'),
    join(web, 'scripts/sync-synty-assets.sh')
  );
  const forbiddenLog = join(root, 'forbidden.log');
  for (const command of ['git', 'ssh', 'curl', 'wget']) {
    await writeFile(
      join(bin, command),
      `#!/bin/sh\nprintf '%s %s\\n' "${command}" "$*" >> "${forbiddenLog}"\nexit 97\n`
    );
    await chmod(join(bin, command), 0o755);
  }
  return { root, web, assets, bin, forbiddenLog };
}

describe('sync-synty-assets', () => {
  it('copies exact explicit assets, deletes stale files, and never invokes git', async () => {
    const f = await fixture();
    await writeFile(
      join(f.assets, 'harness/models/synty/keep.glb'),
      'new-bytes'
    );
    await writeFile(join(f.web, 'public/models/synty/stale.glb'), 'stale');

    const run = spawnSync('sh', [join(f.web, 'scripts/sync-synty-assets.sh')], {
      env: {
        ...process.env,
        RPG_GAME_ASSETS_PATH: f.assets,
        PATH: `${f.bin}:${process.env.PATH}`,
      },
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
    expect(
      await readFile(join(f.web, 'public/models/synty/keep.glb'), 'utf8')
    ).toBe('new-bytes');
    expect(existsSync(join(f.web, 'public/models/synty/stale.glb'))).toBe(
      false
    );
    expect(existsSync(f.forbiddenLog)).toBe(false);
  });

  it('fails for a missing explicit source before mutating the destination', async () => {
    const f = await fixture();
    await rm(join(f.assets, 'harness/models/synty'), { recursive: true });
    const stale = join(f.web, 'public/models/synty/stale.glb');
    await writeFile(stale, 'stale');

    const run = spawnSync('sh', [join(f.web, 'scripts/sync-synty-assets.sh')], {
      env: {
        ...process.env,
        RPG_GAME_ASSETS_PATH: f.assets,
        PATH: `${f.bin}:${process.env.PATH}`,
      },
      encoding: 'utf8',
    });

    expect(run.status).not.toBe(0);
    expect(await readFile(stale, 'utf8')).toBe('stale');
    expect(existsSync(f.forbiddenLog)).toBe(false);
  });

  it('uses the legacy sibling checkout when RPG_GAME_ASSETS_PATH is unset', async () => {
    const f = await fixture();
    const legacyAssets = join(f.root, 'rpg-game-assets');
    await mkdir(join(legacyAssets, '.git'), { recursive: true });

    const legacyEnv = { ...process.env };
    delete legacyEnv.RPG_GAME_ASSETS_PATH;
    const run = spawnSync('sh', [join(f.web, 'scripts/sync-synty-assets.sh')], {
      env: { ...legacyEnv, PATH: `${f.bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });

    expect(run.status).toBe(97);
    expect(await readFile(f.forbiddenLog, 'utf8')).toBe(
      `git -C ${legacyAssets} pull\n`
    );
  });
});
