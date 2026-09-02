// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  GIT_LOCAL_ENVIRONMENT,
  withoutGitLocalEnvironment,
} from './testGitEnvironment';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const vitestEntry = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);

describe('withoutGitLocalEnvironment', () => {
  it('removes hook-local repository bindings while preserving ordinary environment', () => {
    const result = withoutGitLocalEnvironment({
      PATH: '/bin',
      GIT_DIR: '/real/repository/.git/worktrees/feature',
      GIT_WORK_TREE: '/real/worktree',
      GIT_INDEX_FILE: '/real/index',
      GIT_OBJECT_DIRECTORY: '/real/objects',
      GIT_CONFIG_COUNT: '2',
      GIT_PUSH_OPTION_0: 'keep-this-nonlocal-option',
    });

    expect(result).toEqual({
      PATH: '/bin',
      GIT_PUSH_OPTION_0: 'keep-this-nonlocal-option',
    });
  });

  it('matches the installed Git local-environment list and removes every entry', async () => {
    const environment = withoutGitLocalEnvironment(process.env);
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--local-env-vars'],
      { cwd: repositoryRoot, env: environment }
    );
    const canonical = stdout.trim().split('\n').sort();
    expect([...GIT_LOCAL_ENVIRONMENT].sort()).toEqual(canonical);

    const polluted = Object.fromEntries(
      canonical.map((name) => [name, `/polluted/${name}`])
    );
    const result = withoutGitLocalEnvironment(polluted);
    for (const name of canonical) expect(result[name]).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const source = { PATH: '/bin', GIT_DIR: '/real/.git' };
    withoutGitLocalEnvironment(source);
    expect(source).toEqual({ PATH: '/bin', GIT_DIR: '/real/.git' });
  });

  it('keeps a sacrificial branch unchanged when fixture suites inherit hook bindings', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'hook-git-fixture-'));
    const cleanEnvironment = withoutGitLocalEnvironment(process.env);
    try {
      for (const args of [
        ['init', '--quiet'],
        ['config', 'user.name', 'Hook Fixture'],
        ['config', 'user.email', 'hook@example.invalid'],
        ['commit', '--quiet', '--allow-empty', '-m', 'seed'],
      ]) {
        await execFileAsync('git', args, {
          cwd: scratch,
          env: cleanEnvironment,
        });
      }
      const { stdout: before } = await execFileAsync(
        'git',
        ['rev-parse', 'HEAD'],
        { cwd: scratch, env: cleanEnvironment }
      );
      const pollutedEnvironment = {
        ...cleanEnvironment,
        GIT_DIR: join(scratch, '.git'),
        GIT_WORK_TREE: scratch,
      };

      await execFileAsync(
        process.execPath,
        [
          vitestEntry,
          'run',
          'scripts/sync-game-assets.test.ts',
          'scripts/sync-synty-assets.test.ts',
        ],
        {
          cwd: repositoryRoot,
          env: pollutedEnvironment,
          timeout: 60_000,
        }
      );

      const { stdout: after } = await execFileAsync(
        'git',
        ['rev-parse', 'HEAD'],
        { cwd: scratch, env: cleanEnvironment }
      );
      expect(after.trim()).toBe(before.trim());
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 70_000);
});
