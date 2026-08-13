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
  expect(() =>
    assertForcedFallback('shader', [
      {
        requestedResult: 1,
        renderer: 'svg',
        angularErrorDegrees: 0,
        exactTargetHeld: false,
        token: 2,
      },
    ])
  ).not.toThrow();
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
