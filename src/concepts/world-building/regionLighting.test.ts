// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AuthoringRegion, RegionResolution } from './authoringRegions';
import { projectRegionLighting } from './regionLighting';

const region = (id: string, background?: number): AuthoringRegion => ({
  id,
  labelId: `${id}-label`,
  boundary: { kind: 'automatic' },
  ...(background === undefined ? {} : { lighting: { background } }),
});
const polygon: Extract<RegionResolution, { status: 'resolved' }>['area'] = {
  kind: 'polygon',
  ring: [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 0, z: 2 },
  ],
};

describe('committed visual lighting projection', () => {
  it('matches configured resolved IDs only, including authored1, without mutating or acquiring extent', () => {
    const regions = [
      region('dim', 0.15),
      region('baseline', 1),
      region('absent'),
      region('missing', 0),
    ];
    const cells = { kind: 'hex-union' as const, cells: [{ q: 0, r: 0 }] };
    const resolutions: RegionResolution[] = [
      { id: 'absent', status: 'resolved', area: polygon },
      { id: 'baseline', status: 'resolved', area: cells },
      { id: 'dim', status: 'resolved', area: polygon },
      { id: 'other', status: 'resolved', area: polygon },
    ];
    const before = JSON.stringify({ regions, resolutions });
    expect(projectRegionLighting(regions, resolutions)).toEqual({
      areas: [
        { regionId: 'dim', background: 0.15, area: polygon },
        { regionId: 'baseline', background: 1, area: cells },
      ],
    });
    expect(JSON.stringify({ regions, resolutions })).toBe(before);
    expect(projectRegionLighting([], resolutions)).toEqual({ areas: [] });
  });
  it('unresolved projection retains persisted intent but has zero areas; restoration uses only current extent', () => {
    const regions = [region('dim', 0.15)];
    for (const reason of [
      'unbound',
      'seed-on-boundary',
      'unsupported-geometry',
      'uncertain-geometry',
      'open',
      'outside-bound-enclosure',
      'boundary-changed',
      'overlap',
      'duplicate-room-label',
      'empty-explicit',
    ] as const) {
      expect(
        projectRegionLighting(regions, [
          { id: 'dim', status: 'unresolved', reason },
        ])
      ).toEqual({ areas: [] });
      expect(regions[0].lighting).toEqual({ background: 0.15 });
    }
    expect(projectRegionLighting(regions, [])).toEqual({ areas: [] });
    const repaired: RegionResolution = {
      id: 'dim',
      status: 'resolved',
      area: polygon,
    };
    expect(projectRegionLighting(regions, [repaired]).areas[0].area).toBe(
      polygon
    );
  });
});
