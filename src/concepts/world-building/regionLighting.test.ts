// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RegionResolution } from './authoringRegions';
import { projectRegionLighting } from './regionLighting';
import type { RoomRegion } from './roomDraft';

const region = (id: string, intensity: number): RoomRegion => ({
  id,
  name: id,
  lighting: { intensity },
  cells: [],
});
const area = (q: number) => ({
  kind: 'hex-union' as const,
  cells: [{ q, r: 0 }],
});

describe('committed visual lighting projection', () => {
  // Every region carries an intensity (rpg-project#725); full intensity is the
  // bright baseline and draws no area, exactly as an unlit region did.
  it('projects resolved regions below full intensity only, without mutating', () => {
    const regions = [
      region('dim', 0.15),
      region('baseline', 1),
      region('dark', 0),
    ];
    const dim = area(0);
    const dark = area(2);
    const resolutions: RegionResolution[] = [
      { id: 'baseline', status: 'resolved', area: area(1) },
      { id: 'dark', status: 'resolved', area: dark },
      { id: 'dim', status: 'resolved', area: dim },
      { id: 'other', status: 'resolved', area: area(3) },
    ];
    const before = JSON.stringify({ regions, resolutions });
    expect(projectRegionLighting(regions, resolutions)).toEqual({
      areas: [
        { regionId: 'dim', background: 0.15, area: dim },
        { regionId: 'dark', background: 0, area: dark },
      ],
    });
    expect(JSON.stringify({ regions, resolutions })).toBe(before);
    expect(projectRegionLighting([], resolutions)).toEqual({ areas: [] });
  });

  it('an unpainted region keeps its intensity but draws nothing until painted', () => {
    const regions = [region('dim', 0.15)];
    expect(
      projectRegionLighting(regions, [
        { id: 'dim', status: 'unresolved', reason: 'empty' },
      ])
    ).toEqual({ areas: [] });
    expect(regions[0].lighting).toEqual({ intensity: 0.15 });
    expect(projectRegionLighting(regions, [])).toEqual({ areas: [] });
    const painted = area(0);
    expect(
      projectRegionLighting(regions, [
        { id: 'dim', status: 'resolved', area: painted },
      ]).areas[0].area
    ).toBe(painted);
  });
});
