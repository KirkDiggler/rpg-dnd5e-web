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
