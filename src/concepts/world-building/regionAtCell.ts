import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { AuthoringRegion, RegionResolution } from './authoringRegions';
import { exactPoint, pointInRing } from './regionBoundaryPredicates';
import type { RoomDraft, RoomHexCell } from './roomDraft';

/** The drawn regions at one cell, in authored order. PRESENTATION ONLY: this
 * names the annotation drawn at the cell for the inspector. It is never
 * membership for a rule, and an unresolved region is never reported. */
export function regionsAtCell(input: {
  draft: Readonly<RoomDraft>;
  resolutions: readonly RegionResolution[];
  cell: RoomHexCell;
}): AuthoringRegion[] {
  const { draft, resolutions, cell } = input;
  const byId = new Map(resolutions.map((r) => [r.id, r]));
  const centre = cubeToWorld(
    { x: cell.q, y: -cell.q - cell.r, z: cell.r },
    HEX_SIZE
  );
  return (draft.scene.authoringRegions ?? []).filter((region) => {
    const resolution = byId.get(region.id);
    if (resolution?.status !== 'resolved') return false;
    const area = resolution.area;
    if (area.kind === 'hex-union')
      return area.cells.some((c) => c.q === cell.q && c.r === cell.r);
    return (
      pointInRing(area.ring.map(exactPoint), { x: centre.x, z: centre.z }) ===
      'inside'
    );
  });
}
