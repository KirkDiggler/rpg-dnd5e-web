// @vitest-environment node
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import {
  assertForcedFallback,
  parseForcedFailure,
  runEvidenceSequence,
  validateServedBuild,
} from './evidenceProtocol';

describe('attack die evidence protocol', () => {
  it('advances fixed results, waits for healthy exact settlement, and captures both cameras', async () => {
    let token = 0;
    const api = {
      currentToken: () => token,
      setResult: vi.fn(() => {
        token += 1;
      }),
      setCamera: vi.fn(async () => undefined),
      verifyHeld: vi.fn(async (settlement) => settlement),
      settle: vi.fn(async (result: number) => ({
        requestedResult: result,
        renderer: '3d' as const,
        angularErrorDegrees: 0.1,
        exactTargetHeld: true,
        token: result,
      })),
      capture: vi.fn(async () => undefined),
    };
    const rows = await runEvidenceSequence(api, [1, 2]);
    expect(api.setResult.mock.calls.flat()).toEqual([1, 2]);
    expect(api.capture.mock.calls.map((call) => call[1])).toEqual([
      'top',
      'three-quarter',
      'top',
      'three-quarter',
    ]);
    expect(rows).toHaveLength(4);
  });
  it('fails on fallback, mismatch, missed hold, and timeout', async () => {
    const base = {
      currentToken: () => 0,
      setCamera: async () => undefined,
      verifyHeld: async (settlement: never) => settlement,
      setResult: vi.fn(),
      capture: vi.fn(),
    };
    await expect(
      runEvidenceSequence(
        {
          ...base,
          settle: async () => ({
            requestedResult: 2,
            renderer: '3d',
            angularErrorDegrees: 0,
            exactTargetHeld: true,
            token: 1,
          }),
        },
        [1]
      )
    ).rejects.toThrow(/mismatch/);
    await expect(
      runEvidenceSequence(
        {
          ...base,
          settle: async () => ({
            requestedResult: 1,
            renderer: 'svg',
            angularErrorDegrees: 0,
            exactTargetHeld: false,
            token: 1,
          }),
        },
        [1]
      )
    ).rejects.toThrow(/mismatch/);
  });
  it('verifies every manifest byte and rejects unlisted index references', async () => {
    const manifest = {
      schemaVersion: 1,
      kind: 'attack-die-web-build-manifest',
      webBuildSha256: 'a'.repeat(64),
      files: [
        { path: 'index.html', size: 32, sha256: '' },
        { path: 'assets/a.js', size: 2, sha256: '' },
      ],
    };
    const bytes = new Map([
      [
        'index.html',
        new TextEncoder().encode('<script src="/assets/a.js"></script>'),
      ],
      ['assets/a.js', new TextEncoder().encode('ok')],
    ]);
    await expect(
      validateServedBuild(manifest as never, async (path) => bytes.get(path)!)
    ).rejects.toThrow(/entry|digest/);
  });
});

it('validates every forced mode and requires fail-closed SVG observations', () => {
  for (const force of [
    'none',
    'load',
    'webgl',
    'shader',
    'context-loss',
    'hash',
    'invalid-result',
    'unmapped',
  ])
    expect(parseForcedFailure(force)).toBe(force);
  expect(() => parseForcedFailure('ignored')).toThrow(/unsupported/);
  expect(() =>
    assertForcedFallback('shader', [
      {
        requestedResult: 1,
        renderer: '3d',
        angularErrorDegrees: 0,
        exactTargetHeld: true,
        token: 2,
      },
    ])
  ).toThrow(/fail-closed/);
  const failed = {
    requestedResult: 1,
    renderer: 'svg' as const,
    angularErrorDegrees: 0,
    exactTargetHeld: false,
    token: 2,
    state: 'failed',
    failureReason: 'shader readiness failed',
    failureCode: 'shader-failure',
    semanticFallbackCount: 1,
  };
  expect(() => assertForcedFallback('shader', [failed, failed])).not.toThrow();
});

