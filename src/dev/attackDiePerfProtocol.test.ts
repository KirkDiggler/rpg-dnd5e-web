import { describe, expect, it } from 'vitest';
import {
  evaluateAttackDieRun,
  parseAttackDieProfiles,
} from './attackDiePerfProtocol';

describe('attack die performance protocol', () => {
  it('parses exactly the required profile artifact and human viewport text', () => {
    const parsed = parseAttackDieProfiles({
      profiles: [
        {
          category: 'desktop-chromium',
          status: 'available',
          clientOrBrowser: 'Chrome',
          os: 'Linux',
          hardwareGpu: 'GPU',
          powerState: 'AC',
          viewport: '1280x720',
          dpr: 1,
        },
        {
          category: 'desktop-discord-activity',
          status: 'available',
          clientOrBrowser: 'Discord',
          os: 'Linux',
          hardwareGpu: 'GPU',
          powerState: 'AC',
          viewport: '1024 x 768',
          dpr: 2,
        },
        {
          category: 'mobile-low-gpu',
          status: 'blocked',
          reason: 'No human profile available',
        },
      ],
    });
    expect(
      parsed.profiles[0].status === 'available' &&
        parsed.profiles[0].viewportPixels
    ).toEqual({ width: 1280, height: 720 });
    expect(parsed.blocked).toEqual([
      'mobile-low-gpu: No human profile available',
    ]);
  });
  it('rejects missing, duplicate, invented, and malformed profiles', () => {
    expect(() => parseAttackDieProfiles({ profiles: [] })).toThrow(
      /categories/
    );
    expect(() =>
      parseAttackDieProfiles({
        profiles: [
          { category: 'desktop-chromium', status: 'blocked', reason: 'x' },
          { category: 'desktop-chromium', status: 'blocked', reason: 'x' },
          { category: 'mobile-low-gpu', status: 'blocked', reason: 'x' },
        ],
      })
    ).toThrow(/categories|must be available/);
  });
  it('cannot pass when any nominal 3D sample fell back or leaked resources/contexts', () => {
    const samples = [
      {
        mode: '3d' as const,
        healthy3d: false,
        p95FrameTimeMs: 10,
        longTasks: [],
      },
    ];
    expect(
      evaluateAttackDieRun({
        samples,
        svgP95: 10,
        candidateP95: 10,
        svgPostUnmountP95: 10,
        candidatePostUnmountP95: 10,
        postUnmountCounters: {
          contextsActive: 1,
          geometries: 1,
          textures: 0,
          programs: 0,
        },
        release: {
          releaseKnown: false,
          resourcesReleased: false,
          releaseBasis: null,
        },
      }).pass
    ).toBe(false);
    expect(
      evaluateAttackDieRun({
        samples: [{ ...samples[0], healthy3d: true }],
        svgP95: 10,
        candidateP95: 10,
        svgPostUnmountP95: 10,
        candidatePostUnmountP95: 10,
        postUnmountCounters: {
          contextsActive: 0,
          geometries: 0,
          textures: 0,
          programs: 0,
        },
        release: {
          releaseKnown: true,
          resourcesReleased: true,
          releaseBasis: 'owned-canvas-webglcontextlost',
        },
      }).pass
    ).toBe(true);
    expect(
      evaluateAttackDieRun({
        samples: [{ ...samples[0], healthy3d: true }],
        svgP95: 10,
        candidateP95: 10,
        svgPostUnmountP95: 10,
        candidatePostUnmountP95: 10,
        postUnmountCounters: {
          contextsActive: null,
          geometries: null,
          textures: null,
          programs: null,
        },
        release: {
          releaseKnown: false,
          resourcesReleased: false,
          releaseBasis: null,
        },
      }).pass
    ).toBe(false);
  });
});

