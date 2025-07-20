import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { UnifiedChoiceSelector } from './UnifiedChoiceSelector';
import type { ChoiceSelections } from './hooks/useChoiceSelection';

export interface ProficiencyChoicesProps {
  choices: Choice[];
  selections?: ChoiceSelections;
  onSelectionsChange?: (selections: ChoiceSelections) => void;
  disabled?: boolean;
}

/**
 * Wrapper component for skill and tool proficiency choices
 */
export function ProficiencyChoices({
  choices,
  selections,
  onSelectionsChange,
  disabled,
}: ProficiencyChoicesProps) {
  // Filter for both skill and tool proficiencies
  const proficiencyChoices = choices.filter(
    (choice) => 
      choice.choiceType === ChoiceType.SKILL || 
      choice.choiceType === ChoiceType.TOOL
  );

  if (proficiencyChoices.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Proficiency Choices</h3>
      <UnifiedChoiceSelector
        choices={proficiencyChoices}
        selections={selections}
        onSelectionsChange={onSelectionsChange}
        disabled={disabled}
      />
    </div>
  );
}