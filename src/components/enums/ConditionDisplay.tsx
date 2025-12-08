import { getConditionDisplay } from '@/utils/enumDisplays';
import { ConditionId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import React from 'react';

export type DisplayMode = 'title' | 'icon' | 'full' | 'compact';

interface ConditionDisplayProps {
  condition: ConditionId;
  mode?: DisplayMode;
  className?: string;
}

export const ConditionDisplay: React.FC<ConditionDisplayProps> = ({
  condition,
  mode = 'full',
  className,
}) => {
  const { title, icon, description } = getConditionDisplay(condition);

  switch (mode) {
    case 'title':
      return <span className={className}>{title}</span>;
    case 'icon':
      return (
        <span className={className} title={title}>
          {icon}
        </span>
      );
    case 'compact':
      return (
        <span className={className} title={description || title}>
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
