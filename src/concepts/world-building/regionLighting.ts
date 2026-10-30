import type { RegionResolution } from './authoringRegions';
import type { RoomRegion } from './roomDraft';

export type RegionLightingProjection = {
  readonly areas: readonly {
    readonly regionId: string;
    readonly background: number;
    readonly area: Extract<RegionResolution, { status: 'resolved' }>['area'];
  }[];
};

/** Every region carries a lighting intensity (rpg-project#725); a region at
 * full intensity is the bright baseline and draws no area, exactly as an
 * unlit region did before lighting was required. Only resolved regions with
 * cells apply. */
export function projectRegionLighting(
  regions: readonly RoomRegion[],
  resolutions: readonly RegionResolution[]
): RegionLightingProjection {
  const byId = new Map(
    resolutions.map((resolution) => [resolution.id, resolution])
  );
  return {
    areas: regions.flatMap((region) => {
      const resolution = byId.get(region.id);
      return region.lighting.intensity < 1 && resolution?.status === 'resolved'
        ? [
            {
              regionId: region.id,
              background: region.lighting.intensity,
              area: resolution.area,
            },
          ]
        : [];
    }),
  };
}
