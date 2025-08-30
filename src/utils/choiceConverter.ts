import { create } from '@bufbuild/protobuf';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  EquipmentListSchema,
  ExpertiseListSchema,
  LanguageListSchema,
  SkillListSchema,
  TraitListSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  EquipmentChoice,
  FeatureChoice,
  LanguageChoice,
  SkillChoice,
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
      value: create(SkillListSchema, {
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
      value: create(LanguageListSchema, {
        languages: choice.languages,
      }),
    },
  });
}

export function convertEquipmentChoiceToProto(
  choice: EquipmentChoice,
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.EQUIPMENT,
    source,
    selection: {
      case: 'equipment',
      value: create(EquipmentListSchema, {
        items: choice.items,
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
  // Fighting styles use the 'fightingStyle' selection case (simple string)
  // The server expects just the style name without the "feature_" prefix
  // Convert "feature_archery" -> "archery", "feature_defense" -> "defense", etc.
  const cleanValue = choice.selection.replace(/^feature_/, '');

  const result = create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.FIGHTING_STYLE, // Category 11
    source,
    selection: {
      case: 'fightingStyle',
      value: cleanValue, // e.g., "archery" or "defense"
    },
  });

  return result;
}

export function convertExpertiseChoiceToProto(
  choiceId: string,
  selectedSkills: string[],
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId,
    category: ChoiceCategory.EXPERTISE,
    source,
    selection: {
      case: 'expertise',
      value: create(ExpertiseListSchema, {
        skills: selectedSkills,
      }),
    },
  });
}

export function convertTraitChoiceToProto(
  choiceId: string,
  selectedTraits: string[],
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId,
    category: ChoiceCategory.TRAITS,
    source,
    selection: {
      case: 'traits',
      value: create(TraitListSchema, {
        traits: selectedTraits,
      }),
    },
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
    items: data.selection.value.items || [],
  };
}
