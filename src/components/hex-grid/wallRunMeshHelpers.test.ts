import { describe, expect, it } from 'vitest';
import {
  segmentKey,
  tileWallSegment,
  wallRunBoxTransform,
} from './wallRunMeshHelpers';

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

describe('tileWallSegment (W3: real Synty pieces tiled along a run, design.md/plan.md)', () => {
  it('an exact multiple of nominalPieceWidth tiles at exactly that width with no stretch', () => {
    const pieces = tileWallSegment(
      { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
      1.0
    );
    expect(pieces).toHaveLength(4);
    for (const piece of pieces) {
      expect(piece.pieceWidth).toBeCloseTo(1.0, 9);
      expect(piece.rotationY).toBeCloseTo(0, 9);
    }
    expect(pieces[0]!.position).toEqual({ x: 0.5, z: 0 });
    expect(pieces[3]!.position).toEqual({ x: 3.5, z: 0 });
  });

  it('a non-exact-multiple length evenly divides across the nearest whole count of pieces — no gap, no overhang past start/end', () => {
    // length 5, nominal width 2 -> round(5/2)=3 pieces, actual width 5/3.
    const pieces = tileWallSegment(
      { start: { x: 0, z: 0 }, end: { x: 5, z: 0 } },
      2.0
    );
    expect(pieces).toHaveLength(3);
    const expectedWidth = 5 / 3;
    for (const piece of pieces) {
      expect(piece.pieceWidth).toBeCloseTo(expectedWidth, 9);
    }
    // First tile starts exactly at the segment's own start, last tile ends
    // exactly at the segment's own end (centers +/- half a piece width).
    expect(pieces[0]!.position.x - expectedWidth / 2).toBeCloseTo(0, 9);
    expect(pieces[2]!.position.x + expectedWidth / 2).toBeCloseTo(5, 9);
  });

  it('a segment shorter than one nominal piece still gets exactly one (stretched or squeezed) piece spanning the whole segment', () => {
    const pieces = tileWallSegment(
      { start: { x: 0, z: 0 }, end: { x: 0.3, z: 0 } },
      1.0
    );
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.pieceWidth).toBeCloseTo(0.3, 9);
    expect(pieces[0]!.position).toEqual({ x: 0.15, z: 0 });
  });

  it('a degenerate (coincident start/end) segment produces zero pieces', () => {
    const pieces = tileWallSegment(
      { start: { x: 2, z: 2 }, end: { x: 2, z: 2 } },
      1.0
    );
    expect(pieces).toHaveLength(0);
  });

  it('a sub-epsilon (near-zero, not exactly zero) length also produces zero pieces — review finding (walls-r, PR #608): an exact-zero check alone would let a tiny nonzero pieceWidth through as a near-degenerate GlbInstance scale factor, risking NaN normals', () => {
    const pieces = tileWallSegment(
      { start: { x: 2, z: 2 }, end: { x: 2 + 1e-9, z: 2 } },
      1.0
    );
    expect(pieces).toHaveLength(0);
  });

  it('rotation matches the same atan2(-dz, dx) convention as wallRunBoxTransform', () => {
    const pieces = tileWallSegment(
      { start: { x: 0, z: 0 }, end: { x: 0, z: 4 } },
      1.0
    );
    for (const piece of pieces) {
      expect(piece.rotationY).toBeCloseTo(Math.atan2(-4, 0), 9);
    }
  });
});
