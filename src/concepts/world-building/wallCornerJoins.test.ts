import { describe, expect, it } from 'vitest';
import type { StructuralWall } from './structuralWalls';
import { deriveWallCornerFits } from './wallCornerFits';
import {
  applyWallCornerJoin,
  snapPerpendicularCorner,
} from './wallCornerJoins';
function wall(
  id: string,
  start: { x: number; z: number },
  end: { x: number; z: number }
): StructuralWall {
  return {
    id,
    label: id,
    line: { start, end },
    openings: [],
    appearance: { assetRef: 'fit', height: 3, thickness: 0.4, elevation: 0 },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: {
        width: Math.hypot(end.x - start.x, end.z - start.z),
        depth: 0.25,
        offsetX: 0,
        offsetZ: 0,
      },
    },
  };
}
const shape = () => ({ width: 4, height: 3, depth: 0.4 });
describe('two-wall corner operations', () => {
  it('fits the same physical corner with either wall direction and either turn', () => {
    for (const turn of [-1, 1])
      for (const reverseA of [false, true])
        for (const reverseB of [false, true]) {
          const a = wall('a', { x: -4, z: 0 }, { x: 0, z: 0 }),
            b = wall('b', { x: 0, z: 0 }, { x: 0, z: 4 * turn });
          if (reverseA) a.line = { start: a.line.end, end: a.line.start };
          if (reverseB) b.line = { start: b.line.end, end: b.line.start };
          const fits = deriveWallCornerFits([a, b], shape).fits;
          const caps = (w: StructuralWall, slope: number): string[] => {
            const length = Math.hypot(
              w.line.end.x - w.line.start.x,
              w.line.end.z - w.line.start.z
            );
            const dx = (w.line.end.x - w.line.start.x) / length,
              dz = (w.line.end.z - w.line.start.z) / length;
            return [-0.2, 0.2]
              .map((z) =>
                [dx * slope * z - dz * z, dz * slope * z + dx * z]
                  .map((n) => Number(n.toFixed(10)))
                  .join(',')
              )
              .sort();
          };
          expect(caps(a, fits.get('a')![reverseA ? 'start' : 'end']!)).toEqual(
            caps(b, fits.get('b')![reverseB ? 'end' : 'start']!)
          );
        }
  });
  it('copies the perpendicular intersection to both ends without changing bearings', () => {
    const a = wall('a', { x: 0.1, z: 4 }, { x: 0.1, z: 0.12 }),
      b = wall('b', { x: 0.18, z: 0.05 }, { x: 5, z: 0.05 });
    const before = structuredClone([a, b]);
    const candidate = snapPerpendicularCorner({
      line: a.line,
      endpoint: 'end',
      point: { x: 0.15, z: 0.1 },
      walls: [a, b],
      excludedWallId: 'a',
      radius: 0.2,
    })!;
    expect(candidate.join).toEqual({
      wallId: 'b',
      endpoint: 'start',
      point: { x: 0.1, z: 0.05 },
    });
    const source = { ...a, line: { ...a.line, end: candidate.join.point } };
    const result = applyWallCornerJoin(
      [source, b],
      source.line,
      candidate.join,
      'a'
    );
    expect(result[0].line.end).toEqual(result[1].line.start);
    expect(result[0].line.start).toEqual(a.line.start);
    expect(result[1].line.end).toEqual(b.line.end);
    expect([a, b]).toEqual(before);
    expect(
      snapPerpendicularCorner({
        line: a.line,
        endpoint: 'end',
        point: { x: 2, z: 2 },
        walls: [b],
        radius: 0.2,
      })
    ).toBeUndefined();
  });
  it('refuses target opening protection and already-connected third endpoints', () => {
    const a = wall('a', { x: 0, z: 3 }, { x: 0, z: 0.1 }),
      b = wall('b', { x: -0.1, z: 0 }, { x: 4, z: 0 });
    const input = {
      line: a.line,
      endpoint: 'end' as const,
      point: { x: 0, z: 0.1 },
      walls: [a, b],
      excludedWallId: 'a',
      radius: 0.2,
    };
    const blocked = {
      ...b,
      openings: [{ id: 'doorway', position: 0.06, width: 0.1 }],
    };
    expect(() =>
      snapPerpendicularCorner({ ...input, walls: [a, blocked] })
    ).toThrow(/opening/);
    expect(() =>
      snapPerpendicularCorner({
        ...input,
        walls: [a, b, wall('third', b.line.start, { x: -2, z: 1 })],
      })
    ).toThrow(/already joins/);
    expect(() =>
      applyWallCornerJoin(
        [a, b],
        a.line,
        { wallId: 'missing', endpoint: 'start', point: a.line.end },
        'a'
      )
    ).toThrow(/no longer/);
  });
  it('derives matching cap slopes without changing topology; unsupported joins remain explicit', () => {
    const a = wall('a', { x: -4, z: 0 }, { x: 0, z: 0 }),
      b = wall('b', { x: 0, z: 0 }, { x: 0, z: 4 });
    const before = structuredClone([a, b]);
    const result = deriveWallCornerFits([a, b], shape);
    expect(result.fits.get('a')?.end).toBe(-1);
    expect(result.fits.get('b')?.start).toBe(1);
    expect(deriveWallCornerFits([b, a], shape).fits.get('a')).toEqual(
      result.fits.get('a')
    );
    expect(deriveWallCornerFits([a, b], () => undefined).fits.size).toBe(0);
    expect(
      deriveWallCornerFits(
        [a, { ...b, appearance: { ...b.appearance, thickness: 0.5 } }],
        shape
      ).reasons.get('a')
    ).toMatch(/matching/);
    expect(
      deriveWallCornerFits(
        [a, b, wall('third', { x: 0, z: 0 }, { x: 4, z: 0 })],
        shape
      ).fits.size
    ).toBe(0);
    expect([a, b]).toEqual(before);
  });
});
