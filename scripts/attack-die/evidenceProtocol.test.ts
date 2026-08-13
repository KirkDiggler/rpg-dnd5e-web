// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runEvidenceSequence, validateServedBuild } from './evidenceProtocol';

describe('attack die evidence protocol', () => {
  it('advances fixed results, waits for healthy exact settlement, and captures both cameras', async () => {
    const api = {
      setResult: vi.fn(),
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
    const base = { setResult: vi.fn(), capture: vi.fn() };
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
    ).rejects.toThrow(/healthy 3D/);
  });
  it('verifies every manifest byte and rejects unlisted index references', async () => {
    const manifest = {
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
    ).rejects.toThrow(/digest/);
  });
});
