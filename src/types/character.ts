import type {
  Choice,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export interface RaceSelectionState {
  selectedRace?: RaceInfo;
  languageChoices: Record<string, string[]>; // Choice ID -> selected options
  proficiencyChoices: Record<string, string[]>; // Choice ID -> selected options
  traitChoices: Record<string, string>; // Trait name -> selected option
}

export interface ChoiceValidation {
  isValid: boolean;
  errors: string[];
}

// DEPRECATED: This validation function uses old Choice properties
// TODO: Update to work with new Choice system (issue #93)
// @ts-expect-error - Using old Choice properties
export function validateChoice(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _choice: Choice,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _selected: string[]
): ChoiceValidation {
  // Temporarily disabled until migration to new Choice system
  return {
    isValid: true,
    errors: [],
  };
}

// DEPRECATED: This uses old Choice.type property
// TODO: Update to work with new Choice system (issue #93)
// @ts-expect-error - Using old Choice.type property
export function getChoiceKey(_choice: Choice, index: number): string {
  // Use index as fallback until migration
  return `choice_${index}`;
}