it('requires token advancement and repeated held observations before and during cameras', async () => {
  const { observeHeldSettlement } = await import('./evidenceProtocol');
  const events = [
    {
      requestedResult: 1,
      renderer: '3d' as const,
      angularErrorDegrees: 0.1,
      exactTargetHeld: true,
      token: 7,
    },
    {
      requestedResult: 1,
      renderer: '3d' as const,
      angularErrorDegrees: 0.1,
      exactTargetHeld: true,
      token: 7,
    },
  ];
  expect(
    await observeHeldSettlement(
      1,
      6,
      async () => events.shift(),
      async () => undefined
    )
  ).toMatchObject({ token: 7 });
  await expect(
    observeHeldSettlement(
      1,
      7,
      async () => ({
        requestedResult: 1,
        renderer: '3d',
        angularErrorDegrees: 0,
        exactTargetHeld: true,
        token: 7,
      }),
      async () => undefined
    )
  ).rejects.toThrow(/advance/);
  const one = [
    {
      requestedResult: 1,
      renderer: '3d' as const,
      angularErrorDegrees: 0,
      exactTargetHeld: true,
      token: 8,
    },
    undefined,
  ];
  await expect(
    observeHeldSettlement(
      1,
      7,
      async () => one.shift(),
      async () => undefined
    )
  ).rejects.toThrow(/repeated/);
});

it('validates manifest schema, canonical root, exact served identity, and unlisted references', async () => {
  const { createHash } = await import('node:crypto');
  const { encodeFrozenBuildRecords } = await import('./frozenBuildManifest');
  const bytes = new TextEncoder().encode('<script src="/missing.js"></script>');
  const file = {
    path: 'index.html',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const root = createHash('sha256')
    .update(encodeFrozenBuildRecords([file]))
    .digest('hex');
  await expect(
    validateServedBuild(
      {
        schemaVersion: 1,
        kind: 'attack-die-web-build-manifest',
        files: [file],
        webBuildSha256: root,
      } as never,
      async () => bytes
    )
  ).rejects.toThrow(/unlisted/);
  await expect(
    validateServedBuild(
      {
        schemaVersion: 1,
        kind: 'attack-die-web-build-manifest',
        files: [file],
        webBuildSha256: '0'.repeat(64),
      } as never,
      async () => bytes
    )
  ).rejects.toThrow(/root/);
});

it('switches camera before two same-token holds and capture', async () => {
  const order: string[] = [];
  let token = 10;
  const healthy = {
    requestedResult: 1,
    renderer: '3d' as const,
    angularErrorDegrees: 0,
    exactTargetHeld: true,
    token,
  };
  const api = {
    currentToken: () => 9,
    setResult: async () => undefined,
    settle: async () => healthy,
    setCamera: async (camera: string) => {
      order.push(`camera:${camera}`);
    },
    verifyHeld: async () => {
      order.push('hold');
      return { ...healthy, token };
    },
    capture: async () => {
      order.push('capture');
    },
  };
  await runEvidenceSequence(api as never, [1]);
  expect(order).toEqual([
    'camera:top',
    'hold',
    'hold',
    'capture',
    'camera:three-quarter',
    'hold',
    'hold',
    'capture',
  ]);
  token++;
  await expect(
    runEvidenceSequence(
      {
        ...api,
        currentToken: () => 9,
        settle: async () => ({ ...healthy, token: 10 }),
        verifyHeld: async () => ({ ...healthy, token }),
      } as never,
      [1]
    )
  ).rejects.toThrow(/camera hold|token/);
});

it('strictly validates manifest keys and unsafe POSIX paths and exact same manifest', async () => {
  const { createHash } = await import('node:crypto');
  const { encodeFrozenBuildRecords } = await import('./frozenBuildManifest');
  const { validateManifest, assertSameManifest } =
    await import('./evidenceProtocol');
  const make = (path = 'index.html') => {
    const file = {
      path,
      size: 0,
      sha256: createHash('sha256').update('').digest('hex'),
    };
    return {
      schemaVersion: 1,
      kind: 'attack-die-web-build-manifest',
      files: [file],
      webBuildSha256: createHash('sha256')
        .update(encodeFrozenBuildRecords([file]))
        .digest('hex'),
    };
  };
  for (const path of [
    '',
    '.',
    '..',
    '/x',
    'a//b',
    'a/',
    'a\\b',
    'a/../b',
    'a/./b',
    'a?b',
    'a#b',
    'a\u0000b',
    'a%2Fb',
    '%2e%2e/x',
    'a%5cb',
    'a%2eb',
  ])
    expect(() => validateManifest(make(path) as never), path).toThrow(
      /manifest entry/
    );
  expect(() => validateManifest({ ...make(), extra: true } as never)).toThrow(
    /manifest schema/
  );
  expect(() =>
    validateManifest({
      ...make(),
      files: [{ ...make().files[0], extra: true }],
    } as never)
  ).toThrow(/manifest entry/);
  expect(() => assertSameManifest(make() as never, make('other.html'))).toThrow(
    /served manifest mismatch/
  );
});

it('requires forced evidence to be repeated, exact, irreversible semantic SVG', async () => {
  const { assertForcedFallback } = await import('./evidenceProtocol');
  const good = {
    requestedResult: 7,
    renderer: 'svg' as const,
    angularErrorDegrees: 0,
    exactTargetHeld: false,
    token: 4,
    state: 'failed' as const,
    failureReason: 'shader readiness failed',
    failureCode: 'shader-failure',
    semanticFallbackCount: 1,
  };
  expect(() =>
    assertForcedFallback('shader', [good, good], { result: 7, token: 4 })
  ).not.toThrow();
  for (const observations of [
    [],
    [good],
    [good, { ...good, renderer: '3d' as const }],
    [good, { ...good, token: 5 }],
    [good, { ...good, requestedResult: 8 }],
    [good, { ...good, failureCode: 'provider-load' }],
    [good, { ...good, semanticFallbackCount: 2 }],
  ])
    expect(() =>
      assertForcedFallback('shader', observations as never, {
        result: 7,
        token: 4,
      })
    ).toThrow();
});

const execFileAsync = promisify(execFile);
const GIT_LOCAL_ENVIRONMENT = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

function isolatedGitEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  const environment = { ...process.env, ...overrides };
  for (const name of GIT_LOCAL_ENVIRONMENT) delete environment[name];
  return environment;
}

