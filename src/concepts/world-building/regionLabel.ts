import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { regionCells, type RoomRegion } from './roomDraft';
import type { WorldPoint } from './types';

/**
 * WHERE A REGION'S LABEL SITS: the centroid of its cells' centres
 * (rpg-project#725 R5, G4). The label is the region's name and its position
 * is computed, never stored — nothing derived is written. Null for a region
 * with no cells: an unpainted place has nowhere to be labelled.
 */
export function regionLabelPoint(
  region: Pick<RoomRegion, 'cells'>
): WorldPoint | null {
  const cells = regionCells(region);
  if (cells.length === 0) return null;
  let x = 0,
    z = 0;
  for (const { q, r } of cells) {
    const centre = cubeToWorld({ x: q, y: -q - r, z: r }, HEX_SIZE);
    x += centre.x;
    z += centre.z;
  }
  return { x: x / cells.length, z: z / cells.length };
}
