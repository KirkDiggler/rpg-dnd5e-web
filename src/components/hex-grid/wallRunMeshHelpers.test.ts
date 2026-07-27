import { CUTAWAY_STUB_WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { describe, expect, it } from 'vitest';
import {
  connectorPartitionHeight,
  effectiveWallHeight,
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

  describe('pivotRatio + facing interaction (issue #615 regression: "top wall shifted left, right wall shifted a hex")', () => {
    // Measured in the wall-lab dungeon (rpg-dnd5e-web#615): exactly 2 of
    // any room's 4 envelope sides get their rotationY flipped by pi
    // (facingCorrectedRotationY), and RUN_WALL_VARIANT's real pivotRatio
    // (~-0.044, see WallVariant.rawMinX's doc comment) placed those 2
    // sides' tiles off by ~0.91 of a full piece width — read as "shifted
    // by about a hex" — because the un-flipped pivot formula assumes the
    // piece's local +X always points along the run's own direction, which
    // is false once the piece is ALSO rotated 180 degrees by the facing
    // correction.
    const PIVOT_RATIO = -0.044; // ~RUN_WALL_VARIANT's real measured value

    it('with no flip needed, the pivot formula is unchanged from the pivotRatio-only behavior', () => {
      const facingMatchingNaive = { x: 0, z: 1 }; // matches naive front for dir=(4,0)
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        PIVOT_RATIO,
        facingMatchingNaive
      );
      // Same as the pivotRatio-only formula: pieceWidth * (i - pivotRatio).
      expect(pieces[0]!.position.x).toBeCloseTo(1.0 * (0 - PIVOT_RATIO), 9);
      expect(pieces[1]!.position.x).toBeCloseTo(1.0 * (1 - PIVOT_RATIO), 9);
    });

    it('with a flip forced, the pivot formula mirrors correctly — NOT the same distance as the unflipped case, and NOT the naive (i - pivotRatio) applied blindly', () => {
      const facingOpposingNaive = { x: 0, z: -1 }; // forces a flip for dir=(4,0)
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        PIVOT_RATIO,
        facingOpposingNaive
      );
      // Correct flipped formula: pieceWidth * (i + pivotRatio + 1).
      const expectedFlipped = 1.0 * (0 + PIVOT_RATIO + 1);
      expect(pieces[0]!.position.x).toBeCloseTo(expectedFlipped, 9);

      // Proves this ISN'T just reusing the unflipped formula: the two
      // differ by ~0.91 of a full piece width (the exact magnitude
      // measured live in the wall-lab dungeon for this pivotRatio).
      const unflippedFormula = 1.0 * (0 - PIVOT_RATIO);
      expect(Math.abs(expectedFlipped - unflippedFormula)).toBeGreaterThan(0.9);
    });

    it('a perfectly centered pivot (pivotRatio = -0.5, e.g. the "alcove" variant) is unaffected by the flip either way — the two formulas agree exactly', () => {
      const centeredPivot = -0.5;
      const facingMatchingNaive = { x: 0, z: 1 };
      const facingOpposingNaive = { x: 0, z: -1 };
      const notFlipped = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        centeredPivot,
        facingMatchingNaive
      );
      const flipped = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        centeredPivot,
        facingOpposingNaive
      );
      for (let i = 0; i < notFlipped.length; i++) {
        expect(flipped[i]!.position.x).toBeCloseTo(
          notFlipped[i]!.position.x,
          9
        );
        expect(flipped[i]!.position.z).toBeCloseTo(
          notFlipped[i]!.position.z,
          9
        );
      }
    });
  });

  describe('overlapMargin (issue #634 regression: "air gaps between adjacent wall segments at the tall default")', () => {
    // Root-caused via an isolated two-tile render (not the theoretical
    // bounding box, which is already provably gap-free by construction —
    // see the pivotRatio tests above): RUN_WALL_VARIANT's ("plain"
    // Wall_Half) authored edge silhouette is a deliberately irregular,
    // rock-cut profile, not a flat rectangle, and recedes inward from its
    // own bbox by varying amounts at different heights (measured: up to
    // ~0.05 unit in the lower ~60% of the panel). overlapMargin grows each
    // tile's rendered bbox symmetrically so adjacent tiles OVERLAP instead
    // of meeting exactly flush, self-covering the irregular edge — same
    // class of fix as envelopeCornerOverlapMargin (wallRuns.ts) already
    // uses for room corners.
    const MEASURED_PIVOT_RATIO = -0.1174 / 2.672; // RUN_WALL_VARIANT's real pivotRatio
    const rawWidth = 2.672;
    const rawMinX = -0.1174;

    it('default overlapMargin (0) is byte-identical to omitting the parameter entirely', () => {
      const omitted = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO
      );
      const explicitZero = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO,
        undefined,
        0
      );
      expect(explicitZero).toEqual(omitted);
    });

    it('a non-zero margin grows the RENDERED pieceWidth by exactly 2*overlapMargin, leaving count and inter-tile spacing untouched', () => {
      const noMargin = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO
      );
      const withMargin = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO,
        undefined,
        0.08
      );
      expect(withMargin).toHaveLength(noMargin.length);
      for (let i = 0; i < withMargin.length; i++) {
        expect(withMargin[i]!.pieceWidth).toBeCloseTo(
          noMargin[i]!.pieceWidth + 0.16,
          9
        );
      }
      // Margin is a constant offset applied uniformly to every tile's
      // origin (same relationship the pivotRatio tests above prove for
      // pivotRatio itself) — never a per-tile stretch/squeeze, so
      // consecutive origins stay exactly `pieceWidth` (the TRUE slot
      // width) apart regardless of margin.
      for (let i = 1; i < withMargin.length; i++) {
        expect(
          withMargin[i]!.position.x - withMargin[i - 1]!.position.x
        ).toBeCloseTo(1.0, 9);
      }
    });

    it('closes the measured real-world gap: adjacent tiles’ actual (bbox-corrected) rendered edges OVERLAP by exactly 2*overlapMargin instead of meeting flush — reproduces the exact hand-derived numbers this issue was root-caused against', () => {
      const overlapMargin = 0.08;
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 2, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO,
        undefined,
        overlapMargin
      );
      expect(pieces).toHaveLength(2);

      const tsx0 = pieces[0]!.pieceWidth / rawWidth;
      const bboxMin0 = pieces[0]!.position.x + rawMinX * tsx0;
      const bboxMax0 = pieces[0]!.position.x + (rawMinX + rawWidth) * tsx0;
      expect(bboxMin0).toBeCloseTo(-overlapMargin, 9); // -0.08
      expect(bboxMax0).toBeCloseTo(1 + overlapMargin, 9); // 1.08

      const tsx1 = pieces[1]!.pieceWidth / rawWidth;
      const bboxMin1 = pieces[1]!.position.x + rawMinX * tsx1;
      const bboxMax1 = pieces[1]!.position.x + (rawMinX + rawWidth) * tsx1;
      expect(bboxMin1).toBeCloseTo(1 - overlapMargin, 9); // 0.92
      expect(bboxMax1).toBeCloseTo(2 + overlapMargin, 9); // 2.08

      // The seam itself: piece 0's rendered right edge now sits PAST
      // piece 1's rendered left edge by exactly 2*overlapMargin — an
      // overlap, not a flush meet (margin=0 gives exactly 0 here, per
      // the test below).
      expect(bboxMax0 - bboxMin1).toBeCloseTo(2 * overlapMargin, 9);
    });

    it('WITHOUT the margin (margin=0), the same two tiles meet exactly flush — proves the overlap test above is not vacuous', () => {
      const pieces = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 2, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO
      );
      const tsx0 = pieces[0]!.pieceWidth / rawWidth;
      const bboxMax0 = pieces[0]!.position.x + (rawMinX + rawWidth) * tsx0;
      const tsx1 = pieces[1]!.pieceWidth / rawWidth;
      const bboxMin1 = pieces[1]!.position.x + rawMinX * tsx1;
      expect(bboxMax0 - bboxMin1).toBeCloseTo(0, 9);
    });

    it('the origin-shift sign convention holds for a flipped run too (facing forces a 180deg flip): margin still applies as a constant per-tile offset, added (not subtracted) per the flipped branch’s own sign convention', () => {
      const facingOpposingNaive = { x: 0, z: -1 }; // forces a flip for dir=(2,0)
      const noMargin = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 2, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO,
        facingOpposingNaive
      );
      const withMargin = tileWallSegment(
        { start: { x: 0, z: 0 }, end: { x: 2, z: 0 } },
        1.0,
        MEASURED_PIVOT_RATIO,
        facingOpposingNaive,
        0.08
      );
      // Same constant-offset relationship as the non-flipped case: margin
      // never changes inter-tile spacing.
      for (let i = 1; i < withMargin.length; i++) {
        expect(
          withMargin[i]!.position.x - withMargin[i - 1]!.position.x
        ).toBeCloseTo(1.0, 9);
      }
      // Reproduces the exact hand-derived flipped-formula shift:
      // marginTerm = overlapMargin*(1+2*pivotRatio), ADDED for the
      // flipped branch — opposite sign from the non-flipped branch above,
      // matching the existing sign-flip convention between the two
      // branches of the origin formula.
      const marginTerm = 0.08 * (1 + 2 * MEASURED_PIVOT_RATIO);
      expect(withMargin[0]!.position.x).toBeCloseTo(
        noMargin[0]!.position.x + marginTerm,
        9
      );
      expect(withMargin[1]!.position.x).toBeCloseTo(
        noMargin[1]!.position.x + marginTerm,
        9
      );
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

describe('effectiveWallHeight (cutaway prototype, rpg-project#132 ?wallCutaway=1: camera-facing runs render as a low stub, away-facing runs stay tall)', () => {
  const TALL = 2.4;
  // Toward the fixed isometric camera (matches CAMERA_WARD_XZ's own
  // direction, derived from CAMERA_OFFSET=[8,10,8] — see
  // calibrationConstants.ts).
  const TOWARD_CAMERA = { x: 1, z: 1 };
  const AWAY_FROM_CAMERA = { x: -1, z: -1 };

  it('renders the uniform tall height when cutaway is off, regardless of facing', () => {
    expect(effectiveWallHeight(TOWARD_CAMERA, false, TALL)).toBe(TALL);
    expect(effectiveWallHeight(AWAY_FROM_CAMERA, false, TALL)).toBe(TALL);
  });

  it('renders tall (never stub) when there is no facing vector at all, even with cutaway on', () => {
    expect(effectiveWallHeight(undefined, true, TALL)).toBe(TALL);
  });

  it('stubs a run whose facing points toward the camera', () => {
    expect(effectiveWallHeight(TOWARD_CAMERA, true, TALL)).toBe(
      CUTAWAY_STUB_WALL_HEIGHT
    );
  });

  it('keeps a run whose facing points away from the camera at the tall height', () => {
    expect(effectiveWallHeight(AWAY_FROM_CAMERA, true, TALL)).toBe(TALL);
  });
});

describe('connectorPartitionHeight (interior-partition rule, rpg-project#132 follow-up: Kirk\'s live-walk finding that the envelope dot-rule made every interior partition stub — "envelope walls keep the existing dot rule... interior partitions default TALL; a partition stubs only when it sits between the camera and the player\'s current/active room")', () => {
  const TALL = 2.4;
  const PARTITION_POINT = { x: 0, z: 0 };
  // Toward/away from the fixed isometric camera, same CAMERA_WARD_XZ
  // direction effectiveWallHeight's own tests use — but here it's the
  // PLAYER's position relative to the partition, not a facing vector.
  const PLAYER_TOWARD_CAMERA = { x: 10, z: 10 };
  const PLAYER_AWAY_FROM_CAMERA = { x: -10, z: -10 };

  it('renders the uniform tall height when cutaway is off, regardless of player position', () => {
    expect(
      connectorPartitionHeight(
        PARTITION_POINT,
        PLAYER_AWAY_FROM_CAMERA,
        false,
        TALL
      )
    ).toBe(TALL);
  });

  it('defaults tall when no player position is known yet — "interior partitions default TALL"', () => {
    expect(
      connectorPartitionHeight(PARTITION_POINT, undefined, true, TALL)
    ).toBe(TALL);
  });

  it('keeps a partition tall when the player sits on the camera side (partition is behind the player, does not occlude their room)', () => {
    expect(
      connectorPartitionHeight(
        PARTITION_POINT,
        PLAYER_TOWARD_CAMERA,
        true,
        TALL
      )
    ).toBe(TALL);
  });

  it("stubs a partition when it sits between the camera and the player (would occlude the player's own current room)", () => {
    expect(
      connectorPartitionHeight(
        PARTITION_POINT,
        PLAYER_AWAY_FROM_CAMERA,
        true,
        TALL
      )
    ).toBe(CUTAWAY_STUB_WALL_HEIGHT);
  });

  it('classifies relative to the partition point, not world origin — shifting both by the same offset gives the identical result', () => {
    const shiftedPartition = { x: 50, z: -30 };
    const shiftedPlayerAway = { x: 40, z: -40 };
    expect(
      connectorPartitionHeight(shiftedPartition, shiftedPlayerAway, true, TALL)
    ).toBe(CUTAWAY_STUB_WALL_HEIGHT);
  });
});
