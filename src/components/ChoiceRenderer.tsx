import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  getFightingStyleInfo,
  getLanguageInfo,
  getSkillAbility,
  getSkillInfo,
  getToolInfo,
} from '../utils/enumRegistry';
import { EnumChoice } from './choices/EnumChoice';
import { EquipmentBundleChoice } from './choices/EquipmentBundleChoice';
import { SimpleChoice } from './choices/SimpleChoice';

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
    // Extract initial bundle ID from currentSelections (first element is the bundleId)
    // Format: [bundleId, 'cat0:itemId:name', 'cat0:itemId2:name2', ...]
    const initialBundleId =
      Array.isArray(currentSelections) && currentSelections.length > 0
        ? currentSelections[0]
        : null;
    // Extract item IDs from category selections (skip first element which is bundleId)
    const initialItemIds =
      Array.isArray(currentSelections) && currentSelections.length > 1
        ? currentSelections.slice(1).map((sel: string) => {
            // Format is "cat{index}:{id}:{name}" - extract the id
            const parts = sel.split(':');
            return parts.length >= 2 ? parts[1] : sel;
          })
        : undefined;
    return (
      <EquipmentBundleChoice
        choice={choice}
        initialBundleId={initialBundleId}
        initialItemIds={initialItemIds}
        onSelectionChange={(bundleId, categorySelections) => {
          // Convert EquipmentBundleChoice format back to standard format
          // Store equipment selections with both id and name: "cat0:id:name"
          const selections: string[] = [];
          if (bundleId) selections.push(bundleId);
          categorySelections.forEach((equipment, index) => {
            equipment.forEach((item) =>
              // Store as "cat{index}:{id}:{name}" so we can extract name later
              selections.push(`cat${index}:${item.id}:${item.name}`)
            );
          });
          onSelectionChange(choice.id, selections);
        }}
      />
    );
  }

  // Languages - use EnumChoice
  if (
    choice.choiceType === ChoiceCategory.LANGUAGES &&
    choice.options?.case === 'languageOptions'
  ) {
    return (
      <EnumChoice
        choice={choice}
        available={choice.options.value.available}
        currentSelections={currentSelections}
        getDisplayInfo={getLanguageInfo}
        onSelectionChange={onSelectionChange}
      />
    );
  }

  // Skills - use EnumChoice with grouping
  if (
    choice.choiceType === ChoiceCategory.SKILLS &&
    choice.options?.case === 'skillOptions'
  ) {
    return (
      <EnumChoice
        choice={choice}
        available={choice.options.value.available}
        currentSelections={currentSelections}
        getDisplayInfo={getSkillInfo}
        getGroup={getSkillAbility}
        groupOrder={[
          'Strength',
          'Dexterity',
          'Constitution',
          'Intelligence',
          'Wisdom',
          'Charisma',
        ]}
        onSelectionChange={onSelectionChange}
      />
    );
  }

  // Tools - use EnumChoice
  if (
    choice.choiceType === ChoiceCategory.TOOLS &&
    choice.options?.case === 'toolOptions'
  ) {
    return (
      <EnumChoice
        choice={choice}
        available={choice.options.value.available}
        currentSelections={currentSelections}
        getDisplayInfo={getToolInfo}
        onSelectionChange={onSelectionChange}
      />
    );
  }

  // Fighting Styles - use EnumChoice
  if (
    choice.choiceType === ChoiceCategory.FIGHTING_STYLE &&
    choice.options?.case === 'fightingStyleOptions'
  ) {
    return (
      <EnumChoice
        choice={choice}
        available={choice.options.value.available}
        currentSelections={currentSelections}
        getDisplayInfo={getFightingStyleInfo}
        onSelectionChange={onSelectionChange}
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
