import type { DamageComponent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import React from 'react';
import { DamageSourceBadge } from './DamageSourceBadge';

interface DamageBreakdownProps {
  components: DamageComponent[];
  total?: number;
  className?: string;
}

export const DamageBreakdown: React.FC<DamageBreakdownProps> = ({
  components,
  total,
  className,
}) => {
  // Calculate total from components if not provided
  const calculatedTotal =
    total ??
    components.reduce((sum, comp) => {
      const diceSum = comp.finalDiceRolls.reduce((a, b) => a + b, 0);
      return sum + diceSum + comp.flatBonus;
    }, 0);

  return (
    <div className={className}>
      <div className="damage-components">
        {components.map((comp, i) => (
          <div key={i} className="damage-component flex justify-between">
            {comp.sourceRef && (
              <DamageSourceBadge source={comp.sourceRef} mode="full" />
            )}
            <span className="damage-value">
              {comp.isCritical && '⚡'}+
              {comp.flatBonus + comp.finalDiceRolls.reduce((a, b) => a + b, 0)}
            </span>
          </div>
        ))}
      </div>
      <div className="damage-total border-t mt-2 pt-2 font-bold">
        Total: {calculatedTotal}
      </div>
    </div>
  );
};
