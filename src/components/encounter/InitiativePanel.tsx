import { useEndTurn } from '@/api/encounterHooks';
import { getClassDisplayName } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { motion } from 'framer-motion';

interface InitiativePanelProps {
  combatState: CombatState;
  selectedEntity: string | null;
  selectedCharacterIds: string[];
  availableCharacters: Character[];
  equipmentCharacterId: string | null;
  encounterId: string | null;
  onEntitySelect: (entityId: string) => void;
  onEquipmentOpen: (characterId: string) => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  hideQuickActions?: boolean; // Hide Quick Actions when new combat panel is active
}

export function InitiativePanel({
  combatState,
  selectedEntity,
  selectedCharacterIds,
  availableCharacters,
  encounterId,
  onEntitySelect,
  onEquipmentOpen,
  onCombatStateUpdate,
  hideQuickActions = false,
}: InitiativePanelProps) {
  const getSelectedCharacters = (): Character[] => {
    return availableCharacters.filter((char) =>
      selectedCharacterIds.includes(char.id)
    );
  };

  return (
    <div
      className="rounded-lg p-4 h-full flex flex-col"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <h2
        className="text-xl font-semibold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        ⚔️ Battle Order
      </h2>

      {/* Turn Order List */}
      <div className="space-y-2 mb-4 flex-1 overflow-y-auto">
        {combatState.turnOrder.map((entry, index) => {
          const isActive = index === combatState.activeIndex;
          const isSelected = entry.entityId === selectedEntity;
          const character = availableCharacters.find(
            (c) => c.id === entry.entityId
          );

          return (
            <InitiativeCard
              key={entry.entityId}
              entityId={entry.entityId}
              entityType={entry.entityType}
              initiative={entry.initiative || 10}
              character={character}
              isActive={isActive}
              isSelected={isSelected}
              onSelect={() => onEntitySelect(entry.entityId)}
            />
          );
        })}
      </div>

      {/* Round Tracker */}
      <RoundTracker round={combatState.round} />

      {/* Quick Actions - Better Styled - Hidden when new CombatPanel is active */}
      {!hideQuickActions && selectedCharacterIds.length > 0 && (
        <QuickActions
          characters={getSelectedCharacters()}
          combatState={combatState}
          encounterId={encounterId}
          onEquipmentOpen={onEquipmentOpen}
          onCombatStateUpdate={onCombatStateUpdate}
        />
      )}
    </div>
  );
}

// Initiative card for each entity with better styling
function InitiativeCard({
  entityId,
  entityType,
  initiative,
  character,
  isActive,
  isSelected,
  onSelect,
}: {
  entityId: string;
  entityType: string;
  initiative: number;
  character?: Character;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isPlayer =
    entityType.toLowerCase() === 'character' ||
    entityType.toLowerCase() === 'player';

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`p-3 rounded-lg cursor-pointer transition-all relative overflow-hidden ${
        isActive ? 'ring-2 ring-green-500' : ''
      }`}
      style={{
        background: isActive
          ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
          : isSelected
            ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
            : 'var(--bg-secondary)',
        color: isActive || isSelected ? 'white' : 'var(--text-primary)',
        border: `1px solid ${isActive ? '#10B981' : isSelected ? '#3B82F6' : 'var(--border-primary)'}`,
      }}
      onClick={onSelect}
    >
      {/* Active indicator animation */}
      {isActive && (
        <motion.div
          className="absolute inset-0 opacity-20"
          animate={{
            background: [
              'radial-gradient(circle at 0% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 100% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 0% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}

      <div className="flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          {/* Entity type icon */}
          <span className="text-lg">{isPlayer ? '🛡️' : '👹'}</span>
          <div>
            <div className="font-medium">
              {character
                ? character.name
                : entityId.split('_').pop()?.toUpperCase()}
            </div>
            <div className="text-xs opacity-90">
              {character ? getClassDisplayName(character.class) : entityType}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold">{initiative}</div>
          {isActive && (
            <span className="text-xs px-2 py-1 bg-white/20 rounded-full">
              NOW
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Round tracker with better visual design
function RoundTracker({ round }: { round: number }) {
  return (
    <div
      className="p-4 rounded-lg mb-4"
      style={{
        background:
          'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
        border: '1px solid var(--accent-primary)',
      }}
    >
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-white/80">
          Combat Round
        </div>
        <div className="text-3xl font-bold text-white">{round}</div>
      </div>
    </div>
  );
}

// Quick actions with much better styling
function QuickActions({
  characters,
  combatState,
  encounterId,
  onEquipmentOpen,
  onCombatStateUpdate,
}: {
  characters: Character[];
  combatState: CombatState;
  encounterId: string | null;
  onEquipmentOpen: (characterId: string) => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
}) {
  const { endTurn, loading: endTurnLoading } = useEndTurn();

  if (characters.length === 0) return null;

  // Check if it's a player character's turn
  const currentTurn = combatState.currentTurn;
  const isPlayerTurn =
    currentTurn && characters.some((c) => c.id === currentTurn.entityId);

  return (
    <div
      className="mt-4 p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <h3
        className="text-sm font-semibold mb-3 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <span>⚡</span>
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {/* End Turn Button - Show only during player's turn */}
        {isPlayerTurn && encounterId && (
          <motion.button
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              try {
                const response = await endTurn(encounterId);
                if (response.combatState && onCombatStateUpdate) {
                  onCombatStateUpdate(response.combatState);
                }
              } catch (err) {
                console.error('Failed to end turn:', err);
              }
            }}
            disabled={endTurnLoading}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left flex items-center gap-3 group"
            style={{
              background: endTurnLoading
                ? 'var(--bg-secondary)'
                : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              color: 'white',
              border: '1px solid #DC2626',
            }}
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              {endTurnLoading ? '⏳' : '⏭️'}
            </span>
            <div className="flex-1">
              <div className="font-semibold">
                {endTurnLoading ? 'Ending Turn...' : 'End Turn'}
              </div>
              <div className="text-xs opacity-90">
                Pass to the next combatant
              </div>
            </div>
            <span
              className="text-xs opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ color: 'white' }}
            >
              →
            </span>
          </motion.button>
        )}

        {/* Equipment Management Buttons */}
        {characters.map((character) => (
          <motion.button
            key={`equipment-${character.id}`}
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onEquipmentOpen(character.id)}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left flex items-center gap-3 group"
            style={{
              background:
                'linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <span
              className="text-lg group-hover:scale-110 transition-transform"
              style={{ filter: 'grayscale(0%)' }}
            >
              🎒
            </span>
            <div className="flex-1">
              <div className="font-semibold">{character.name}</div>
              <div className="text-xs opacity-75">Manage Equipment</div>
            </div>
            <span
              className="text-xs opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--accent-primary)' }}
            >
              →
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
