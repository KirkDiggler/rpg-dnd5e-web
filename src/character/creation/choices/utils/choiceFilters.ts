import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

/**
 * Filter choices by type
 */
export function filterChoicesByType(
  choices: Choice[],
  type: ChoiceType
): Choice[] {
  return choices.filter((choice) => choice.choiceType === type);
}

/**
 * Get all equipment choices
 */
export function getEquipmentChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.EQUIPMENT);
}

/**
 * Get all skill choices
 */
export function getSkillChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.SKILL);
}

/**
 * Get all tool proficiency choices
 */
export function getToolChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.TOOL);
}

/**
 * Get all language choices
 */
export function getLanguageChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.LANGUAGE);
}

/**
 * Get all weapon proficiency choices
 */
export function getWeaponProficiencyChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.WEAPON);
}

/**
 * Get all armor proficiency choices
 */
export function getArmorProficiencyChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.ARMOR);
}

/**
 * Get all feat choices
 */
export function getFeatChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.FEAT);
}

/**
 * Get all ability score improvement choices
 */
export function getAbilityScoreChoices(choices: Choice[]): Choice[] {
  return filterChoicesByType(choices, ChoiceType.ABILITY_SCORE);
}

/**
 * Group choices by type
 */
export function groupChoicesByType(
  choices: Choice[]
): Record<ChoiceType, Choice[]> {
  const grouped: Record<ChoiceType, Choice[]> = {} as Record<
    ChoiceType,
    Choice[]
  >;

  choices.forEach((choice) => {
    if (!grouped[choice.choiceType]) {
      grouped[choice.choiceType] = [];
    }
    grouped[choice.choiceType].push(choice);
  });

  return grouped;
}