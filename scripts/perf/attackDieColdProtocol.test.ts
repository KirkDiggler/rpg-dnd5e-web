// @vitest-environment node
import { expect, it } from 'vitest';
import { runColdAttackDieSequence } from './attackDieColdProtocol';
it('orders idle SVG preload token then healthy token 2', async () => {
  let step = 0,
    now = 0;
  const states = [
    { provider: { status: 'idle' } },
    {
      provider: { status: 'ready', durationMs: 12 },
      healthy3d: false,
      telemetry: { renderer: 'svg', presentationToken: 1 },
    },
    {
      provider: { status: 'ready', durationMs: 12 },
      healthy3d: true,
      telemetry: { renderer: '3d', presentationToken: 2, requestedResult: 20 },
    },
  ];
  const calls: unknown[] = [];
  const d = {
    readCounters: () => states[step],
    runSample: (x: {
      mode: '3d';
      result: number;
      reducedMotion: false;
      token: number;
    }) => calls.push(x),
    unmountDie: () => calls.push('unmount'),
  };
  const result = await runColdAttackDieSequence(
    d,
    async () => {
      step++;
      now += 10;
    },
    () => now
  );
  expect(calls).toEqual([
    expect.objectContaining({ token: 1 }),
    'unmount',
    expect.objectContaining({ token: 2 }),
  ]);
  expect(result).toMatchObject({
    providerPreloadMs: 12,
    preloadTokenRenderer: 'svg',
    firstHealthy3DRenderMs: 10,
    coldEndToEndMs: 20,
  });
});
it('rejects contamination, preload failure, and token 2 fallback', async () => {
  await expect(
    runColdAttackDieSequence(
      {
        readCounters: () => ({ provider: { status: 'ready' } }),
        runSample() {},
        unmountDie() {},
      },
      async () => {}
    )
  ).rejects.toThrow(/contaminated/);
});
