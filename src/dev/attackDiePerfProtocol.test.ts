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
    ).toThrow(/categories/);
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
      }).pass
    ).toBe(true);
  });
});
