import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { CombatPanelBase } from '../CombatPanelBase';
import { getPanelPositionClasses } from '../utils';

interface DebugPanelProps {
  combatState: CombatState;
  selectedCharacters: Character[];
  isVisible: boolean;
  onClose: () => void;
}

/**
 * DebugPanel - Shows technical information during development.
 * Example of extending the combat panel system for debugging features.
 */
export function DebugPanel({
  combatState,
  selectedCharacters,
  isVisible,
  onClose,
}: DebugPanelProps) {
  if (!isVisible) return null;

  const currentTurn = combatState.currentTurn;

  return (
    <div
      className={getPanelPositionClasses('top-left')}
      style={{ zIndex: 900 }}
    >
      <CombatPanelBase title="🔧 Debug Info" onClose={onClose}>
        <div className="space-y-2 text-xs font-mono">
          <div>
            <span className="text-slate-400">Round:</span>{' '}
            <span className="text-white">{combatState.round}</span>
          </div>
          <div>
            <span className="text-slate-400">Active Index:</span>{' '}
            <span className="text-white">{combatState.activeIndex}</span>
          </div>
          <div>
            <span className="text-slate-400">Turn Order:</span>{' '}
            <span className="text-white">
              {combatState.turnOrder.length} entities
            </span>
          </div>
          {currentTurn && (
            <>
              <div className="border-t border-slate-600 pt-2 mt-2">
                <div className="text-slate-300 font-semibold mb-1">
                  Current Turn:
                </div>
                <div>
                  <span className="text-slate-400">Entity ID:</span>{' '}
                  <span className="text-white">{currentTurn.entityId}</span>
                </div>
                <div>
                  <span className="text-slate-400">Action Used:</span>{' '}
                  <span
                    className={
                      currentTurn.actionUsed ? 'text-red-400' : 'text-green-400'
                    }
                  >
                    {currentTurn.actionUsed ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Bonus Action:</span>{' '}
                  <span
                    className={
                      currentTurn.bonusActionUsed
                        ? 'text-red-400'
                        : 'text-green-400'
                    }
                  >
                    {currentTurn.bonusActionUsed ? 'Used' : 'Available'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Movement:</span>{' '}
                  <span className="text-white">
                    {currentTurn.movementUsed || 0}/
                    {currentTurn.movementMax || 30}ft
                  </span>
                </div>
              </div>
            </>
          )}
          <div className="border-t border-slate-600 pt-2 mt-2">
            <div className="text-slate-300 font-semibold mb-1">
              Player Characters:
            </div>
            <div>
              <span className="text-slate-400">Count:</span>{' '}
              <span className="text-white">{selectedCharacters.length}</span>
            </div>
          </div>
        </div>
      </CombatPanelBase>
    </div>
  );
}
