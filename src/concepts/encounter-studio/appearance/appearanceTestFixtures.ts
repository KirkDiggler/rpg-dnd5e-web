import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import {
  GENERATED_WORLD_ATLAS_BINDINGS,
  GENERATED_WORLD_ATLAS_MATERIALS,
  GENERATED_WORLD_MATERIAL_COLLECTIONS,
  GENERATED_WORLD_MATERIAL_PROVIDER,
  GENERATED_WORLD_MATERIALS,
} from '@/generated/worldMaterialCatalog';
import { NPC_APPEARANCE_FAMILIES } from '@/npc-appearances/npcAppearanceChoices';
import { createPinnedWorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import {
  projectStudioArrange,
  type StudioArrangeTarget,
} from '../../world-building/studioArrange';
import { createPopulatedStudioDocument } from '../fixtures/studioDocument';
import type { AppearanceSheetInput } from './appearanceTypes';

/** Real owner projections and pinned metadata; no mock picker/runtime facts. */
export function appearanceFixture(
  target: StudioArrangeTarget = { kind: 'wall', id: 'studio-wall' }
) {
  const document = createPopulatedStudioDocument();
  document.draft.room.walls![0].appearance.assetRef =
    'dnd5e:env:fantasy-kingdom:house_wall_05';
  document.draft.room.monsterDeclarations[0].appearanceRef =
    'dnd5e:npcs:kingdom:merchant-01';
  const selection = projectStudioArrange({
    draft: document.draft,
    target,
    selectionRevision: 1,
  })!;
  const catalog = createPinnedWorldMaterialCatalog({
    provider: GENERATED_WORLD_MATERIAL_PROVIDER,
    materials: GENERATED_WORLD_MATERIALS,
    assets: GENERATED_WORLD_ASSETS,
    atlas: {
      materials: GENERATED_WORLD_ATLAS_MATERIALS,
      bindings: GENERATED_WORLD_ATLAS_BINDINGS,
      collections: GENERATED_WORLD_MATERIAL_COLLECTIONS,
    },
  })!;
  const input = {
    selection,
    draft: {},
    scene: document.draft.scene,
    catalog,
    assets: GENERATED_WORLD_ASSETS,
    npcFamilies: NPC_APPEARANCE_FAMILIES,
  } satisfies AppearanceSheetInput;
  return { document, input };
}
