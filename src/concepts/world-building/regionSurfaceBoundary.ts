import type { BoundaryRun, RegionResolution } from './authoringRegions';
import type { WorldPoint } from './types';

/** Transient geometric provenance, not a material binding or persisted schema.
 * start/end are distances along the SOURCE wall in scene units, low to high;
 * from/to follow the certified room boundary with its interior on the left.
 * These centerline coordinates are not final fitted-face texture distances. */
export interface RegionWallSide extends BoundaryRun {
  side: 'positive-z' | 'negative-z';
  from: WorldPoint;
  to: WorldPoint;
  start: number;
  end: number;
}
export interface PatternCornerRef {
  incoming: BoundaryRun;
  outgoing: BoundaryRun;
}
export interface RegionBoundaryCorner {
  reference: PatternCornerRef;
  point: WorldPoint;
}
type BoundaryReason =
  | Extract<RegionResolution, { status: 'unresolved' }>['reason']
  | 'not-wall-bound';
export type RegionWallBoundary =
  | {
      id: string;
      status: 'resolved';
      sides: RegionWallSide[];
      corners: RegionBoundaryCorner[];
    }
  | { id: string; status: 'unresolved'; reason: BoundaryReason };
export type PatternStartResolution =
  | { status: 'resolved'; reference: PatternCornerRef; point: WorldPoint }
  | {
      status: 'unresolved';
      reason:
        | BoundaryReason
        | 'no-pattern-corner'
        | 'missing-pattern-start'
        | 'ambiguous-pattern-start';
    };

function copy(
  corner: RegionBoundaryCorner
): Extract<PatternStartResolution, { status: 'resolved' }> {
  return {
    status: 'resolved',
    reference: {
      incoming: { ...corner.reference.incoming },
      outgoing: { ...corner.reference.outgoing },
    },
    point: { ...corner.point },
  };
}
function sameRun(a: BoundaryRun, b: BoundaryRun): boolean {
  return a.wallId === b.wallId && a.direction === b.direction;
}
/** An explicit initial choice. Callers must not reapply this default while
 * resolving existing intent, or a removed corner would silently move the seam. */
export function defaultPatternStart(
  boundary: RegionWallBoundary
): PatternStartResolution {
  if (boundary.status === 'unresolved')
    return { status: 'unresolved', reason: boundary.reason };
  const corner = boundary.corners[0];
  return corner
    ? copy(corner)
    : { status: 'unresolved', reason: 'no-pattern-corner' };
}
/** Resolve identity, not label position, array offset or saved world point. */
export function resolvePatternStart(
  boundary: RegionWallBoundary,
  reference: PatternCornerRef
): PatternStartResolution {
  if (boundary.status === 'unresolved')
    return { status: 'unresolved', reason: boundary.reason };
  const matches = boundary.corners.filter(
    (corner) =>
      sameRun(corner.reference.incoming, reference.incoming) &&
      sameRun(corner.reference.outgoing, reference.outgoing)
  );
  if (matches.length !== 1)
    return {
      status: 'unresolved',
      reason: matches.length
        ? 'ambiguous-pattern-start'
        : 'missing-pattern-start',
    };
  return copy(matches[0]);
}
