import { getAbilityDisplay } from '@/utils/enumDisplays';
import { Ability } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import React from 'react';
import type { DisplayMode } from './types';

interface AbilityDisplayProps {
  ability: Ability;
  mode?: DisplayMode;
  className?: string;
}

export const AbilityDisplay: React.FC<AbilityDisplayProps> = ({
  ability,
  mode = 'full',
  className,
}) => {
  const { title, icon, description } = getAbilityDisplay(ability);

  switch (mode) {
    case 'title':
      return <span className={className}>{title}</span>;
    case 'icon':
      return (
        <span className={className} title={title} role="img" aria-label={title}>
          {icon}
        </span>
      );
    case 'compact':
      return (
        <span
          className={className}
          title={description || title}
          role="img"
          aria-label={title}
        >
          {icon}
        </span>
      );
    case 'full':
    default:
      return (
        <span className={className}>
          {icon} {title}
        </span>
      );
  }
};
