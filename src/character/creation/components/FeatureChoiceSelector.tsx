import type { FeatureInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { UnifiedChoiceSelector } from '../../../components/UnifiedChoiceSelector';

interface FeatureChoiceSelectorProps {
  feature: FeatureInfo;
  currentSelections: Record<string, string[]>; // choiceId -> selections
  onSelect: (featureId: string, choiceId: string, selections: string[]) => void;
}

export function FeatureChoiceSelector({
  feature,
  currentSelections,
  onSelect,
}: FeatureChoiceSelectorProps) {
  if (!feature.choices || feature.choices.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {feature.choices.map((choice) => (
        <div key={choice.id} style={{ marginBottom: '12px' }}>
          <UnifiedChoiceSelector
            choice={choice}
            currentSelections={currentSelections[choice.id] || []}
            onSelectionChange={(choiceId, selections) => {
              onSelect(feature.id, choiceId, selections);
            }}
          />
        </div>
      ))}
    </div>
  );
}
