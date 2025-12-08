import {
  AbilityDisplay,
  ConditionDisplay,
  FeatureDisplay,
  SpellDisplay,
  WeaponDisplay,
  type DisplayMode,
} from '@/components/enums';
import type { SourceRef } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import React from 'react';

interface DamageSourceBadgeProps {
  source: SourceRef;
  mode?: DisplayMode;
  className?: string;
}

export const DamageSourceBadge: React.FC<DamageSourceBadgeProps> = ({
  source,
  mode = 'full',
  className,
}) => {
  // Check which oneof case is set
  // SourceRef has: weapon, ability, condition, feature, spell

  if (source.source.case === 'weapon') {
    return (
      <WeaponDisplay
        weapon={source.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (source.source.case === 'ability') {
    return (
      <AbilityDisplay
        ability={source.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (source.source.case === 'condition') {
    return (
      <ConditionDisplay
        condition={source.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (source.source.case === 'feature') {
    return (
      <FeatureDisplay
        feature={source.source.value}
        mode={mode}
        className={className}
      />
    );
  }
  if (source.source.case === 'spell') {
    return (
      <SpellDisplay
        spell={source.source.value}
        mode={mode}
        className={className}
      />
    );
  }

  return <span className={className}>Unknown Source</span>;
};
