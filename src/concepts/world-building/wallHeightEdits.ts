import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { planAssetHeight } from '@/rendering/assetHeightLayout';
import type { StructuralWallSurface } from './structuralWalls';

/** Validate changed visual heights at the existing owner transaction. Unchanged
 * imported/unknown intent stays editable; appearance never alters blockers. */
export function assertWallHeightEdit(input: {
  walls: readonly StructuralWallSurface[];
  previousWalls: readonly StructuralWallSurface[];
}): void {
  const check = (ref: string | undefined, height: number) => {
    const asset = ref ? GENERATED_WORLD_ASSETS[ref] : undefined;
    if (!asset?.heightFit) return;
    planAssetHeight({
      nativeHeight: asset.boundsMeters[1],
      targetHeight: height,
      profile: asset.heightFit,
    });
  };
  for (const wall of input.walls) {
    const old = input.previousWalls.find((row) => row.id === wall.id);
    const heightChanged = old?.appearance.height !== wall.appearance.height;
    if (heightChanged || old?.appearance.assetRef !== wall.appearance.assetRef)
      check(wall.appearance.assetRef, wall.appearance.height);
    for (const section of wall.appearance.sections ?? []) {
      const prior = old?.appearance.sections?.find(
        (row) => row.id === section.id
      );
      if (heightChanged || prior?.assetRef !== section.assetRef)
        check(section.assetRef, wall.appearance.height);
    }
    for (const opening of wall.openings) {
      if (!opening.door) continue;
      const prior = old?.openings.find((row) => row.id === opening.id);
      if (heightChanged || prior?.door?.assetRef !== opening.door.assetRef)
        check(opening.door.assetRef, wall.appearance.height);
    }
  }
}
