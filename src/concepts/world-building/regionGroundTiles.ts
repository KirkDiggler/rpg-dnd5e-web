import type { GroundTile } from '@/components/hex-grid/groundGeometry';
import * as THREE from 'three';
import { fromRows } from './regionRuns';
import type { RoomRegion } from './roomDraft';

const DEFAULT_COLOR = new THREE.Color('#8f8b82').toArray() as [
  number,
  number,
  number,
];

/** Whether there is any authored appearance to show, rather than default ground. */
export function hasGroundAppearance(regions: readonly RoomRegion[]): boolean {
  return regions.some(
    (region) =>
      region.ground?.baseRef !== undefined ||
      region.ground?.paint?.some((paint) => paint.cells.length > 0)
  );
}

/** Linear pass over declared floor and paint; region ownership still draws the floor. */
export function groundTilesFromRegions(
  regions: readonly RoomRegion[]
): GroundTile[] {
  const tiles: GroundTile[] = [];
  for (const region of regions) {
    const overrides = new Map<string, string>();
    for (const paint of region.ground?.paint ?? [])
      for (const cell of fromRows(paint.cells, 'ground.paint.cells'))
        overrides.set(`${cell.q},${cell.r}`, paint.ref);
    for (const { q, r } of fromRows(region.cells, 'region.cells')) {
      const ref = overrides.get(`${q},${r}`) ?? region.ground?.baseRef;
      tiles.push({
        cell: { x: q, y: -q - r, z: r },
        ref,
        color: ref === undefined ? DEFAULT_COLOR : [1, 1, 1],
      });
    }
  }
  return tiles;
}
