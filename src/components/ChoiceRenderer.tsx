import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { EquipmentChoice } from './choices/EquipmentChoice';
import { GenericChoice } from './choices/GenericChoice';
import { LanguageChoice } from './choices/LanguageChoice';
import { SkillChoice } from './choices/SkillChoice';
import { SpellChoice } from './choices/SpellChoice';

interface ChoiceRendererProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

/**
 * Main choice renderer that routes to specific choice type components
 * based on the choice rendering guide.
 */
export function ChoiceRenderer({
  choice,
  onSelectionChange,
  currentSelections,
}: ChoiceRendererProps) {
  switch (choice.choiceType) {
    case ChoiceType.SKILL:
      return (
        <SkillChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );

    case ChoiceType.EQUIPMENT:
      return (
        <EquipmentChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );

    case ChoiceType.SPELL:
      return (
        <SpellChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );

    case ChoiceType.LANGUAGE:
      return (
        <LanguageChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );

    case ChoiceType.TOOL:
    case ChoiceType.WEAPON_PROFICIENCY:
    case ChoiceType.ARMOR_PROFICIENCY:
      // These are proficiency types that can be handled generically for now
      return (
        <GenericChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );

    default:
      // Fallback to generic choice renderer
      return (
        <GenericChoice
          choice={choice}
          onSelectionChange={onSelectionChange}
          currentSelections={currentSelections}
        />
      );
  }
}
