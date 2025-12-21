import {
  hasUsageData,
  parseFeatureData,
  type FeatureData,
} from '@/types/featureData';
import { getFeatureDisplay } from '@/utils/enumDisplays';
import { isFeatureActiveByCondition } from '@/utils/featureConditionMapping';
import type { CharacterFeature } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { Condition } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { FeatureId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from './features.module.css';

export interface FeatureBadgeProps {
  feature: CharacterFeature;
  /** Active conditions to check if feature is currently active */
  activeConditions?: readonly Condition[];
}

/**
 * FeatureBadge - Displays a single character feature as a badge
 *
 * Uses FeatureId enum for display when available, falls back to name.
 * Shows active state if the feature's corresponding condition is active.
 */
export function FeatureBadge({
  feature,
  activeConditions = [],
}: FeatureBadgeProps) {
  // Use enum-based display if feature has a proper ID
  const hasEnumId = feature.id !== FeatureId.UNSPECIFIED;
  const enumDisplay = hasEnumId ? getFeatureDisplay(feature.id) : null;

  // Use enum display title/icon or fall back to feature name
  const displayName = enumDisplay?.title || feature.name;
  const icon = enumDisplay?.icon || getDefaultIcon(feature.source);

  // Check if this feature is currently active via its corresponding condition
  const isActive = isFeatureActiveByCondition(feature.id, activeConditions);

  // Parse feature data for usage display
  const data = parseFeatureData(feature.featureData);
  const subtitle = getSubtitle(data);

  // Determine category from source for styling
  const categoryClass = getCategoryClass(feature.source);

  return (
    <div
      className={`${styles.featureBadge} ${categoryClass} ${isActive ? styles.featureActive : ''}`}
      title={getTooltip(feature, data, isActive)}
    >
      <span className={styles.conditionIcon}>{icon}</span>
      <span className={styles.conditionName}>{displayName}</span>
      {subtitle && <span className={styles.conditionSubtitle}>{subtitle}</span>}
    </div>
  );
}

/**
 * Get default icon based on feature source
 */
function getDefaultIcon(source: string): string {
  if (source.includes('classes:barbarian')) return '💢';
  if (source.includes('classes:fighter')) return '⚔️';
  if (source.includes('classes:rogue')) return '🗡️';
  if (source.includes('classes:monk')) return '👊';
  if (source.includes('classes:paladin')) return '🛡️';
  if (source.includes('classes:cleric')) return '✨';
  if (source.includes('classes')) return '⭐';
  if (source.includes('races')) return '🧬';
  if (source.includes('backgrounds')) return '📜';
  return '📋';
}

/**
 * Get CSS class for the feature source category
 */
function getCategoryClass(source: string): string {
  if (source.includes('classes')) return styles.featureClass;
  if (source.includes('races')) return styles.featureRacial;
  if (source.includes('backgrounds')) return styles.featureBackground;
  return styles.featureDefault;
}

/**
 * Get a compact subtitle for displaying key stats
 */
function getSubtitle(data: FeatureData | undefined): string | null {
  if (!data) return null;

  if (hasUsageData(data)) {
    return `${data.uses}/${data.max_uses}`;
  }

  return null;
}

/**
 * Generate tooltip for the feature
 */
function getTooltip(
  feature: CharacterFeature,
  data: FeatureData | undefined,
  isActive: boolean
): string {
  const parts: string[] = [feature.name];

  if (feature.description) {
    parts.push(feature.description);
  }

  if (isActive) {
    parts.push('(Active)');
  }

  if (data && hasUsageData(data)) {
    parts.push(`Uses: ${data.uses}/${data.max_uses}`);
  }

  if (feature.level > 0) {
    parts.push(`Gained at level ${feature.level}`);
  }

  return parts.join(' - ');
}