const serveFrozenScript = fileURLToPath(
  new URL('./serve-frozen.mjs', import.meta.url)
);
const buildFrozenScript = fileURLToPath(
  new URL('./build-frozen.sh', import.meta.url)
);

async function put(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function reservePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('failed to reserve TCP port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function waitForServer(
  child: ReturnType<typeof spawn>,
  expected: RegExp
) {
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`server startup timed out: ${stderr}`)),
      5_000
    );
    const inspect = () => {
      if (!expected.test(stdout)) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout?.on('data', inspect);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited ${code}: ${stderr}`));
    });
  });
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

async function makeFrozenBuildFixture(leak = '') {
  const root = await mkdtemp(join(tmpdir(), 'frozen-provider-'));
  const repo = join(root, 'web');
  const fakeBin = join(root, 'bin');
  const defaultTempRoot = join(root, 'default-temp');
  const observation = join(root, 'providers-withheld.txt');
  const signalMarker = join(root, 'signal-after-move.txt');
  const tempLocationMarker = join(root, 'provider-temp-location.txt');
  const manifest = join(root, 'manifest.json');
  await mkdir(repo, { recursive: true });
  await mkdir(defaultTempRoot);
  await put(
    join(repo, '.gitignore'),
    'public/models/synty/\npublic/models/custom-dice/\ndist/\n'
  );
  await put(join(repo, 'tracked.txt'), 'clean');
  const gitEnvironment = isolatedGitEnvironment();
  await execFileAsync('git', ['init', '--quiet'], {
    cwd: repo,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['config', 'user.name', 'Task Test'], {
    cwd: repo,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['config', 'user.email', 'task@example.test'], {
    cwd: repo,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['add', '.'], {
    cwd: repo,
    env: gitEnvironment,
  });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: repo,
    env: gitEnvironment,
  });
  await put(join(repo, 'public', 'models', 'synty', 'provider.glb'), 'synty');
  await put(
    join(repo, 'public', 'models', 'custom-dice', 'd20.glb'),
    'custom-dice'
  );
  const fakeNpm = join(fakeBin, 'npm');
  await put(
    fakeNpm,
    `#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
case "$*" in
  "run attack-die:build")
    if [ -e "$root/public/models/synty" ] || [ -e "$root/public/models/custom-dice" ]; then
      echo 'provider roots were visible to the frozen build' >&2
      exit 41
    fi
    printf 'both providers withheld' > "$FAKE_NPM_OBSERVATION"
    mkdir -p "$root/dist"
    printf '<!doctype html>' > "$root/dist/index.html"
    if [ -n "\${FAKE_BUILD_LEAK:-}" ]; then
      mkdir -p "$root/dist/$FAKE_BUILD_LEAK"
      printf 'private' > "$root/dist/$FAKE_BUILD_LEAK/leaked.glb"
    fi
    ;;
  "run attack-die:hash-build"*)
    for argument in "$@"; do output=$argument; done
    printf '{"files":[]}' > "$output"
    ;;
  *)
    echo "unexpected npm invocation: $*" >&2
    exit 42
    ;;
