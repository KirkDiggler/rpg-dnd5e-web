import { describe, expect, it } from 'vitest';
import {
  facingCorrectedRotationY,
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

  describe('pivotRatio (round-2 W3/W4 regression: "gaps between tiled segments")', () => {
    // Direct regression for the root cause: RUN_WALL_VARIANT's ("plain"
    // Wall_Half) local origin measured off its own GLB sits near its LEFT
    // bbox edge (min.x=-0.1174, rawWidth=2.672), NOT at its geometric
    // center — pivotRatio = rawMinX/rawWidth = -0.1174/2.672 ≈ -0.04393.
    // The pre-fix code always assumed pivotRatio=-0.5 (center), silently
    // shifting the whole run off its own segment.start/end line.
    const MEASURED_PIVOT_RATIO = -0.1174 / 2.672;

    it('default pivotRatio (-0.5, a centered piece) is unchanged from every pre-fix call site', () => {
      const withDefault = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0
      );
      const withExplicitCenter = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        -0.5
      );
      expect(withExplicitCenter).toEqual(withDefault);
    });

    it('a non-centered pivotRatio still tiles with zero gap/overlap BETWEEN adjacent pieces — the shift is only at the run boundary, not mid-run', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO
      );
      expect(pieces).toHaveLength(4);
      // Every piece still gets the exact same pieceWidth (no per-tile
      // stretch/squeeze from the pivot correction).
      for (const piece of pieces) {
        expect(piece.pieceWidth).toBeCloseTo(1.0, 9);
      }
      // Consecutive origins are still exactly pieceWidth apart (the pivot
      // shift is a CONSTANT offset applied uniformly to every tile, so
      // relative spacing between tiles is untouched).
      for (let i = 1; i < pieces.length; i++) {
        expect(pieces[i]!.position.x - pieces[i - 1]!.position.x).toBeCloseTo(
          1.0,
          9
        );
      }
    });

    it('a non-centered pivotRatio moves the FIRST tile’s actual (bbox-corrected) start to exactly the segment’s own start — the fix for the whole-run boundary shift', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO
      );
      // The piece's actual scaled bbox min (in the run's own direction)
      // sits at `position.x + rawMinX * (pieceWidth/rawWidth)`. Simulate
      // that directly with the measured raw numbers rather than assuming
      // GlbInstance's own scale math — this is the same relationship
      // `WallVariant.rawMinX`'s doc comment derives.
      const rawWidth = 2.672;
      const rawMinX = -0.1174;
      const tsx = pieces[0]!.pieceWidth / rawWidth;
      const actualBboxMinX = pieces[0]!.position.x + rawMinX * tsx;
      expect(actualBboxMinX).toBeCloseTo(0, 3); // segment.start.x = 0

      const lastTsx = pieces[3]!.pieceWidth / rawWidth;
      const actualBboxMaxX =
        pieces[3]!.position.x + (rawMinX + rawWidth) * lastTsx;
      expect(actualBboxMaxX).toBeCloseTo(4, 3); // segment.end.x = 4
    });

    it('WITHOUT the fix (pivotRatio=-0.5 on a piece whose true pivot is off-center), the run visibly overshoots its segment — proves the regression test above is not vacuous', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        -0.5 // the old, since-replaced "always centered" assumption
      );
      const rawWidth = 2.672;
      const rawMinX = -0.1174;
      const tsx = pieces[0]!.pieceWidth / rawWidth;
      const actualBboxMinX = pieces[0]!.position.x + rawMinX * tsx;
      // Measured ~0.456 world units short of the true segment start — a
      // real, visible gap, not a rounding artifact.
      expect(Math.abs(actualBboxMinX - 0)).toBeGreaterThan(0.3);
    });
  });

  describe('facing param (round-2 W3/W4 regression: "west wall is a featureless dark slab")', () => {
    it('omitting facing leaves rotationY exactly at the naive direction-only value (every pre-fix caller)', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0
      );
      for (const piece of pieces) {
        expect(piece.rotationY).toBeCloseTo(Math.atan2(-0, 4), 9);
      }
    });

    it('a facing vector aligned with the naive front direction leaves rotationY unchanged', () => {
      // dir=(4,0) -> naiveRotationY=atan2(-0,4)=0 -> front_world=(sin 0,cos 0)=(0,1).
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        -0.5,
        { x: 0, z: 1 }
      );
      for (const piece of pieces) {
        expect(piece.rotationY).toBeCloseTo(0, 9);
      }
    });

    it('a facing vector opposite the naive front direction flips rotationY by pi', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        -0.5,
        { x: 0, z: -1 } // opposite of the naive front (0,1)
      );
      for (const piece of pieces) {
        expect(piece.rotationY).toBeCloseTo(Math.PI, 9);
      }
    });
  });
});

describe("facingCorrectedRotationY (round-2 W3/W4 fix: tileWallSegment's rotationY is a pure function of the run's own direction, with no notion of \"outward\" — hall's left/right sides share one direction pair and top/bottom share another, so within each pair the SAME rotationY got computed for both despite opposite outward normals; exactly one of each pair always ended up showing its flat, undecorated back outward, verified against the real reference-tomb fixture: 2 of hall's 4 sides failed)", () => {
  it('leaves rotationY unchanged when the naive front direction already matches facing', () => {
    // rotationY=0 -> front_world=(sin 0,cos 0)=(0,1) -> matches facing (0,1).
    expect(facingCorrectedRotationY(0, { x: 0, z: 1 })).toBeCloseTo(0, 9);
  });

  it('adds pi when the naive front direction opposes facing', () => {
    const corrected = facingCorrectedRotationY(0, { x: 0, z: -1 });
    expect(corrected).toBeCloseTo(Math.PI, 9);
  });

  it('reproduces the exact reference-tomb hall finding: rotationY=-60deg (left/right shared) flips for one side and not the other depending on facing', () => {
    const rotationY = -Math.PI / 3; // -60deg, hall's measured left/right rotationY
    // hall's LEFT outward direction (measured): already aligned -> no flip.
    const leftFacing = { x: -0.8368, z: 0.5475 };
    expect(facingCorrectedRotationY(rotationY, leftFacing)).toBeCloseTo(
      rotationY,
      9
    );
    // hall's RIGHT outward direction (measured, opposite of left's): the
    // SAME rotationY now needs a flip.
    const rightFacing = { x: 0.8368, z: -0.5475 };
    expect(facingCorrectedRotationY(rotationY, rightFacing)).toBeCloseTo(
      rotationY + Math.PI,
      9
    );
  });
});
