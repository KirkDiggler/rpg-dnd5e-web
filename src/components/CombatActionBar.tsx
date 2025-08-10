import { useEndTurn } from '@/api/encounterHooks';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

interface CombatActionBarProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  onMoveAction?: () => void;
}

/**
 * CombatActionBar - A completely fresh combat UI implementation
 * This is a brand new component, not based on any existing code
 */
export function CombatActionBar({
  combatState,
  encounterId,
  selectedCharacters,
  onMoveAction,
}: CombatActionBarProps) {
  const { endTurn, loading: endTurnLoading } = useEndTurn();

  // Debug all the conditions
  console.log('CombatActionBar conditions:', {
    hasCombatState: !!combatState,
    hasEncounterId: !!encounterId,
    selectedCharactersCount: selectedCharacters.length,
    selectedCharacters: selectedCharacters.map((c) => c?.name || 'unnamed'),
    currentTurn: combatState?.currentTurn,
  });

  // Early exit if no combat
  if (!combatState || !encounterId || selectedCharacters.length === 0) {
    console.log('CombatActionBar: Not showing (no combat/characters)');
    return null;
  }

  const currentTurn = combatState.currentTurn;
  if (!currentTurn) {
    console.log('CombatActionBar: Not showing (no current turn)');
    return null;
  }

  // Just use the first character for now
  const character = selectedCharacters[0];

  console.log('🔴 CombatActionBar: SHOULD BE VISIBLE!', {
    character: character.name,
    round: combatState.round,
    turnEntity: currentTurn.entityId,
  });

  const handleEndTurn = async () => {
    if (!encounterId) return;
    try {
      await endTurn(encounterId);
    } catch (err) {
      console.error('Failed to end turn:', err);
    }
  };

  // Extract turn resources
  const hasAction = !currentTurn.actionUsed;
  const hasBonusAction = !currentTurn.bonusActionUsed;
  const movementLeft =
    (currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0);

  // Add a super obvious debug border temporarily
  return (
    <div
      className="fixed bottom-0 left-0 right-0 shadow-2xl"
      style={{
        backgroundColor: '#ff00ff', // BRIGHT MAGENTA
        border: '10px solid yellow', // YELLOW BORDER
        height: '200px', // FIXED HEIGHT
        zIndex: 999999, // SUPER HIGH Z-INDEX
        display: 'block',
        visibility: 'visible',
        opacity: 1,
      }}
    >
      <div className="max-w-6xl mx-auto p-4" style={{ color: 'black' }}>
        {/* Header Section */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h3
              className="text-xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {character.name}'s Turn
            </h3>
            <span
              className="text-sm px-2 py-1 rounded"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              Round {combatState.round}
            </span>
          </div>

          {/* Character Stats */}
          <div className="flex gap-4 text-sm">
            <div style={{ color: 'var(--text-muted)' }}>
              HP:{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {character.currentHitPoints}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              AC:{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {character.combatStats?.armorClass || 10}
              </span>
            </div>
          </div>
        </div>

        {/* Resources Bar */}
        <div className="flex gap-6 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Movement:
            </span>
            <div className="flex items-center">
              <div
                className="h-2 w-24 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${(movementLeft / (currentTurn.movementMax || 30)) * 100}%`,
                    backgroundColor: movementLeft > 0 ? '#10b981' : '#6b7280',
                  }}
                />
              </div>
              <span
                className="ml-2 text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                {movementLeft}ft
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Action:
            </span>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                hasAction
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 text-gray-400'
              }`}
            >
              {hasAction ? '✓' : '✗'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Bonus:
            </span>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                hasBonusAction
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-600 text-gray-400'
              }`}
            >
              {hasBonusAction ? '✓' : '✗'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onMoveAction}
            disabled={!movementLeft}
            className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              backgroundColor:
                movementLeft > 0 ? 'var(--accent-primary, #3b82f6)' : '#6b7280',
              color: 'white',
            }}
          >
            🏃 Move ({movementLeft}ft)
          </button>

          <button
            disabled={!hasAction}
            className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              backgroundColor: hasAction ? '#dc2626' : '#6b7280',
              color: 'white',
            }}
          >
            ⚔️ Attack
          </button>

          <button
            disabled={!hasAction}
            className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              backgroundColor: hasAction ? '#7c3aed' : '#6b7280',
              color: 'white',
            }}
          >
            ✨ Spell
          </button>

          <button
            disabled={!hasAction}
            className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              backgroundColor: hasAction ? '#ea580c' : '#6b7280',
              color: 'white',
            }}
          >
            💪 Ability
          </button>

          <div className="flex-1" />

          <button
            onClick={handleEndTurn}
            disabled={endTurnLoading}
            className="px-6 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              backgroundColor: endTurnLoading ? '#6b7280' : '#10b981',
              color: 'white',
            }}
          >
            {endTurnLoading ? '⏳ Ending...' : 'End Turn'}
          </button>
        </div>
      </div>
    </div>
  );
}
