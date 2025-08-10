import { useEndTurn } from '@/api/encounterHooks';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface CombatActionPanelProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  movementMode?: boolean;
  onActionComplete?: () => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  onMoveAction?: () => void;
}

export function CombatActionPanel({
  combatState,
  encounterId,
  selectedCharacters,
  movementMode,
  onActionComplete,
  onCombatStateUpdate,
  onMoveAction,
}: CombatActionPanelProps) {
  const { endTurn, loading: endTurnLoading } = useEndTurn();
  // Simple state for which action button is active (using string for now)
  const [activeAction, setActiveAction] = useState<string>('');

  console.log('CombatActionPanel check 1:', {
    combatState: !!combatState,
    encounterId,
  });

  if (!combatState || !encounterId) {
    console.log(
      'CombatActionPanel returning null: no combatState or encounterId'
    );
    return null;
  }

  const currentTurn = combatState.currentTurn;
  console.log('CombatActionPanel check 2:', { currentTurn });

  if (!currentTurn) {
    console.log('CombatActionPanel returning null: no currentTurn');
    return null;
  }

  // Check if it's one of the player's characters' turn
  const playerCharacterIds = selectedCharacters.map((c) => c.id);
  const isPlayerTurn = playerCharacterIds.includes(currentTurn.entityId);

  console.log('CombatActionPanel check 3:', {
    currentTurnEntityId: currentTurn.entityId,
    playerCharacterIds,
    isPlayerTurn,
    selectedCharactersCount: selectedCharacters.length,
  });

  if (!isPlayerTurn) {
    console.log('CombatActionPanel returning null: not player turn');
    return null;
  }

  // Get the current character directly from protobuf data
  const currentCharacter = selectedCharacters.find(
    (c) => c.id === currentTurn.entityId
  );

  console.log('CombatActionPanel check 4:', {
    currentCharacter: currentCharacter?.name,
  });

  if (!currentCharacter) {
    console.log('CombatActionPanel returning null: no current character found');
    return null;
  }

  console.log('CombatActionPanel WILL RENDER for:', currentCharacter.name);

  const handleEndTurn = async () => {
    try {
      const response = await endTurn(encounterId);
      setActiveAction('');
      if (response.combatState && onCombatStateUpdate) {
        onCombatStateUpdate(response.combatState);
      }
      onActionComplete?.();
    } catch (err) {
      console.error('Failed to end turn:', err);
    }
  };

  // Use protobuf TurnState fields directly
  const hasAction = !currentTurn.actionUsed;
  const hasBonusAction = !currentTurn.bonusActionUsed;
  const remainingMovement =
    (currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0);
  const hasMovement = remainingMovement > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: 'spring', damping: 20 }}
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full px-4"
      style={{
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="rounded-xl shadow-2xl p-4 border-2"
        style={{
          backgroundColor: '#1a1a2e',
          borderColor: '#3B82F6',
          border: '3px solid #3B82F6',
          boxShadow:
            '0 -10px 50px rgba(59, 130, 246, 0.5), 0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          color: '#f1f5f9',
        }}
      >
        {/* Character Info Bar - using protobuf fields directly */}
        <div
          className="flex items-center justify-between mb-4 pb-3"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-3">
            <div>
              <h3
                className="text-lg font-bold"
                style={{ color: 'var(--accent-primary)' }}
              >
                {currentCharacter.name}'s Turn
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Round {combatState.round}
              </p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div style={{ color: 'var(--text-muted)' }}>
              HP:{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {currentCharacter.currentHitPoints}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              AC:{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {currentCharacter.combatStats?.armorClass || 10}
              </span>
            </div>
          </div>
        </div>

        {/* Resource Indicators - using protobuf turn state directly */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <ResourceBar
            label="Movement"
            current={remainingMovement}
            max={currentTurn.movementMax || 30}
            unit="ft"
          />
          <ResourceDot label="Action" available={hasAction} color="red" />
          <ResourceDot
            label="Bonus Action"
            available={hasBonusAction}
            color="yellow"
          />
        </div>

        {/* Action Mode Indicator */}
        {activeAction && (
          <div
            className="mb-3 p-2 rounded-lg text-center text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--accent-primary)',
            }}
          >
            {activeAction === 'move' && '🏃 Click a hex to move'}
            {activeAction === 'attack' && '⚔️ Select a target to attack'}
            {activeAction === 'spell' && '✨ Choose a spell to cast'}
            {activeAction === 'ability' && '💪 Select an ability to use'}
          </div>
        )}

        {/* Action Grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <ActionButton
            label="Move"
            icon="🏃"
            active={movementMode || activeAction === 'move'}
            disabled={!hasMovement}
            onClick={() => {
              if (movementMode) {
                // Already in movement mode, clicking again cancels it
                setActiveAction('');
              } else {
                setActiveAction('move');
                onMoveAction?.();
              }
            }}
            tooltip={`${remainingMovement} ft remaining`}
          />
          <ActionButton
            label="Attack"
            icon="⚔️"
            active={activeAction === 'attack'}
            disabled={!hasAction}
            onClick={() =>
              setActiveAction(activeAction === 'attack' ? '' : 'attack')
            }
            cost="Action"
          />
          <ActionButton
            label="Spell"
            icon="✨"
            active={activeAction === 'spell'}
            disabled={!hasAction && !hasBonusAction}
            onClick={() =>
              setActiveAction(activeAction === 'spell' ? '' : 'spell')
            }
            cost="Varies"
          />
          <ActionButton
            label="Ability"
            icon="💪"
            active={activeAction === 'ability'}
            disabled={!hasAction}
            onClick={() =>
              setActiveAction(activeAction === 'ability' ? '' : 'ability')
            }
            cost="Action"
          />
        </div>

        {/* End Turn Button */}
        <button
          onClick={handleEndTurn}
          disabled={endTurnLoading}
          className="w-full py-3 rounded-lg font-semibold transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          style={{
            backgroundColor: 'var(--accent-danger)',
            color: 'white',
          }}
        >
          {endTurnLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Processing...
            </span>
          ) : (
            'End Turn'
          )}
        </button>
      </div>
    </motion.div>
  );
}

