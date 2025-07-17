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

export function validateChoice(
  choice: Choice,
  selected: string[]
): ChoiceValidation {
  const errors: string[] = [];

  if (selected.length !== choice.choose) {
    errors.push(`You must choose exactly ${choice.choose} ${choice.type}(s)`);
  }

  // Validate all selected options are in the available options
  const invalidOptions = selected.filter(
    (opt) => !choice.options.includes(opt)
  );
  if (invalidOptions.length > 0) {
    errors.push(`Invalid options selected: ${invalidOptions.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getChoiceKey(choice: Choice, index: number): string {
  return `${choice.type}_${index}`;
}
