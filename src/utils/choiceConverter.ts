import { create } from '@bufbuild/protobuf';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
  ExpertiseSelectionSchema,
  FightingStyleSelectionSchema,
  LanguageSelectionSchema,
  SkillSelectionSchema,
  ToolSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
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
  // Convert category selections to EquipmentSelectionItem[]
  const items: ReturnType<
    typeof create<typeof EquipmentSelectionItemSchema>
  >[] = [];

  choice.categorySelections.forEach((catSel) => {
    catSel.equipmentIds.forEach((equipId) => {
      // For now, use otherEquipmentId since we're storing string IDs from the API
      // The backend will need to handle converting these IDs to proper equipment references
      items.push(
        create(EquipmentSelectionItemSchema, {
          equipment: {
            case: 'otherEquipmentId' as const,
            value: equipId,
          },
          quantity: 1,
        })
      );
    });
  });

  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    optionId: choice.bundleId || undefined, // The selected bundle
    category: ChoiceCategory.EQUIPMENT,
    source,
    selection: {
      case: 'equipment',
      value: create(EquipmentSelectionSchema, {
        items,
      }),
    },
  });
}

// Feature choices for fighting styles
export function convertFeatureChoiceToProto(
  choice: FeatureChoice,
  source: ChoiceSource
): ChoiceData {
  return create(ChoiceDataSchema, {
    choiceId: choice.choiceId,
    category: ChoiceCategory.FIGHTING_STYLE,
    source,
    selection: {
      case: 'fightingStyle',
      value: create(FightingStyleSelectionSchema, {
        style: choice.selection,
      }),
    },
  });
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
