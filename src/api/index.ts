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
export { useDungeonStart } from './encounterHooks';

// Re-export commonly used types from protos
export type {
  AbilityScores,
  Character,
  CharacterDraft,
  CreationProgress,
  CreationStep,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

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
