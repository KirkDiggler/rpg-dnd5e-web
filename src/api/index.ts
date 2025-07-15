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
  useListDrafts,
  useUpdateDraftAbilityScores,
  useUpdateDraftBackground,
  useUpdateDraftClass,
  useUpdateDraftName,
  useUpdateDraftRace,
  useUpdateDraftSkills,
  useValidateDraft,
} from './hooks';

// Re-export commonly used types from protos
// @ts-expect-error - CI uses stub files
export type {
  AbilityScores,
  Character,
  CharacterDraft,
  CreationProgress,
  CreationStep,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

// @ts-expect-error - CI uses stub files
export {
  Ability,
  Alignment,
  Background,
  Class,
  Language,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
