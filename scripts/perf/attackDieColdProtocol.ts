interface ColdCounters {
  provider: { status: string; durationMs?: number };
  healthy3d?: boolean;
  telemetry?: {
    renderer?: string;
    presentationToken?: number;
    requestedResult?: number;
  };
}
export async function runColdAttackDieSequence(
  driver: {
    runSample(x: {
      mode: '3d';
      result: number;
      reducedMotion: false;
      token: number;
    }): void | Promise<void>;
    unmountDie(): void | Promise<void>;
    readCounters(): ColdCounters | Promise<ColdCounters>;
  },
  wait: () => Promise<void>,
  now: () => number = () => performance.now()
) {
  const initial = await driver.readCounters();
  if (initial.provider.status !== 'idle')
    throw Error('cold claim contaminated: provider not idle');
  const start = now();
  await driver.runSample({
    mode: '3d',
    result: 20,
    reducedMotion: false,
    token: 1,
  });
  await wait();
  const preload = await driver.readCounters();
  if (preload.provider.status !== 'ready')
    throw Error(`provider preload ${preload.provider.status}`);
  if (preload.healthy3d || preload.telemetry?.renderer === '3d')
    throw Error('preload token must remain SVG');
  await driver.unmountDie();
  const healthyStart = now();
  await driver.runSample({
    mode: '3d',
    result: 20,
    reducedMotion: false,
    token: 2,
  });
  await wait();
  const healthy = await driver.readCounters();
  if (
    !healthy.healthy3d ||
    healthy.telemetry?.presentationToken !== 2 ||
    healthy.telemetry?.requestedResult !== 20
  )
    throw Error('token 2 failed healthy 3D settlement');
  return {
    providerPreloadMs: preload.provider.durationMs,
    preloadTokenRenderer: 'svg' as const,
    firstHealthy3DRenderMs: now() - healthyStart,
    coldEndToEndMs: now() - start,
  };
}