esac
`
  );
  await chmod(fakeNpm, 0o755);
  const fakeMv = join(fakeBin, 'mv');
  await put(
    fakeMv,
    `#!/bin/sh
set -eu
destination=
for argument in "$@"; do destination=$argument; done
/usr/bin/mv "$@"
if [ -n "\${TEMP_LOCATION_MARKER:-}" ] && [ ! -e "$TEMP_LOCATION_MARKER" ]; then
  dirname "$destination" > "$TEMP_LOCATION_MARKER"
fi
case "$destination" in
  */"\${SIGNAL_AFTER_MOVE:-not-requested}")
    if [ ! -e "$SIGNAL_MARKER" ]; then
      printf signal-sent > "$SIGNAL_MARKER"
      kill -TERM "$PPID"
    fi
    ;;
esac
`
  );
  await chmod(fakeMv, 0o755);
  return {
    leak,
    manifest,
    observation,
    repo,
    root,
    fakeBin,
    defaultTempRoot,
    signalMarker,
    tempLocationMarker,
  };
}

describe('frozen private provider boundary', () => {
  it('mounts both provider roots with traversal and symlink containment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'frozen-server-'));
    const dist = join(root, 'dist');
    const syntyRoot = join(root, 'synty');
    const customDiceRoot = join(root, 'custom-dice');
    const outside = join(root, 'outside.glb');
    const manifest = join(root, 'manifest.json');
    await put(join(dist, 'index.html'), '<!doctype html>');
    await put(join(syntyRoot, 'tray.glb'), 'synty-bytes');
    await put(join(customDiceRoot, 'd20.glb'), 'custom-dice-bytes');
    await put(
      join(customDiceRoot, 'dice-tray-presets.json'),
      '{"schemaVersion":1}'
    );
    await put(outside, 'outside-private-bytes');
    await symlink(outside, join(syntyRoot, 'link.glb'));
    await symlink(outside, join(customDiceRoot, 'link.glb'));
    await put(manifest, '{"files":[]}');
    const port = await reservePort();
    const child = spawn(process.execPath, [
      serveFrozenScript,
      '--dist',
      dist,
      '--synty-root',
      syntyRoot,
      '--custom-dice-root',
      customDiceRoot,
      '--build-manifest',
      manifest,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ]);

    try {
      await waitForServer(child, /frozen preview/);
      const base = `http://127.0.0.1:${port}`;
      await expect(
        fetch(`${base}/models/synty/tray.glb`).then((response) =>
          response.text()
        )
      ).resolves.toBe('synty-bytes');
      await expect(
        fetch(`${base}/models/custom-dice/d20.glb`).then((response) =>
          response.text()
        )
      ).resolves.toBe('custom-dice-bytes');
      await expect(
        fetch(`${base}/models/custom-dice/dice-tray-presets.json`).then(
          (response) => response.text()
        )
      ).resolves.toBe('{"schemaVersion":1}');

      for (const mount of ['synty', 'custom-dice']) {
        const traversal = await fetch(
          `${base}/models/${mount}/..%2Foutside.glb`
        );
        expect(traversal.status, mount).toBe(400);
        expect(await traversal.text(), mount).toMatch(/path traversal/);
        const linked = await fetch(`${base}/models/${mount}/link.glb`);
        expect(linked.status, mount).toBe(403);
        expect(await linked.text(), mount).toMatch(/symlink rejected/);
      }
    } finally {
      await stopServer(child);
      await rm(root, { force: true, recursive: true });
    }
  });

  it('withholds and restores both providers around a successful build', async () => {
    const fixture = await makeFrozenBuildFixture();
    try {
      await execFileAsync(
        'bash',
        [buildFrozenScript, '--out', fixture.manifest],
        {
          cwd: fixture.repo,
          env: isolatedGitEnvironment({
            FAKE_NPM_OBSERVATION: fixture.observation,
            PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
            VITE_ATTACK_DIE_WEB_COMMIT: 'a'.repeat(40),
          }),
        }
      );
      await expect(readFile(fixture.observation, 'utf8')).resolves.toBe(
        'both providers withheld'
      );
      await expect(
        readFile(
          join(fixture.repo, 'public', 'models', 'synty', 'provider.glb'),
          'utf8'
        )
      ).resolves.toBe('synty');
      await expect(
        readFile(
          join(fixture.repo, 'public', 'models', 'custom-dice', 'd20.glb'),
          'utf8'
        )
      ).resolves.toBe('custom-dice');
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it('creates the provider temp directory as a hidden repository-root sibling', async () => {
    const fixture = await makeFrozenBuildFixture();
    try {
      await execFileAsync(
        'bash',
        [buildFrozenScript, '--out', fixture.manifest],
        {
          cwd: fixture.repo,
          env: isolatedGitEnvironment({
            FAKE_NPM_OBSERVATION: fixture.observation,
            PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
            TEMP_LOCATION_MARKER: fixture.tempLocationMarker,
            TMPDIR: fixture.defaultTempRoot,
            VITE_ATTACK_DIE_WEB_COMMIT: 'a'.repeat(40),
          }),
        }
      );
      const providerTemp = (
        await readFile(fixture.tempLocationMarker, 'utf8')
      ).trim();
      expect(dirname(providerTemp)).toBe(fixture.repo);
      expect(basename(providerTemp)).toMatch(
        /^\.attack-die-frozen-providers\./
      );
      await expect(access(providerTemp)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readFile(fixture.observation, 'utf8')).resolves.toBe(
        'both providers withheld'
      );
      await expect(
        readFile(
          join(fixture.repo, 'public', 'models', 'synty', 'provider.glb'),
          'utf8'
        )
      ).resolves.toBe('synty');
      await expect(
        readFile(
          join(fixture.repo, 'public', 'models', 'custom-dice', 'd20.glb'),
          'utf8'
        )
      ).resolves.toBe('custom-dice');
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it.each(['synty', 'custom-dice'])(
    'restores both providers if TERM lands after moving %s',
    async (signalAfterMove) => {
      const fixture = await makeFrozenBuildFixture();
      try {
        await expect(
          execFileAsync(
            'bash',
            [buildFrozenScript, '--out', fixture.manifest],
            {
              cwd: fixture.repo,
              env: isolatedGitEnvironment({
                PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
                SIGNAL_AFTER_MOVE: signalAfterMove,
                SIGNAL_MARKER: fixture.signalMarker,
                VITE_ATTACK_DIE_WEB_COMMIT: 'a'.repeat(40),
              }),
            }
          )
        ).rejects.toMatchObject({ code: 143 });
        await expect(readFile(fixture.signalMarker, 'utf8')).resolves.toBe(
          'signal-sent'
        );
        await expect(
          readFile(
            join(fixture.repo, 'public', 'models', 'synty', 'provider.glb'),
            'utf8'
          )
        ).resolves.toBe('synty');
        await expect(
          readFile(
            join(fixture.repo, 'public', 'models', 'custom-dice', 'd20.glb'),
            'utf8'
          )
        ).resolves.toBe('custom-dice');
      } finally {
        await rm(fixture.root, { force: true, recursive: true });
      }
    }
  );

  it.each(['models/synty', 'models/custom-dice'])(
    'rejects a leaked %s tree and still restores both providers',
    async (leak) => {
      const fixture = await makeFrozenBuildFixture(leak);
      try {
        await expect(
          execFileAsync(
            'bash',
            [buildFrozenScript, '--out', fixture.manifest],
            {
              cwd: fixture.repo,
              env: isolatedGitEnvironment({
                FAKE_BUILD_LEAK: fixture.leak,
                FAKE_NPM_OBSERVATION: fixture.observation,
                PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
                VITE_ATTACK_DIE_WEB_COMMIT: 'a'.repeat(40),
              }),
            }
          )
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(
            `private provider entered dist: ${fixture.leak}`
          ),
        });
        await expect(
          readFile(
            join(fixture.repo, 'public', 'models', 'synty', 'provider.glb'),
            'utf8'
          )
        ).resolves.toBe('synty');
        await expect(
          readFile(
            join(fixture.repo, 'public', 'models', 'custom-dice', 'd20.glb'),
            'utf8'
          )
        ).resolves.toBe('custom-dice');
      } finally {
        await rm(fixture.root, { force: true, recursive: true });
      }
    }
  );
});
