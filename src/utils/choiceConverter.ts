import { create } from '@bufbuild/protobuf';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  EquipmentListSchema,
  LanguageListSchema,
  SkillListSchema,
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
  // Fighting styles use the 'name' selection case (simple string)
  // Unlike skills/equipment which have their own schemas, name is just a string
  const result = create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.FIGHTING_STYLE, // Category 11
    source,
    selection: {
      case: 'name',
      value: choice.selection, // e.g., "feature_fighting_style:_dueling"
    },
  });

  return result;
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
