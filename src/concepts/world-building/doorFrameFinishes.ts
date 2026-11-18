import type { WorldAssetModelProps } from '@/components/hex-grid/WorldAssetModel';
import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import type { DoorFramePresentation } from '@/rendering/doorFramePresentation';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { surfaceRepeatSceneUnits } from './roomWallFinishes';

/** Only this door's supplied facts and provider resources participate. A hidden
 * parent wall is neither needed nor reconstructed to recover a pattern. */
export function projectDoorFrameFinishes(input: {
  asset: GeneratedWorldAsset;
  frame: DoorFramePresentation;
  catalog: WorldMaterialCatalog | null;
  elevation: number;
}): NonNullable<WorldAssetModelProps['surfacePlans']> {
  return input.frame.faceFinishes.map((face) => {
    const material = input.catalog?.materials.find(
      (row) => row.ref === face.materialRef
    );
    if (!material)
      throw Error(
        `Captured doorway finish is unavailable: ${face.materialRef}.`
      );
    const targets = input.asset.surfaces?.filter(
      (binding) =>
        binding.side === face.side && binding.family === material.family
    );
    if (targets?.length !== 1)
      throw Error('Captured doorway has no compatible fixed masonry target.');
    const repeat = surfaceRepeatSceneUnits(material);
    return {
      material,
      chart: {
        surfaceId: targets[0].id,
        phase: face.phaseU * repeat[0],
        direction: face.side === 'positive-z' ? 1 : -1,
        elevation: input.elevation,
        repeat,
      },
    };
  });
}
