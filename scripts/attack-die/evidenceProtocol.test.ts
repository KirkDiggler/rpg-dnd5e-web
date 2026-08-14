// @vitest-environment node
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
