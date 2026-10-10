import { describe, expect, it } from 'vitest';
import {
  buildSpatialBackgroundField,
  sampleSpatialBackgroundField,
  type SpatialBackgroundArea,
} from './spatialBackgroundField';
const box = (
  id: string,
  background: number,
  x: number,
  z: number,
  w: number,
  h: number
): SpatialBackgroundArea => ({
  id,
  background,
  ring: [
    { x, z },
    { x: x + w, z },
    { x: x + w, z: z + h },
    { x, z: z + h },
  ],
});
describe('indexed spatial background field', () => {
  it('samples concave interiors, holes in sparse extents, closed edges and strict exterior', () => {
    const f = buildSpatialBackgroundField([
      {
        id: 'concave',
        background: 0.15,
        ring: [
          { x: 0, z: 0 },
          { x: 4, z: 0 },
          { x: 4, z: 1 },
          { x: 1, z: 1 },
          { x: 1, z: 4 },
          { x: 0, z: 4 },
        ],
      },
      box('island', 0.8, 8, 0, 1, 1),
    ]);
    expect(sampleSpatialBackgroundField(f, { x: 0.5, z: 3 })).toEqual({
      configured: true,
      background: Math.fround(0.15),
    });
    for (const p of [
      { x: 2, z: 2 },
      { x: 6, z: 0.5 },
      { x: -Number.EPSILON, z: 0.5 },
    ])
      expect(sampleSpatialBackgroundField(f, p)).toEqual({
        configured: false,
        background: 1,
      });
    expect(sampleSpatialBackgroundField(f, { x: 0, z: 2 }).configured).toBe(
      true
    );
    expect(
      sampleSpatialBackgroundField(f, { x: 8.5, z: 0.5 }).background
    ).toBeCloseTo(0.8);
  });
  it('shared-edge minimum and triangle seams are independent of order and repeated candidates', () => {
    const areas = [
      box('left', 0.2, -2, -2, 2, 4),
      box('right', 0.8, 0, -2, 2, 4),
    ];
    for (const ordered of [areas, [...areas].reverse(), [...areas, ...areas]]) {
      const f = buildSpatialBackgroundField(ordered);
      expect(
        sampleSpatialBackgroundField(f, { x: 0, z: 0 }).background
      ).toBeCloseTo(0.2);
      expect(
        sampleSpatialBackgroundField(f, { x: -1, z: 0 }).background
      ).toBeCloseTo(0.2);
      expect(
        sampleSpatialBackgroundField(f, { x: 1, z: 0 }).background
      ).toBeCloseTo(0.8);
      expect(
        sampleSpatialBackgroundField(f, { x: 0.00001, z: 0 }).background
      ).toBeCloseTo(0.8);
    }
  });
  it('empty fields are baseline and authored one remains configured', () => {
    const f = buildSpatialBackgroundField([]);
    expect(f.binHeads.every((n) => n === 0)).toBe(true);
    expect(sampleSpatialBackgroundField(f, { x: 0, z: 0 })).toEqual({
      configured: false,
      background: 1,
    });
    expect(
      sampleSpatialBackgroundField(
        buildSpatialBackgroundField([box('one', 1, 0, 0, 1, 1)]),
        { x: 0.5, z: 0.5 }
      )
    ).toEqual({ configured: true, background: 1 });
  });
  it('refuses broken, degenerate and nonfinite input instead of producing worldwide extents', () => {
    expect(() =>
      buildSpatialBackgroundField([box('bad', NaN, 0, 0, 1, 1)])
    ).toThrow();
    expect(() =>
      buildSpatialBackgroundField([box('bad', 0.1, 0, 0, 0, 1)])
    ).toThrow();
    expect(() =>
      buildSpatialBackgroundField([box('bad', 0.1, Infinity, 0, 1, 1)])
    ).toThrow();
  });
  it('indexes many small areas over a sparse max workspace without scanning every triangle per sample', () => {
    const f = buildSpatialBackgroundField(
      Array.from({ length: 256 }, (_, i) =>
        box(
          String(i),
          0.5,
          (i % 16) * 8 - 64,
          Math.floor(i / 16) * 8 - 64,
          1,
          1
        )
      )
    );
    expect(f.triangles.length / 8).toBe(512);
    expect(
      Math.max(...Array.from(f.binHeads).filter((_, i) => i % 2 === 1))
    ).toBeLessThan(10);
    expect(sampleSpatialBackgroundField(f, { x: 63, z: 63 })).toEqual({
      configured: false,
      background: 1,
    });
  });
});
