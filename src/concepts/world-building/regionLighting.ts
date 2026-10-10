import type { AuthoringRegion, RegionResolution } from './authoringRegions';

export type RegionLightingProjection = {
  readonly areas: readonly {
    readonly regionId: string;
    readonly background: number;
    readonly area: Extract<RegionResolution, { status: 'resolved' }>['area'];
  }[];
};

/** Only current configured resolutions apply. No acquisition or last-good extent. */
export function projectRegionLighting(
  regions: readonly AuthoringRegion[],
  resolutions: readonly RegionResolution[]
): RegionLightingProjection {
  const byId = new Map(
    resolutions.map((resolution) => [resolution.id, resolution])
  );
  return {
    areas: regions.flatMap((region) => {
      const resolution = byId.get(region.id);
      return region.lighting && resolution?.status === 'resolved'
        ? [
            {
              regionId: region.id,
              background: region.lighting.background,
              area: resolution.area,
            },
          ]
        : [];
    }),
  };
}
