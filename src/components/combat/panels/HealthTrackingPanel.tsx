import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { CombatPanelBase } from '../CombatPanelBase';
import { getPanelPositionClasses } from '../utils';

interface HealthTrackingPanelProps {
  combatState: CombatState;
  selectedCharacters: Character[];
  isVisible: boolean;
  onToggle: () => void;
}

/**
 * HealthTrackingPanel - Shows HP status for all characters.
 * Example of extending the combat panel system for health management.
 */
export function HealthTrackingPanel({
  combatState,
  selectedCharacters,
  isVisible,
  onToggle,
}: HealthTrackingPanelProps) {
  if (!isVisible) {
    // Show collapsed button
    return (
      <div
        className={getPanelPositionClasses('bottom-left')}
        style={{ zIndex: 900 }}
      >
        <button
          onClick={onToggle}
          className="bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-slate-200 hover:text-white transition-colors"
        >
          💚 Health
        </button>
      </div>
    );
  }

  return (
    <div
      className={getPanelPositionClasses('bottom-left')}
      style={{ zIndex: 900 }}
    >
      <CombatPanelBase title="💚 Health Status" onClose={onToggle}>
        <div className="space-y-3">
          {selectedCharacters.map((character) => {
            const currentHP = character.currentHitPoints || 0;
            const maxHP = character.combatStats?.hitPointMaximum || 1;
            const hpPercentage = (currentHP / maxHP) * 100;
            const isCurrentTurn =
              combatState.currentTurn?.entityId === character.id;

            return (
              <div
                key={character.id}
                className={`p-2 rounded border ${
                  isCurrentTurn
                    ? 'border-blue-400 bg-blue-900/20'
                    : 'border-slate-600 bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-200">
                    {character.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    AC {character.combatStats?.armorClass || 10}
                  </span>
                </div>

                <div className="mb-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Health</span>
                    <span className={getHealthColor(hpPercentage)}>
                      {currentHP}/{maxHP}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${getHealthBarColor(hpPercentage)}`}
                      style={{ width: `${hpPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Quick action buttons for healers */}
                <div className="flex gap-1 mt-2">
                  <button
                    className="flex-1 text-xs py-1 px-2 bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                    onClick={() => {
                      // In real implementation, this would trigger a heal action
                      console.log('Heal', character.name);
                    }}
                  >
                    Heal
                  </button>
                  <button
                    className="flex-1 text-xs py-1 px-2 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                    onClick={() => {
                      // In real implementation, this would show spell options
                      console.log('Spell heal', character.name);
                    }}
                  >
                    Spell
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CombatPanelBase>
    </div>
  );
}

function getHealthColor(percentage: number): string {
  if (percentage <= 25) return 'text-red-400';
  if (percentage <= 50) return 'text-yellow-400';
  return 'text-green-400';
}

function getHealthBarColor(percentage: number): string {
  if (percentage <= 25) return 'bg-red-500';
  if (percentage <= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}
