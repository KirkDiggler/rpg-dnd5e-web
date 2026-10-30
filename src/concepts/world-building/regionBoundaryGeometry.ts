import type { RegionResolution } from './authoringRegions';
import type { RegionWallBoundary } from './regionSurfaceBoundary';
import { regionCells, type RoomDraft } from './roomDraft';

/**
 * EVERY REGION RESOLVES TO THE CELLS IT LISTS (rpg-project#725).
 *
 * A region is what it lists — there is no automatic boundary to find, no
 * enclosure witness to re-bind and no polygon to certify, so the resolver is
 * a projection: resolved when the region owns a cell, `empty` when it is
 * declared and unpainted. Two regions cannot overlap; the draft refuses it.
 */
export function resolveRegions(
  draft: Readonly<Pick<RoomDraft, 'room'>>
): RegionResolution[] {
  return draft.room.regions.map((region): RegionResolution => {
    const cells = regionCells(region);
    return cells.length
      ? {
          id: region.id,
          status: 'resolved',
          area: { kind: 'hex-union', cells: cells.map((c) => ({ ...c })) },
        }
      : { id: region.id, status: 'unresolved', reason: 'empty' };
  });
}

/**
 * Wall-side provenance for a region's wall finish. A region of listed cells
 * names no wall face — only the retired automatic regions were wall-bound —
 * so every region answers `not-wall-bound`, as an explicit region always did.
 * A region's `wallFinish` is carried in `scene.regionPresentation` and shown
 * unapplied until the author's construction (design O2) can bind a face.
 */
export function projectRegionWallBoundaries(
  draft: Readonly<Pick<RoomDraft, 'room'>>
): RegionWallBoundary[] {
  return draft.room.regions.map((region) => ({
    id: region.id,
    status: 'unresolved',
    reason: 'not-wall-bound',
  }));
}
