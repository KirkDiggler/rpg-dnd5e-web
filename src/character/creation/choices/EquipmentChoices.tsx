import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { UnifiedChoiceSelector } from './UnifiedChoiceSelector';
import type { ChoiceSelections } from './hooks/useChoiceSelection';

export interface EquipmentChoicesProps {
  choices: Choice[];
  selections?: ChoiceSelections;
  onSelectionsChange?: (selections: ChoiceSelections) => void;
  disabled?: boolean;
}

/**
 * Wrapper component specifically for equipment choices
 */
export function EquipmentChoices({
  choices,
  selections,
  onSelectionsChange,
  disabled,
}: EquipmentChoicesProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Equipment Choices</h3>
      <UnifiedChoiceSelector
        choices={choices}
        choiceType={ChoiceType.EQUIPMENT}
        selections={selections}
        onSelectionsChange={onSelectionsChange}
        disabled={disabled}
      />
    </div>
  );
}