describe('fix round 2 strictness and exit', () => {
  it('allows blocked only for mobile-low-gpu', () => {
    const profiles = [
      { category: 'desktop-chromium', status: 'blocked', reason: 'missing' },
      {
        category: 'desktop-discord-activity',
        status: 'available',
        clientOrBrowser: 'Discord',
        os: 'Linux',
        hardwareGpu: 'GPU',
        powerState: 'AC',
        viewport: '800x600',
        dpr: 1,
      },
      { category: 'mobile-low-gpu', status: 'blocked', reason: 'missing' },
    ];
    expect(() => parseAttackDieProfiles({ profiles })).toThrow(
      /desktop.*available/
    );
  });
  it('returns failed process status unless all available profile outcomes pass', async () => {
    const { performanceExitCode } = await import('./attackDiePerfProtocol');
    expect(
      performanceExitCode([{ status: 'pass' }, { status: 'failed' }])
    ).toBe(1);
    expect(performanceExitCode([{ status: 'pass' }, { status: 'pass' }])).toBe(
      0
    );
    expect(performanceExitCode([])).toBe(1);
  });
});

it('never infers released renderer resources from inactive context IDs', () => {
  const base = {
    samples: [{ mode: '3d' as const, healthy3d: true, longTasks: [] }],
    svgP95: 10,
    candidateP95: 10,
    svgPostUnmountP95: 10,
    candidatePostUnmountP95: 10,
  };
  for (const counters of [
    { contextsActive: 0, geometries: 1, textures: 0, programs: 0 },
    { contextsActive: 0, geometries: null, textures: null, programs: null },
    { contextsActive: 1, geometries: 0, textures: 0, programs: 0 },
  ])
    expect(
      evaluateAttackDieRun({
        ...base,
        postUnmountCounters: counters,
        release: {
          releaseKnown: false,
          resourcesReleased: false,
          releaseBasis: null,
        },
      }).pass
    ).toBe(false);
  expect(
    evaluateAttackDieRun({
      ...base,
      postUnmountCounters: {
        contextsActive: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
      },
      release: {
        releaseKnown: true,
        resourcesReleased: true,
        releaseBasis: 'owned-canvas-webglcontextlost',
      },
    }).pass
  ).toBe(true);
});

it('requires owned-canvas release request followed by observed context loss', async () => {
  const { applyAttackDieRendererObservation, evaluateAttackDieRelease } =
    await import('./attackDiePerfProtocol');
  const base = {
    contextsCreated: 0,
    contextsLost: 0,
    contextsDisposed: 0,
    activeContextIds: [],
    rendererInfo: {
      calls: null,
      triangles: null,
      geometries: null,
      textures: null,
      programs: null,
    },
    contextLifecycles: {},
  };
  const info = {
    contextId: 9,
    calls: null,
    triangles: null,
    geometries: null,
    textures: null,
    programs: null,
  };
  let value = applyAttackDieRendererObservation(base, {
    ...info,
    lifecycle: 'created',
  } as never);
  expect(evaluateAttackDieRelease(value.contextLifecycles)).toMatchObject({
    releaseKnown: false,
    resourcesReleased: false,
  });
  value = applyAttackDieRendererObservation(value, {
    ...info,
    lifecycle: 'release-requested',
  } as never);
  expect(
    evaluateAttackDieRelease(value.contextLifecycles).resourcesReleased
  ).toBe(false);
  value = applyAttackDieRendererObservation(value, {
    ...info,
    lifecycle: 'release-observed',
  } as never);
  expect(evaluateAttackDieRelease(value.contextLifecycles)).toEqual({
    releaseKnown: true,
    resourcesReleased: true,
    releaseBasis: 'owned-canvas-webglcontextlost',
  });
  for (const lifecycle of ['release-timeout', 'unexpected-loss'] as const) {
    const failed = applyAttackDieRendererObservation(value, {
      ...info,
      contextId: 10,
      lifecycle: 'created',
    } as never);
    const terminal = applyAttackDieRendererObservation(failed, {
      ...info,
      contextId: 10,
      lifecycle,
    } as never);
    expect(
      evaluateAttackDieRelease(terminal.contextLifecycles).resourcesReleased
    ).toBe(false);
  }
  expect(
    applyAttackDieRendererObservation(value, {
      ...info,
      lifecycle: 'release-observed',
    } as never).contextLifecycles
  ).toEqual(value.contextLifecycles);
});
