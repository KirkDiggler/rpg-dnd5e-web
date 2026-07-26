/**
 * Pure helpers for WallRunMesh.tsx — split out per the react-refresh
 * ESLint rule (component files may only export components; matches
 * syntyHexWallHelpers.ts's identical split).
 */

import type { WallRunSegment } from '@/hooks/wallRuns';
import type { WorldPos } from './hexMath';

export interface WallRunBoxTransform {
  position: WorldPos;
  /** Y-axis rotation (radians) lining the box's local +X (its length
   * axis) up with the segment's start->end direction — same
   * atan2(-dz, dx) convention as hexEdgeBetween/hexMath.ts, so a run box
   * rotates exactly the way every other edge-aligned piece in this
   * codebase does. */
  rotationY: number;
  /** Segment length, world units — 0 for a degenerate (coincident
   * start/end) segment; callers skip rendering in that case. */
  length: number;
}

/**
 * Pure geometry: midpoint/rotation/length for a straight box spanning
 * `segment`. Exported for direct unit testing without mounting a
 * react-three-fiber scene (matches syntyHexWallHelpers.ts's convention of
 * keeping pure geometry helpers testable independent of GLB loading).
 */
export function wallRunBoxTransform(
  segment: WallRunSegment
): WallRunBoxTransform {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const length = Math.hypot(dx, dz);
  const rotationY = length === 0 ? 0 : Math.atan2(-dz, dx);
  const position: WorldPos = {
    x: (segment.start.x + segment.end.x) / 2,
    z: (segment.start.z + segment.end.z) / 2,
  };
  return { position, rotationY, length };
}

/** Stable key for a connector run segment — segments carry no
 * entity-style id of their own (a connector run's up-to-2 segments are
 * positional, not entity-keyed), so this derives one from the segment's
 * own endpoints rather than array index (React list-key convention). */
export function segmentKey(segment: WallRunSegment): string {
  return `${segment.start.x},${segment.start.z}-${segment.end.x},${segment.end.z}`;
}

/** One placed instance of a repeated modular piece along a run. */
export interface TiledPiece {
  position: WorldPos;
  /** Same atan2(-dz, dx) rotation convention as wallRunBoxTransform, so a
   * tiled piece's local +X (its width axis, per the "edge" fit scale
   * formula — wallVariantScale) lines up with the run's own direction. */
  rotationY: number;
  /** World-unit width this instance should be scaled to — the run's
   * length divided evenly by however many pieces fit, NOT the piece's own
   * nominal width. This is what makes adjacent tiles meet edge-to-edge
   * with no gap and no overhang past `segment`'s own start/end, matching
   * real Synty modular wall kits (repeated identical segments), not a
   * single piece stretched to fit. */
  pieceWidth: number;
}

/**
 * Real Synty pieces are modular — a run spans many hex-units, not the
 * single hex-edge a "wall" role piece is calibrated for (`wallVariantScale`
 * squeezes a piece to exactly 1.0 world unit). W3 (design.md/plan.md: "map
 * runs to segment/corner/door-frame pieces") tiles repeated instances along
 * a run's length instead of stretching one instance — the same "chain
 * identical segments" convention the pack's own modular kit is authored
 * for. `nominalPieceWidth` is the piece's calibrated width (1.0 for the
 * "wall" role's edge-fit formula); the actual per-instance width is
 * `length / count`, evenly dividing the run so tiles meet exactly at both
 * ends with no gap or overhang — a small, deliberate stretch/squeeze per
 * instance (never more than half `nominalPieceWidth` either direction,
 * since `count` is the nearest-integer number of nominal-width pieces that
 * fit) rather than a hardcoded assumption that `length` is an exact
 * multiple of it. Zero-length AND sub-epsilon (near-zero, floating-point-
 * noise) segments produce no pieces — review finding (walls-r, PR #608):
 * an exact `length === 0` check alone lets a tiny nonzero length (e.g.
 * `1e-12` from upstream geometry rounding, not a real degenerate segment)
 * through to `pieceWidth`, which then becomes GlbInstance's non-uniform
 * scale input — an ~0 scale factor on one axis collapses that axis'
 * triangles to zero area, which can produce NaN/Infinity normals (a
 * zero-length cross product has no defined direction) that render as a
 * black silhouette exactly like the defect GlbInstance's own baked-scale
 * fix (this PR) otherwise resolves. `WALL_RUN_LENGTH_EPSILON` guards this
 * at the source rather than downstream in GlbInstance, since a segment
 * this short could never read as a wall segment on screen anyway (it's
 * geometrically insignificant at world scale, not policy).
 */
const WALL_RUN_LENGTH_EPSILON = 1e-6;

