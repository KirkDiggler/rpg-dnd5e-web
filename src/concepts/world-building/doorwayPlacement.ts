import type { WallSurfaceChart } from '@/rendering/wallSurfaceCharts';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { wallLength } from './structuralWallEditing';
import { wallSolidIntervals } from './structuralWallGeometry';
import type { StructuralWallSurface } from './structuralWalls';

export interface DoorRepeatGuide {
  period: number;
  origin: number;
}

/** Visual envelope only. The native opening remains the clear aperture. */
export function doorFrameExtents(
  assetRef: string | undefined,
  width: number
): { left: number; right: number } {
  const entry = assetRef
    ? WORLD_BUILDING_CATALOG_BY_REF.get(assetRef)
    : undefined;
  const fit =
    entry?.source === 'generated' ? entry.asset.wallOpening : undefined;
  if (!Number.isFinite(width) || width <= 0)
    throw new Error('Door width must be finite and positive.');
  if (!fit) return { left: width / 2, right: width / 2 };
  const scale = width / fit.widthMeters;
  return {
    left: fit.leftExtentMeters * scale,
    right: (fit.frameWidthMeters - fit.leftExtentMeters) * scale,
  };
}

/** Shared by preview and commit. Snapping is an explicit gesture preference,
 * not a property of the saved opening or a requirement for texture continuity. */
export function placeDoorFrame(
  wall: StructuralWallSurface,
  position: number,
  width: number,
  assetRef: string,
  snap: boolean,
  chart?: WallSurfaceChart
) {
  const clamped = clampDoorFramePosition(wall, position, width, assetRef);
  if (snap && !chart)
    throw new Error(
      'Repeat snapping needs a resolved wall-face finish. Turn snapping off for free placement.'
    );
  let repeatGuide: DoorRepeatGuide | undefined;
  if (chart) {
    if (
      ![chart.phase, chart.repeat[0]].every(Number.isFinite) ||
      chart.repeat[0] <= 0 ||
      ![1, -1].includes(chart.direction)
    )
      throw new Error('Invalid texture repeat guide.');
    repeatGuide = {
      period: chart.repeat[0],
      origin: -chart.phase / chart.direction,
    };
  }
  if (!snap || !repeatGuide) return { ...clamped, snapped: false, repeatGuide };
  const { left, right } = doorFrameExtents(assetRef, width);
  const { period, origin } = repeatGuide;
  const first = Math.ceil(-origin / period),
    last = Math.floor((wallLength(wall) - left - right - origin) / period);
  if (last < first)
    throw new Error(
      'No texture repeat point fits this door frame on the wall.'
    );
  const index = Math.max(
    first,
    Math.min(last, Math.round((clamped.position - left - origin) / period))
  );
  return {
    position: origin + index * period + left,
    clamped: clamped.clamped,
    snapped: true,
    repeatGuide,
  };
}

/** Runtime uses only spans explicitly supplied on its permitted openings.
 * No door matching, asset lookup or hidden-parent reconstruction participates. */
export function wallWithCapturedFrameSpans(
  wall: StructuralWallSurface
): StructuralWallSurface {
  if (!wall.openings.some((opening) => opening.frameSpan)) return wall;
  const visual = {
    ...wall,
    openings: wall.openings.map((opening) => {
      const span = opening.frameSpan;
      if (!span) return opening;
      if (span.before < opening.width / 2 || span.after < opening.width / 2)
        throw Error('Captured frame span must enclose the clear opening.');
      return {
        ...opening,
        position: opening.position + (span.after - span.before) / 2,
        width: span.before + span.after,
      };
    }),
  };
  wallSolidIntervals({
    wall: visual,
    extent: { start: 0, end: wallLength(wall) },
  });
  return visual;
}

/** A derived render input, never a replacement native wall or blocker. */
export function doorwayVisualWall(
  wall: StructuralWallSurface
): StructuralWallSurface {
  const length = wallLength(wall);
  const spans = wall.openings
    .map((opening) => {
      const extent = doorFrameExtents(opening.door?.assetRef, opening.width);
      return {
        opening,
        start: opening.position - extent.left,
        end: opening.position + extent.right,
      };
    })
    .sort((a, b) => a.start - b.start);
  spans.forEach((span, i) => {
    if (
      span.start < -1e-6 ||
      span.end > length + 1e-6 ||
      (i > 0 && span.start < spans[i - 1]!.end - 1e-6)
    )
      throw new Error(
        'Door frame extends beyond the wall or overlaps another opening/frame.'
      );
  });
  return {
    ...wall,
    openings: spans.map(({ opening, start, end }) => ({
      ...opening,
      position: (start + end) / 2,
      width: end - start,
    })),
  };
}

export function clampDoorFramePosition(
  wall: StructuralWallSurface,
  position: number,
  width: number,
  assetRef: string
): { position: number; clamped: boolean } {
  if (!Number.isFinite(position))
    throw new Error('Door position must be finite.');
  const { left, right } = doorFrameExtents(assetRef, width);
  const end = wallLength(wall) - right;
  if (end < left)
    throw new Error('Wall is too short for the chosen door frame.');
  const next = Math.max(left, Math.min(end, position));
  return { position: next, clamped: next !== position };
}
