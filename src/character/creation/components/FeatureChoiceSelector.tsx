import type { FeatureInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { UnifiedChoiceSelector } from '../../../components/UnifiedChoiceSelector';

interface FeatureChoiceSelectorProps {
  feature: FeatureInfo;
  onSelect: (featureId: string, choiceId: string, selections: string[]) => void;
  currentSelections?: Record<string, string[]>;
}

export function FeatureChoiceSelector({
  feature,
  onSelect,
  currentSelections = {},
}: FeatureChoiceSelectorProps) {
  // Check if feature has choices
  if (!feature.choices || feature.choices.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '12px' }}>
      {feature.choices.map((choice) => (
        <UnifiedChoiceSelector
          key={choice.id}
          choice={choice}
          currentSelections={currentSelections[choice.id] || []}
          onSelectionChange={(choiceId, selections) => {
            onSelect(feature.id, choiceId, selections);
          }}
        />
      ))}
    </div>
  );
}
