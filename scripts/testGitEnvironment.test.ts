// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withoutGitLocalEnvironment } from './testGitEnvironment';

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
});