// Simple resource bar component
function ResourceBar({
  label,
  current,
  max,
  unit,
}: {
  label: string;
  current: number;
  max: number;
  unit: string;
}) {
  const percentage = (current / max) * 100;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {current}/{max} {unit}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <motion.div
          className="h-full bg-blue-500"
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: 'spring', damping: 20 }}
        />
      </div>
    </div>
  );
}

// Simple resource dot component
function ResourceDot({
  label,
  available,
  color,
}: {
  label: string;
  available: boolean;
  color: string;
}) {
  const colorMap = {
    red: '#EF4444',
    yellow: '#EAB308',
    green: '#10B981',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <motion.div
        animate={{ scale: available ? 1 : 0.8 }}
        className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
        style={{
          backgroundColor: available
            ? colorMap[color as keyof typeof colorMap]
            : 'var(--bg-secondary)',
          color: available ? 'white' : 'var(--text-muted)',
        }}
      >
        {available ? '✓' : '✗'}
      </motion.div>
    </div>
  );
}

// Simple action button component
function ActionButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  tooltip,
  cost,
}: {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  tooltip?: string;
  cost?: string;
}) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative p-3 rounded-lg transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        backgroundColor: active
          ? 'var(--accent-primary)'
          : 'var(--bg-secondary)',
        border: `2px solid ${active ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
      }}
      title={tooltip}
    >
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl">{icon}</span>
        <span
          className="text-xs font-medium"
          style={{ color: active ? 'white' : 'var(--text-primary)' }}
        >
          {label}
        </span>
        {cost && (
          <span
            className="text-xs"
            style={{
              color: active ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
            }}
          >
            {cost}
          </span>
        )}
      </div>
    </motion.button>
  );
}
