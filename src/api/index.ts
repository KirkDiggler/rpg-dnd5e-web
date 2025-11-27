// Re-export the client
export { characterClient, encounterClient } from './client';

// Re-export all hooks
export {
  useCreateDraft,
  useDeleteCharacter,
  useDeleteDraft,
  useFinalizeDraft,
  useGetCharacter,
  useGetDraft,
  useListCharacters,
  useListDrafts,
  useUpdateDraftAbilityScores,
  useUpdateDraftBackground,
  useUpdateDraftClass,
  useUpdateDraftName,
  useUpdateDraftRace,
  useUpdateDraftSkills,
  useValidateDraft,
} from './hooks';

// Re-export encounter hooks
export {
  useActivateFeature,
  useAttack,
  useDungeonStart,
  useEndTurn,
  useMoveCharacter,
} from './encounterHooks';

// Re-export equipment hooks
export {
  useEquipItem,
  useGetCharacterInventory,
  useUnequipItem,
} from './equipmentHooks';

// Re-export commonly used types from protos
export type {
  Character,
  CharacterDraft,
  CreationProgress,
  EquipmentSlots,
  GetCharacterInventoryResponse,
  InventoryItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export type { AbilityScores } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';

export { EquipmentSlot } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export {
  Ability,
  Alignment,
  Background,
  Class,
  Language,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

// Re-export encounter types
export type {
  DungeonStartRequest,
  DungeonStartResponse,
  EntityPlacement,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

export type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';

export { GridType } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
