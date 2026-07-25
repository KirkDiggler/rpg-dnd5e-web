import { describe, expect, it } from 'vitest';
import { segmentKey, wallRunBoxTransform } from './wallRunMeshHelpers';

describe('wallRunBoxTransform', () => {
  it('computes midpoint, length, and rotation matching the hexEdgeBetween atan2(-dz, dx) convention', () => {
    const t = wallRunBoxTransform({
      start: { x: 0, z: 0 },
      end: { x: 4, z: 0 },
    });
    expect(t.position).toEqual({ x: 2, z: 0 });
    expect(t.length).toBeCloseTo(4);
    expect(t.rotationY).toBeCloseTo(0);
  });

  it('returns length 0 (no NaN) for a degenerate coincident segment', () => {
    const t = wallRunBoxTransform({
      start: { x: 3, z: 3 },
      end: { x: 3, z: 3 },
    });
    expect(t.length).toBe(0);
    expect(t.rotationY).toBe(0);
    expect(Number.isNaN(t.rotationY)).toBe(false);
  });

  it('rotates to face a perpendicular (z-axis) run', () => {
    const t = wallRunBoxTransform({
      start: { x: 0, z: 0 },
      end: { x: 0, z: 4 },
    });
    expect(t.rotationY).toBeCloseTo(Math.atan2(-4, 0));
  });
});

describe('segmentKey', () => {
  it('is stable for the same segment and distinct for different ones', () => {
    const a = { start: { x: 0, z: 0 }, end: { x: 1, z: 1 } };
    const b = { start: { x: 0, z: 0 }, end: { x: 1, z: 1 } };
    const c = { start: { x: 2, z: 2 }, end: { x: 3, z: 3 } };
    expect(segmentKey(a)).toBe(segmentKey(b));
    expect(segmentKey(a)).not.toBe(segmentKey(c));
  });
});
