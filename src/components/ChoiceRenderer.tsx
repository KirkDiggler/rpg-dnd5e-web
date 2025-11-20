import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { EquipmentBundleChoice } from './choices/EquipmentBundleChoice';
import { SimpleChoice } from './choices/SimpleChoice';
import { SkillChoice } from './choices/SkillChoice';
import { ToolChoice } from './choices/ToolChoice';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectionValue = any; // Generic type that can be Language[] | Skill[] | string[] based on choice type

interface ChoiceRendererProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selections: SelectionValue) => void; // Generic handler, will be Language[] | Skill[] | string[] based on choice type
  currentSelections: SelectionValue; // Will be Language[] | Skill[] | string[] etc based on choice type
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
  // Check if it's an equipment choice with bundles (the special case we handle properly)
  if (
    choice.choiceType === ChoiceCategory.EQUIPMENT &&
    choice.options?.case === 'equipmentOptions'
  ) {
    return (
      <EquipmentBundleChoice
        choice={choice}
        onSelectionChange={(bundleId, categorySelections) => {
          // Convert EquipmentBundleChoice format back to standard format
          const selections: string[] = [];
          if (bundleId) selections.push(bundleId);
          categorySelections.forEach((equipment, index) => {
            equipment.forEach((item) =>
              selections.push(`cat${index}:${item.id}`)
            );
          });
          onSelectionChange(choice.id, selections);
        }}
      />
    );
  }

  // Skills use their dedicated component
  if (choice.choiceType === ChoiceCategory.SKILLS) {
    return (
      <SkillChoice
        choice={choice}
        onSelectionChange={onSelectionChange}
        currentSelections={currentSelections}
      />
    );
  }

  // Tools still use their dedicated component
  if (choice.choiceType === ChoiceCategory.TOOLS) {
    return (
      <ToolChoice
        choice={choice}
        onSelectionChange={onSelectionChange}
        currentSelections={currentSelections}
      />
    );
  }

  // Everything else uses the simple fallback
  return (
    <SimpleChoice
      choice={choice}
      onSelectionChange={onSelectionChange}
      currentSelections={currentSelections}
    />
  );
}