/**
 * Flips a direction-derived `rotationY` by pi when its own front-facing
 * side doesn't point toward `facing` — round-2 W3/W4 finding (Kirk's live
 * walk: "west wall is a featureless dark slab while the north wall shows
 * brick tile detail"; see EnvelopeRun.facing's doc comment in wallRuns.ts
 * for the full root-cause writeup). `atan2(-dz, dx)`-style rotationY
 * aligns a piece's local +X with the run's own direction, but says
 * nothing about which way its local +Z (front vs back) ends up pointing —
 * empirically calibrated (own isolation screenshots, rotationY=0 shows
 * the detailed face from a +Z camera, rotationY=pi shows a flat
 * undecorated back): a piece's front-facing WORLD direction at a given
 * rotationY is `(sin(rotationY), cos(rotationY))`. If that doesn't point
 * roughly the same way as `facing` (dot product negative), the piece is
 * showing its flat back instead of its detailed face — add pi to flip
 * it 180 degrees, which points the SAME local +X-aligned length axis
 * along the run (the tiling itself is unaffected) but swaps which local
 * Z face points outward.
 */
export function facingCorrectedRotationY(
  rotationY: number,
  facing: WorldPos
): number {
  const frontX = Math.sin(rotationY);
  const frontZ = Math.cos(rotationY);
  const dot = frontX * facing.x + frontZ * facing.z;
  return dot < 0 ? rotationY + Math.PI : rotationY;
}

export function tileWallSegment(
  segment: WallRunSegment,
  nominalPieceWidth: number,
  /**
   * The tiled piece's own local bbox MIN x, as a fraction of its own
   * rawWidth (`WallVariant.rawMinX / rawWidth`) — round-2 W3/W4 finding
   * (see `WallVariant.rawMinX`'s own doc comment for the measured numbers
   * and the "run shifts off its own segment line" defect this corrects).
   * Defaults to -0.5 (the piece's local origin sits exactly at its own
   * bbox center) — the assumption this function used unconditionally
   * before this fix, preserved here as the default so a caller that
   * doesn't know better (or a genuinely centered piece, like this pack's
   * `alcove` variant) gets the same placement as before.
   */
  pivotRatio: number = -0.5,
  /**
   * Unit vector this run's tiles should face — see
   * `facingCorrectedRotationY`'s doc comment. Omitted (every pre-fix
   * caller) skips the correction entirely, keeping the original
   * direction-only rotationY unchanged.
   */
  facing?: WorldPos
): TiledPiece[] {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const length = Math.hypot(dx, dz);
  if (length < WALL_RUN_LENGTH_EPSILON) return [];

  const count = Math.max(1, Math.round(length / nominalPieceWidth));
  const pieceWidth = length / count;
  const naiveRotationY = Math.atan2(-dz, dx);
  const rotationY = facing
    ? facingCorrectedRotationY(naiveRotationY, facing)
    : naiveRotationY;
  // Wall-lab measurement (issue #615): `facingCorrectedRotationY` flips
  // rotationY by pi on roughly half of any room's 4 sides (whichever ones
  // don't naturally face outward — see its own doc comment). When that
  // happens, the piece's local +X axis (which `pivotRatio` assumes always
  // points along `ux`/`uz`, i.e. toward the run's own end) now points the
  // OPPOSITE way in world space. Using the un-flipped pivot formula in
  // that case doesn't just fail to correct the tile's off-center pivot —
  // it shifts the origin in the WRONG direction while the piece's own
  // visual bulk is ALSO on the wrong side post-flip, compounding into a
  // ~1-piece-width error (measured: ~0.91 of a full tile for
  // `RUN_WALL_VARIANT`'s pivotRatio). This is the exact root cause of the
  // "top wall shifted left, right wall shifted a hex" defect Kirk found
  // in prod — those are exactly the 2 of 4 envelope sides
  // facingCorrectedRotationY flips.
  const flipped = rotationY !== naiveRotationY;
  const ux = dx / length;
  const uz = dz / length;

  const pieces: TiledPiece[] = [];
  for (let i = 0; i < count; i++) {
    // Where to put THIS piece's own local origin (not necessarily its
    // visual center — see `pivotRatio`'s doc comment) so that its actual
    // scaled bounding box lands flush at [i, i+1] * pieceWidth along the
    // run, matching every other tile with zero gap or overlap. Reduces to
    // the pre-fix `pieceWidth * (i + 0.5)` exactly when pivotRatio = -0.5
    // (a centered pivot behaves identically flipped or not — the two
    // formulas below agree exactly at pivotRatio = -0.5, which is also
    // how this was verified).
    const originDist = flipped
      ? pieceWidth * (i + pivotRatio + 1)
      : pieceWidth * (i - pivotRatio);
    pieces.push({
      position: {
        x: segment.start.x + ux * originDist,
        z: segment.start.z + uz * originDist,
      },
      rotationY,
      pieceWidth,
    });
  }
  return pieces;
}
