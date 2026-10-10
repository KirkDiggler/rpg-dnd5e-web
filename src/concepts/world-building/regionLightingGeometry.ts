import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import type { SpatialBackgroundArea } from '@/rendering/spatialBackgroundField';
import type { RegionLightingProjection } from './regionLighting';

/** Uses the workspace cell-corner formula without introducing a floor owner. */
export function toSpatialBackgroundAreas(
  projection: RegionLightingProjection
): readonly SpatialBackgroundArea[] {
  return projection.areas.flatMap(({ regionId, background, area }) => {
    if (area.kind === 'polygon')
      return [{ id: regionId, background, ring: area.ring }];
    return area.cells.flatMap((cell) => {
      const center = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      const corners = hexCorners(center, HEX_SIZE);
      return corners.map((p, i) => ({
        id: regionId,
        background,
        ring: [center, p, corners[(i + 1) % 6]!],
      }));
    });
  });
}
