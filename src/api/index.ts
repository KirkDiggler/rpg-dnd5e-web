// Re-export the client
export { characterClient } from './client';

// Re-export all hooks
export {
  useCreateDraft,
  useDeleteCharacter,
  useDeleteDraft,
  useFinalizeDraft,
  useGetCharacter,
  useGetDraft,
  useListCharacters,
  useListClasses,
  useListDrafts,
  useListEquipmentByType,
  useListRaces,
  useUpdateDraftAbilityScores,
  useUpdateDraftBackground,
  useUpdateDraftClass,
  useUpdateDraftName,
  useUpdateDraftRace,
  useUpdateDraftSkills,
  useValidateDraft,
} from './hooks';

// Re-export commonly used types from protos
export type {
  AbilityScores,
  Character,
  CharacterDraft,
  CreationProgress,
  CreationStep,
  Equipment,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export {
  Ability,
  Alignment,
  Background,
  Class,
  EquipmentType,
  Language,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
