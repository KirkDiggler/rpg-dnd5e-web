import {
  AbilityDisplay,
  ConditionDisplay,
  FeatureDisplay,
  SpellDisplay,
  WeaponDisplay,
  type DisplayMode,
} from '@/components/enums';
import type { DamageComponent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import React from 'react';

export interface DamageSourceBadgeProps {
  /**
   * DamageComponent from the API - contains both sourceRef (new) and source (deprecated string)
   */
  component: DamageComponent;
  mode?: DisplayMode;
  className?: string;
  /**
   * Optional weapon name override for display (e.g., "Longsword" instead of generic "Weapon")
   */
  weaponName?: string;
}

export const DamageSourceBadge: React.FC<DamageSourceBadgeProps> = ({
  component,
  mode = 'full',
  className,
  weaponName,
}) => {
  // Prefer the new type-safe sourceRef if available
  const sourceRef = component.sourceRef;

  if (sourceRef?.source.case === 'weapon') {
    return (
      <WeaponDisplay
        weapon={sourceRef.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (sourceRef?.source.case === 'ability') {
    return (
      <AbilityDisplay
        ability={sourceRef.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (sourceRef?.source.case === 'condition') {
    return (
      <ConditionDisplay
        condition={sourceRef.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (sourceRef?.source.case === 'feature') {
    return (
      <FeatureDisplay
        feature={sourceRef.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (sourceRef?.source.case === 'spell') {
    return (
      <SpellDisplay
        spell={sourceRef.source.value}
        mode={mode}
        className={className}
      />
    );
  }

  // Fallback to deprecated string-based source for backwards compatibility
  return (
    <span className={className} title={component.source}>
      {formatLegacySource(component.source, weaponName)}
    </span>
  );
};

/**
 * Format legacy string-based source for display
 * This provides backwards compatibility until all APIs send sourceRef
 */
function formatLegacySource(source: string, weaponName?: string): string {
  // Handle common legacy sources
  if (source === 'weapon') {
    return weaponName ? `⚔️ ${weaponName}` : '⚔️ Weapon';
  }
  if (source === 'ability') {
    return '💪 Ability';
  }

  // Format namespaced sources like "dnd5e:conditions:rage" -> "Rage"
  const parts = source.split(':');
  const name = parts[parts.length - 1];
  const formatted = name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return `✨ ${formatted}`;
}
