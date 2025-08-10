import { useEndTurn } from '@/api/encounterHooks';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { CombatHistoryPanel } from './panels/CombatHistoryPanel';
import { DebugPanel } from './panels/DebugPanel';
import { HealthTrackingPanel } from './panels/HealthTrackingPanel';

interface CombatOverlayProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  movementMode?: boolean;
  onActionComplete?: () => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  onMoveAction?: () => void;
}

/**
 * CombatOverlay - The main orchestrator for all combat UI elements.
 * This component manages the visibility and interaction of combat panels.
 *
 * Design principles:
 * - Simple, reliable rendering without complex CSS dependencies
 * - Uses protobuf types directly as single source of truth
 * - Extensible architecture for future panels (debug, history, health)
 * - Clear separation of concerns between UI and combat logic
 */
export function CombatOverlay({
  combatState,
  encounterId,
  selectedCharacters,
  movementMode,
  onActionComplete,
  onCombatStateUpdate,
  onMoveAction,
}: CombatOverlayProps) {
  // Panel visibility state
  const [showDebugPanel, setShowDebugPanel] = useState(
    import.meta.env.MODE === 'development'
  );
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showHealthPanel, setShowHealthPanel] = useState(false);

  // Early return if essential data is missing
  if (!combatState || !encounterId) {
    console.log('CombatOverlay early return:', {
      combatState: !!combatState,
      encounterId: !!encounterId,
    });
    return null;
  }

  const currentTurn = combatState.currentTurn;

  // Always show auxiliary panels when combat is active, even if it's not player turn
  const showAuxiliaryPanels = true;

  // Only show action panel during player turns
  // Use the first selected character as the current character since entity IDs don't match
  const currentCharacter =
    selectedCharacters.length > 0 ? selectedCharacters[0] : null;
  const isPlayerTurn = currentTurn && currentCharacter;

  const showActionPanel = isPlayerTurn && currentCharacter;

  // Debug logging
  console.log('CombatOverlay Debug:', {
    hasCombatState: !!combatState,
    hasEncounterId: !!encounterId,
    currentTurn: currentTurn,
    isPlayerTurn,
    currentCharacter: currentCharacter?.name,
    showActionPanel,
    selectedCharacters: selectedCharacters.map((c) => ({
      id: c.id,
      name: c.name,
    })),
  });

  return (
    <div className="combat-overlay">
      {/* Debug indicator - always visible in dev mode */}
      {import.meta.env.MODE === 'development' && (
        <div className="fixed top-20 left-4 bg-purple-600 text-white px-3 py-1 rounded z-50 text-xs">
          CombatOverlay Active | Turn: {currentTurn?.entityId || 'none'} | Show
          Panel: {showActionPanel ? 'YES' : 'NO'}
        </div>
      )}

      {/* Main Action Panel - Only during player turns */}
      <AnimatePresence>
        {showActionPanel && currentTurn && currentCharacter && (
          <CombatActionPanel
            key="action-panel"
            combatState={combatState}
            encounterId={encounterId}
            currentCharacter={currentCharacter}
            currentTurn={currentTurn}
            movementMode={movementMode}
            onActionComplete={onActionComplete}
            onCombatStateUpdate={onCombatStateUpdate}
            onMoveAction={onMoveAction}
          />
        )}
      </AnimatePresence>

      {/* Auxiliary Panels - Always available during combat */}
      {showAuxiliaryPanels && (
        <>
          {/* Development Debug Panel */}
          {import.meta.env.MODE === 'development' && (
            <DebugPanel
              combatState={combatState}
              selectedCharacters={selectedCharacters}
              isVisible={showDebugPanel}
              onClose={() => setShowDebugPanel(false)}
            />
          )}

          {/* Combat History Panel */}
          <CombatHistoryPanel
            combatState={combatState}
            isVisible={showHistoryPanel}
            onToggle={() => setShowHistoryPanel(!showHistoryPanel)}
          />

          {/* Health Tracking Panel */}
          <HealthTrackingPanel
            combatState={combatState}
            selectedCharacters={selectedCharacters}
            isVisible={showHealthPanel}
            onToggle={() => setShowHealthPanel(!showHealthPanel)}
          />
        </>
      )}
    </div>
  );
}

interface CombatActionPanelProps {
  combatState: CombatState;
  encounterId: string;
  currentCharacter: Character;
  currentTurn: NonNullable<CombatState['currentTurn']>;
  movementMode?: boolean;
  onActionComplete?: () => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  onMoveAction?: () => void;
}

/**
 * CombatActionPanel - The main action interface for player turns.
 * Redesigned for reliability and simplicity.
 */
function CombatActionPanel({
  combatState,
  encounterId,
  currentCharacter,
  currentTurn,
  movementMode,
  onActionComplete,
  onCombatStateUpdate,
  onMoveAction,
}: CombatActionPanelProps) {
  const { endTurn, loading: endTurnLoading } = useEndTurn();
  const [activeAction, setActiveAction] = useState<string>('');

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

  // Calculate resources from protobuf data
  const hasAction = !currentTurn.actionUsed;
  const hasBonusAction = !currentTurn.bonusActionUsed;
  const remainingMovement =
    (currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0);
  const hasMovement = remainingMovement > 0;

  console.log('CombatActionPanel RENDERING for:', currentCharacter.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: 'spring', damping: 20 }}
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full px-4"
      style={{
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="bg-slate-800 border-4 border-red-500 rounded-xl shadow-2xl p-4"
        style={{ background: 'red' }}
      >
        {/* Character Info */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-600">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-blue-400">
                {currentCharacter.name}'s Turn
              </h3>
              <p className="text-sm text-slate-400">
                Round {combatState.round}
              </p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-slate-400">
              HP:{' '}
              <span className="text-white">
                {currentCharacter.currentHitPoints}
              </span>
            </div>
            <div className="text-slate-400">
              AC:{' '}
              <span className="text-white">
                {currentCharacter.combatStats?.armorClass || 10}
              </span>
            </div>
          </div>
        </div>

        {/* Resource Indicators */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <ResourceBar
            label="Movement"
            current={remainingMovement}
            max={currentTurn.movementMax || 30}
            unit="ft"
          />
          <ResourceDot label="Action" available={hasAction} color="#EF4444" />
          <ResourceDot
            label="Bonus Action"
            available={hasBonusAction}
            color="#EAB308"
          />
        </div>

        {/* Action Mode Indicator */}
        {activeAction && (
          <div className="mb-3 p-2 rounded-lg text-center text-sm font-medium bg-slate-700 text-blue-400">
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
          className="w-full py-3 rounded-lg font-semibold transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none bg-red-600 hover:bg-red-700 text-white"
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

// Resource components with simplified styling
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
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-medium text-white">
          {current}/{max} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-slate-600">
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

function ResourceDot({
  label,
  available,
  color,
}: {
  label: string;
  available: boolean;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <motion.div
        animate={{ scale: available ? 1 : 0.8 }}
        className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
        style={{
          backgroundColor: available ? color : '#475569',
          color: available ? 'white' : '#94a3b8',
        }}
      >
        {available ? '✓' : '✗'}
      </motion.div>
    </div>
  );
}

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
        ${active ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}
        border-2
      `}
      title={tooltip}
    >
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl">{icon}</span>
        <span
          className={`text-xs font-medium ${active ? 'text-white' : 'text-slate-300'}`}
        >
          {label}
        </span>
        {cost && (
          <span
            className={`text-xs ${active ? 'text-blue-200' : 'text-slate-400'}`}
          >
            {cost}
          </span>
        )}
      </div>
    </motion.button>
  );
}
