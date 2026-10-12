// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { snapWallEndpoint } from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';
import {
  constrainWallPoint,
  pointOnWallAxis,
  wallAngleReference,
} from './wallAngleConstraint';

function wall(id: string, start: WorldPoint, end: WorldPoint): StructuralWall {
  return {
    id,
    label: id,
    line: { start, end },
    openings: [],
    appearance: { assetRef: 'test', height: 3, thickness: 0.3, elevation: 0 },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: {
        width: Math.hypot(end.x - start.x, end.z - start.z),
        depth: 0.3,
        offsetX: 0,
        offsetZ: 0,
      },
    },
  };
}
const origin = { x: 0, z: 0 };
const guide = wall('a-guide', { x: -3, z: -4 }, origin);

describe('explicit right-angle authoring', () => {
  it('uses exact endpoint incidence, not proximity, with world axes as the free-start fallback', () => {
    const reference = wallAngleReference({
      anchor: { x: 0.00001, z: 0 },
      walls: [guide],
    });
    expect(reference.kind).toBe('world');
    expect(
      wallAngleReference({
        anchor: origin,
        walls: [guide],
        excludedWallId: guide.id,
      }).kind
    ).toBe('world');
    const anchor = { x: 0.123456789012345, z: 0.27 };
    const point = { x: 6.135791357913579, z: 0.31 };
    expect(constrainWallPoint({ anchor, point, reference }).point).toEqual({
      x: point.x,
      z: anchor.z,
    });
    expect(
      constrainWallPoint({ anchor, point: { x: 0.2, z: -8 }, reference }).point
    ).toEqual({ x: anchor.x, z: -8 });
  });

  it('projects parallel/perpendicular to a rotated joined wall in either direction', () => {
    const reference = wallAngleReference({ anchor: origin, walls: [guide] });
    expect(reference).toMatchObject({
      kind: 'wall',
      wallId: guide.id,
      direction: { x: 3, z: 4 },
    });
    const result = constrainWallPoint({
      anchor: origin,
      point: { x: -4.2, z: 3.1 },
      reference,
    });
    expect(result.direction).toEqual({ x: -4, z: 3 });
    expect(result.point.x).toBeCloseTo(-4.176, 14);
    expect(result.point.z).toBeCloseTo(3.132, 14);
    expect(result.feedback).toContain('perpendicular');
    expect(
      pointOnWallAxis({
        anchor: origin,
        point: result.point,
        direction: result.direction,
      })
    ).toBe(true);
    expect(
      constrainWallPoint({ anchor: origin, point: { x: 4, z: -3 }, reference })
        .point
    ).toEqual({ x: 4, z: -3 });
    expect(
      constrainWallPoint({ anchor: origin, point: { x: 6, z: 9 }, reference })
        .feedback
    ).toContain('parallel');
  });

  it('keeps one deterministic basis for equivalent incident axes and refuses conflicting branches', () => {
    const other = wall('b-guide', origin, { x: 4, z: -3 });
    const before = structuredClone([guide, other]);
    const a = wallAngleReference({ anchor: origin, walls: [guide, other] });
    expect(
      wallAngleReference({ anchor: origin, walls: [other, guide] })
    ).toEqual(a);
    expect([guide, other]).toEqual(before);
    const ambiguous = wallAngleReference({
      anchor: origin,
      walls: [guide, wall('fork', origin, { x: 1, z: 1 })],
    });
    expect(ambiguous.kind).toBe('ambiguous');
    expect(() =>
      constrainWallPoint({
        anchor: origin,
        point: { x: 3, z: 2 },
        reference: ambiguous,
      })
    ).toThrow(/conflicting/);
  });

  it('accepts projection roundoff but rejects genuine off-axis endpoints, with exact cardinal equality', () => {
    const anchor = { x: 10.13, z: -3.27 };
    const direction = { x: -4, z: 3 };
    const projected = constrainWallPoint({
      anchor,
      point: { x: 6.1, z: 0.2 },
      reference: {
        kind: 'wall',
        wallId: 'g',
        label: 'guide',
        direction: { x: 3, z: 4 },
      },
    });
    expect(pointOnWallAxis({ anchor, point: projected.point, direction })).toBe(
      true
    );
    expect(
      pointOnWallAxis({
        anchor,
        point: { ...projected.point, z: projected.point.z + 1e-8 },
        direction,
      })
    ).toBe(false);
    expect(
      pointOnWallAxis({
        anchor: origin,
        point: { x: 5, z: Number.EPSILON },
        direction: { x: 1, z: 0 },
      })
    ).toBe(false);
    expect(pointOnWallAxis({ anchor: origin, point: origin, direction })).toBe(
      false
    );
  });

  it('filters incompatible nearer snaps before choosing a compatible endpoint', () => {
    const near = wall('near', { x: 4, z: 1e-6 }, { x: 4, z: 8 });
    const compatible = wall('compatible', { x: 4.01, z: 0 }, { x: 4.01, z: 9 });
    const result = snapWallEndpoint({
      point: { x: 4, z: 0 },
      enabled: true,
      walls: [near, compatible],
      radius: 0.1,
      accept: (point) =>
        pointOnWallAxis({ anchor: origin, point, direction: { x: 1, z: 0 } }),
    });
    expect(result.target?.wallId).toBe('compatible');
    expect(result.point).toEqual(compatible.line.start);
  });

  it('refuses nonfinite points and degenerate references', () => {
    expect(() =>
      constrainWallPoint({
        anchor: origin,
        point: { x: Infinity, z: 0 },
        reference: { kind: 'world', direction: { x: 1, z: 0 } },
      })
    ).toThrow(/finite/);
    expect(() =>
      wallAngleReference({
        anchor: origin,
        walls: [wall('zero', origin, origin)],
      })
    ).toThrow(/nonzero/);
  });
});
