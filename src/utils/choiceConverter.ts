import { create } from '@bufbuild/protobuf';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  EquipmentSelectionSchema,
  ExpertiseSelectionSchema,
  FightingStyleSelectionSchema,
  LanguageSelectionSchema,
  SkillSelectionSchema,
  ToolSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  FightingStyle,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type {
  EquipmentChoice,
  FeatureChoice,
  LanguageChoice,
  SkillChoice,
  ToolChoice,
} from '../types/choices';

/**
 * Clean converters from structured choices to proto format.
 * No string manipulation, no guessing - just direct enum usage.
 */

export function convertSkillChoiceToProto(
  choice: SkillChoice,
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.SKILLS,
    source,
    selection: {
      case: 'skills',
      value: create(SkillSelectionSchema, {
        skills: choice.skills,
      }),
    },
  });
}

export function convertLanguageChoiceToProto(
  choice: LanguageChoice,
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.LANGUAGES,
    source,
    selection: {
      case: 'languages',
      value: create(LanguageSelectionSchema, {
        languages: choice.languages,
      }),
    },
  });
}

export function convertToolChoiceToProto(
  choice: ToolChoice,
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.TOOLS,
    source,
    selection: {
      case: 'tools',
      value: create(ToolSelectionSchema, {
        tools: choice.tools,
      }),
    },
  });
}

export function convertEquipmentChoiceToProto(
  choice: EquipmentChoice,
  source: ChoiceSource
): ChoiceData {
  // Use bundleId as optionId if available, otherwise leave empty
  // The items array contains selection strings from the UI
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    optionId: choice.bundleId || undefined, // The selected bundle
    category: ChoiceCategory.EQUIPMENT,
    source,
    selection: {
      case: 'equipment',
      value: create(EquipmentSelectionSchema, {
        items: [], // The backend processes the bundleId to know what was selected
      }),
    },
  });
}

// Feature choices will need to be implemented once we have the proper category
// For now, features might map to FIGHTING_STYLE or other specific categories
export function convertFeatureChoiceToProto(
  choice: FeatureChoice,
  source: ChoiceSource
): ChoiceData {
  // Fighting styles use the 'fightingStyle' selection case
  // Convert "feature_archery" -> "archery", "feature_defense" -> "defense", etc.
  const cleanValue = choice.selection.replace(/^feature_/, '');

  // Convert string to FightingStyle enum
  const styleEnum = getFightingStyleEnum(cleanValue);

  const result = create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.FIGHTING_STYLE, // Category 11
    source,
    selection: {
      case: 'fightingStyle',
      value: create(FightingStyleSelectionSchema, {
        style: styleEnum,
      }),
    },
  });

  return result;
}

// Helper to convert fighting style string to enum
function getFightingStyleEnum(styleName: string): FightingStyle {
  const styleMap: Record<string, FightingStyle> = {
    archery: FightingStyle.ARCHERY,
    defense: FightingStyle.DEFENSE,
    dueling: FightingStyle.DUELING,
    great_weapon_fighting: FightingStyle.GREAT_WEAPON_FIGHTING,
    'great-weapon-fighting': FightingStyle.GREAT_WEAPON_FIGHTING,
    protection: FightingStyle.PROTECTION,
    two_weapon_fighting: FightingStyle.TWO_WEAPON_FIGHTING,
    'two-weapon-fighting': FightingStyle.TWO_WEAPON_FIGHTING,
  };

  const lowerName = styleName.toLowerCase();
  return styleMap[lowerName] || FightingStyle.UNSPECIFIED;
}

export function convertExpertiseChoiceToProto(
  choiceId: string,
  selectedSkills: string[],
  source: ChoiceSource
): ChoiceData {
  // Convert string skill names to Skill enum values
  const skillEnums = selectedSkills
    .map((skillStr) => {
      // Try to find the enum value for this skill string
      const enumValue = Object.entries(Skill).find(
        ([key, val]) =>
          typeof val === 'number' &&
          key.toLowerCase() === skillStr.toLowerCase().replace(/[^a-z]/g, '')
      )?.[1] as Skill | undefined;
      return enumValue || Skill.UNSPECIFIED;
    })
    .filter((s) => s !== Skill.UNSPECIFIED);

  return create(ChoiceDataSchema, {
    choiceId,
    category: ChoiceCategory.EXPERTISE,
    source,
    selection: {
      case: 'expertise',
      value: create(ExpertiseSelectionSchema, {
        skills: skillEnums,
      }),
    },
  });
}

export function convertTraitChoiceToProto(
  choiceId: string,
  selectedTraits: string[],
  source: ChoiceSource
): ChoiceData {
  // TODO: TraitSelection type doesn't exist in v0.1.49 yet
  // For now, create a minimal ChoiceData without selection
  // This will need to be updated when TraitSelection is added to protos
  return create(ChoiceDataSchema, {
    choiceId,
    category: ChoiceCategory.TRAITS,
    source,
    optionId: selectedTraits[0] || '', // Use first trait as optionId temporarily
    // selection field omitted until TraitSelection type is available
  });
}

// Convert from proto back to structured format (for loading drafts)
export function convertProtoToSkillChoice(
  data: ChoiceData
): SkillChoice | null {
  if (data.selection?.case !== 'skills') return null;

  return {
    choiceId: data.choiceId,
    skills: data.selection.value.skills || [],
  };
}

export function convertProtoToLanguageChoice(
  data: ChoiceData
): LanguageChoice | null {
  if (data.selection?.case !== 'languages') return null;

  return {
    choiceId: data.choiceId,
    languages: data.selection.value.languages || [],
  };
}

export function convertProtoToEquipmentChoice(
  data: ChoiceData
): EquipmentChoice | null {
  if (data.selection?.case !== 'equipment') return null;

  return {
    choiceId: data.choiceId,
    bundleId: data.optionId || '', // optionId holds the selected bundle
    categorySelections: [], // Equipment items would need to be parsed from selection.value.items if needed
  };
}
