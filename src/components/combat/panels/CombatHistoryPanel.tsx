import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { CombatPanelBase } from '../CombatPanelBase';
import { getPanelPositionClasses } from '../utils';

interface CombatHistoryPanelProps {
  combatState: CombatState;
  isVisible: boolean;
  onToggle: () => void;
}

interface CombatLogEntry {
  id: string;
  timestamp: Date;
  round: number;
  entityId: string;
  action: string;
  description: string;
  type: 'move' | 'attack' | 'spell' | 'end-turn' | 'damage' | 'heal';
}

/**
 * CombatHistoryPanel - Shows a log of combat actions.
 * Example of extending the combat panel system for turn tracking.
 */
export function CombatHistoryPanel({
  combatState,
  isVisible,
  onToggle,
}: CombatHistoryPanelProps) {
  // In a real implementation, this would be populated by combat events
  const [combatLog] = useState<CombatLogEntry[]>([
    {
      id: '1',
      timestamp: new Date(),
      round: combatState.round,
      entityId: 'char-1',
      action: 'Movement',
      description: 'Moved 25ft to (5, 3)',
      type: 'move',
    },
    {
      id: '2',
      timestamp: new Date(),
      round: combatState.round,
      entityId: 'char-1',
      action: 'Attack',
      description: 'Attacked Goblin with Longsword - Hit for 8 damage',
      type: 'attack',
    },
    {
      id: '3',
      timestamp: new Date(),
      round: combatState.round,
      entityId: 'char-1',
      action: 'End Turn',
      description: 'Ended turn',
      type: 'end-turn',
    },
  ]);

  if (!isVisible) {
    // Show collapsed button
    return (
      <div
        className={getPanelPositionClasses('top-right')}
        style={{ zIndex: 900 }}
      >
        <button
          onClick={onToggle}
          className="bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-slate-200 hover:text-white transition-colors"
        >
          📜 History ({combatLog.length})
        </button>
      </div>
    );
  }

  return (
    <div
      className={getPanelPositionClasses('top-right')}
      style={{ zIndex: 900 }}
    >
      <CombatPanelBase title="📜 Combat History" onClose={onToggle} collapsible>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {combatLog.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-4">
              No actions recorded yet
            </div>
          ) : (
            combatLog.map((entry) => (
              <div
                key={entry.id}
                className="text-xs border-b border-slate-700 pb-2 last:border-b-0"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-medium">
                    {entry.action}
                  </span>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span>R{entry.round}</span>
                    <span className={getActionTypeColor(entry.type)}>
                      {getActionTypeIcon(entry.type)}
                    </span>
                  </div>
                </div>
                <div className="text-slate-400 text-xs">
                  {entry.description}
                </div>
              </div>
            ))
          )}
        </div>
      </CombatPanelBase>
    </div>
  );
}

function getActionTypeIcon(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'move':
      return '🏃';
    case 'attack':
      return '⚔️';
    case 'spell':
      return '✨';
    case 'end-turn':
      return '⏭️';
    case 'damage':
      return '💥';
    case 'heal':
      return '💚';
    default:
      return '❓';
  }
}

function getActionTypeColor(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'move':
      return 'text-blue-400';
    case 'attack':
      return 'text-red-400';
    case 'spell':
      return 'text-purple-400';
    case 'end-turn':
      return 'text-slate-400';
    case 'damage':
      return 'text-orange-400';
    case 'heal':
      return 'text-green-400';
    default:
      return 'text-slate-400';
  }
}
