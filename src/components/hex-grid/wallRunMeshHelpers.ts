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

export function tileWallSegment(
  segment: WallRunSegment,
  nominalPieceWidth: number
): TiledPiece[] {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const length = Math.hypot(dx, dz);
  if (length < WALL_RUN_LENGTH_EPSILON) return [];

  const count = Math.max(1, Math.round(length / nominalPieceWidth));
  const pieceWidth = length / count;
  const rotationY = Math.atan2(-dz, dx);
  const ux = dx / length;
  const uz = dz / length;

  const pieces: TiledPiece[] = [];
  for (let i = 0; i < count; i++) {
    const centerDist = pieceWidth * (i + 0.5);
    pieces.push({
      position: {
        x: segment.start.x + ux * centerDist,
        z: segment.start.z + uz * centerDist,
      },
      rotationY,
      pieceWidth,
    });
  }
  return pieces;
}
