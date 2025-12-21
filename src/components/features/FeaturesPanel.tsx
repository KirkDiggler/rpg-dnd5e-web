import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { FeatureBadge } from './FeatureBadge';
import styles from './features.module.css';

export interface FeaturesPanelProps {
  /** Character whose features to display */
  character: Character;
  /** Whether to show a header label */
  showHeader?: boolean;
  /** Custom header text */
  headerText?: string;
}

/**
 * FeaturesPanel - Displays all character features as badges
 *
 * Similar to ConditionsDisplay but for character features.
 * Uses FeatureId enums when available for proper icons/titles.
 * Shows active state for features that apply conditions (e.g., Rage -> Raging).
 *
 * Features are displayed as compact badges organized by source category:
 * - Class features (purple)
 * - Racial features (pink)
 * - Background features (orange)
 */
export function FeaturesPanel({
  character,
  showHeader = false,
  headerText = 'Features',
}: FeaturesPanelProps) {
  const features = character.features || [];
  const activeConditions = character.activeConditions || [];

  if (features.length === 0) {
    return null;
  }

  return (
    <div className={styles.featuresPanel}>
      {showHeader && (
        <div className={styles.featuresPanelHeader}>{headerText}</div>
      )}
      <div className={styles.featuresGrid}>
        {features.map((feature, index) => (
          <FeatureBadge
            key={feature.name || index}
            feature={feature}
            activeConditions={activeConditions}
          />
        ))}
      </div>
    </div>
  );
}
