import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import {
  buildSpatialBackgroundField,
  sampleSpatialBackgroundField,
} from '@/rendering/spatialBackgroundField';
import { describe, expect, it } from 'vitest';
import type { RegionLightingProjection } from './regionLighting';
import { toSpatialBackgroundAreas } from './regionLightingGeometry';
describe('region lighting geometry adapter', () => {
  it('passes polygon coordinates through and fans each hex into six exact workspace triangles', () => {
    const ring = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 4 },
    ];
    const polygon: RegionLightingProjection = {
      areas: [
        { regionId: 'room', background: 0.15, area: { kind: 'polygon', ring } },
      ],
    };
    expect(toSpatialBackgroundAreas(polygon)[0]!.ring).toBe(ring);
    const cells = [
      { q: 0, r: 0 },
      { q: 4, r: 0 },
    ];
    const areas = toSpatialBackgroundAreas({
      areas: [
        {
          regionId: 'forest',
          background: 0.2,
          area: { kind: 'hex-union', cells },
        },
      ],
    });
    expect(areas).toHaveLength(12);
    const c = cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE),
      corners = hexCorners(c, HEX_SIZE);
    expect(areas[0]!.ring).toEqual([c, corners[0], corners[1]]);
    const f = buildSpatialBackgroundField(areas);
    expect(f.triangles.length / 8).toBe(12);
    expect(sampleSpatialBackgroundField(f, c).background).toBeCloseTo(0.2);
    // Float32 corners are the GPU representation, not exact source arithmetic.
    const p = { x: f.triangles[2]!, z: f.triangles[3]! };
    expect(sampleSpatialBackgroundField(f, p).configured).toBe(true);
    expect(
      sampleSpatialBackgroundField(f, { x: 2 * Math.sqrt(3), z: 0 }).configured
    ).toBe(false);
    expect(sampleSpatialBackgroundField(f, { x: 0, z: 1.001 }).configured).toBe(
      false
    );
  });
  it('has no cells or rectangle fallback for empty or retired projection', () => {
    expect(toSpatialBackgroundAreas({ areas: [] })).toEqual([]);
    expect(
      toSpatialBackgroundAreas({
        areas: [
          {
            regionId: 'empty',
            background: 1,
            area: { kind: 'hex-union', cells: [] },
          },
        ],
      })
    ).toEqual([]);
  });
});
