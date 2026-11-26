import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import type { RoomDraft } from './roomDraft';
import { WALL_FINISH_SIDES } from './wallFinishTypes';

/** A new section or face choice must be compatible before the existing owner
 * commits it. Unchanged imported intent is not reinterpreted; Original requires
 * no resource catalog and does not enroll an unpaintable frame by inference. */
export function assertWallSectionFinishEdit(input: {
  draft: RoomDraft;
  previous: RoomDraft;
  catalog: WorldMaterialCatalog | null;
}): void {
  for (const wall of input.draft.room.walls ?? []) {
    const previous = input.previous.room.walls?.find(
      (row) => row.id === wall.id
    );
    for (const section of wall.appearance.sections ?? []) {
      const prior = previous?.appearance.sections?.find(
        (row) => row.id === section.id
      );
      for (const side of WALL_FINISH_SIDES) {
        const ref = input.draft.scene.wallFinishes?.[wall.id]?.[side];
        if (
          !ref ||
          (prior?.assetRef === section.assetRef &&
            input.previous.scene.wallFinishes?.[wall.id]?.[side] === ref)
        )
          continue;
        const material = input.catalog?.materials.find(
          (row) => row.ref === ref
        );
        if (!material)
          throw Error(
            `Wall section ${section.id}: selected finish is unavailable (${ref}).`
          );
        const asset = GENERATED_WORLD_ASSETS[section.assetRef];
        if (
          !asset?.surfaces?.some(
            (binding) =>
              binding.side === side && binding.family === material.family
          )
        )
          throw Error(
            `Wall section ${section.id} has no compatible ${side} surface for this finish.`
          );
      }
    }
  }
}
