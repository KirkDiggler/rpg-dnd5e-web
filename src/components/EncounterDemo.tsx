import { useDungeonStart, useListCharacters, useMoveCharacter } from '@/api';
import { useDiscord } from '@/discord';
import { findHexPath } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { ActionPanel } from './combat-v2';
import { BattleMapPanel } from './encounter/BattleMapPanel';
import { InitiativePanel } from './encounter/InitiativePanel';
import { PartySetupPanel } from './encounter/PartySetupPanel';
import { Equipment } from './Equipment';

export function EncounterDemo() {
  const { dungeonStart, loading, error } = useDungeonStart();
  const { moveCharacter } = useMoveCharacter();
  const discord = useDiscord();
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');

  // Fetch user's characters
  const { data: availableCharacters = [], loading: charactersLoading } =
    useListCharacters({
      playerId,
      sessionId: isDevelopment ? 'test-session' : undefined,
    });

  // Game state
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [combatState, setCombatState] = useState<CombatState | null>(null);

  // Character selection state
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);

  // UI state
  const [equipmentCharacterId, setEquipmentCharacterId] = useState<
    string | null
  >(null);
  const [movementMode, setMovementMode] = useState(false);
  const [movementPath, setMovementPath] = useState<
    Array<{ x: number; y: number }>
  >([]);

  const handleStartEncounter = async () => {
    try {
      const response = await dungeonStart(selectedCharacterIds);

      if (response.encounterId) {
        setEncounterId(response.encounterId);
      }

      if (response.room) {
        setRoom(response.room);
      }

      if (response.combatState) {
        setCombatState(response.combatState);
        // Select the current turn entity by default
        if (response.combatState.currentTurn?.entityId) {
          setSelectedEntity(response.combatState.currentTurn.entityId);
        }
      }
    } catch (err) {
      console.error('Failed to start dungeon:', err);
    }
  };

  const handleCharacterToggle = (characterId: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((id) => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleEntityClick = (entityId: string) => {
    setSelectedEntity(entityId);
  };

  const handleEntityHover = (entityId: string | null) => {
    setHoveredEntity(entityId);
  };

  const handleCellClick = async (x: number, y: number) => {
    if (movementMode && selectedEntity && encounterId) {
      const entityPos = room?.entities[selectedEntity]?.position;
      if (!entityPos) return;

      // Get the last position in the path, or entity's current position
      const lastPos =
        movementPath.length > 0
          ? movementPath[movementPath.length - 1]
          : { x: entityPos.x, y: entityPos.y };

      // Get occupied positions (excluding the target)
      const occupiedPositions = new Set<string>();
      if (room?.entities) {
        Object.values(room.entities).forEach((entity) => {
          if (
            entity.position &&
            entity.blocksMovement &&
            entity.entityId !== selectedEntity
          ) {
            occupiedPositions.add(`${entity.position.x},${entity.position.y}`);
          }
        });
      }

      // Find path from last position to clicked hex
      const newSegment = findHexPath(lastPos, { x, y }, occupiedPositions);

      // Validate total movement cost
      const pathCost = (movementPath.length + newSegment.length) * 5; // 5ft per hex
      const maxMovement = combatState?.currentTurn?.movementMax || 30;
      const usedMovement = combatState?.currentTurn?.movementUsed || 0;

      if (pathCost > maxMovement - usedMovement) {
        console.warn('Not enough movement remaining');
        return; // Don't add to path
      }

      // Add the new segment to the path
      setMovementPath((prev) => [...prev, ...newSegment]);
    }
  };

  const handleCombatStateUpdate = (newCombatState: CombatState) => {
    setCombatState(newCombatState);
    // Update selected entity to the new current turn's entity
    if (newCombatState.currentTurn?.entityId) {
      setSelectedEntity(newCombatState.currentTurn.entityId);
    }
    // Clear movement mode when turn changes
    setMovementMode(false);
  };

  const handleMoveAction = () => {
    setMovementMode((prev) => !prev);
    if (movementMode) {
      setMovementPath([]); // Clear path when exiting movement mode
    }
  };

  const handleExecuteMove = async () => {
    if (movementPath.length === 0 || !selectedEntity || !encounterId) return;

    try {
      const response = await moveCharacter(
        encounterId,
        selectedEntity,
        movementPath
      );
      if (response.success) {
        if (response.updatedRoom) setRoom(response.updatedRoom);
        setMovementPath([]);
        setMovementMode(false);
      } else {
        console.error('Move failed:', response.error?.message);
      }
    } catch (err) {
      console.error('Failed to move character:', err);
    }
  };

  const handleCancelMove = () => {
    setMovementPath([]);
    setMovementMode(false);
  };

  const getSelectedCharacters = (): Character[] => {
    // During combat, return the characters that were selected for the encounter
    // The entity IDs in combat state don't match character IDs, so we use the original selection
    if (combatState && combatState.turnOrder.length > 0) {
      return availableCharacters.filter((char) =>
        selectedCharacterIds.includes(char.id)
      );
    }

    // Before combat, use the selected characters for party setup
    return availableCharacters.filter((char) =>
      selectedCharacterIds.includes(char.id)
    );
  };

  return (
    <>
      <div
        className="min-h-screen p-8"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1
              className="text-4xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Combat Encounter
            </h1>
            <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
              Battle your way through the dungeon
            </p>
          </div>

          {/* Main Content */}
          {!room ? (
            // Pre-encounter setup
            <PartySetupPanel
              availableCharacters={availableCharacters}
              selectedCharacterIds={selectedCharacterIds}
              onCharacterToggle={handleCharacterToggle}
              onStartEncounter={handleStartEncounter}
              loading={loading}
              charactersLoading={charactersLoading}
              error={error}
            />
          ) : (
            // Active encounter
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Battle map - 3 columns */}
              <div className="lg:col-span-3">
                <BattleMapPanel
                  room={room}
                  selectedEntity={selectedEntity}
                  hoveredEntity={hoveredEntity}
                  availableCharacters={availableCharacters}
                  movementMode={movementMode}
                  movementRange={
                    combatState?.currentTurn?.movementMax
                      ? combatState.currentTurn.movementMax -
                        (combatState.currentTurn.movementUsed || 0)
                      : 0
                  }
                  movementPath={movementPath}
                  onEntityClick={handleEntityClick}
                  onEntityHover={handleEntityHover}
                  onCellClick={handleCellClick}
                />
              </div>

              {/* Initiative & controls - 1 column */}
              <div className="lg:col-span-1">
                {combatState && (
                  <InitiativePanel
                    combatState={combatState}
                    selectedEntity={selectedEntity}
                    selectedCharacterIds={selectedCharacterIds}
                    availableCharacters={availableCharacters}
                    equipmentCharacterId={equipmentCharacterId}
                    encounterId={encounterId}
                    onEntitySelect={handleEntityClick}
                    onEquipmentOpen={setEquipmentCharacterId}
                    onCombatStateUpdate={handleCombatStateUpdate}
                  />
                )}
              </div>
            </div>
          )}

          {/* Equipment Modal */}
          {equipmentCharacterId && (
            <Equipment
              characterId={equipmentCharacterId}
              onClose={() => {
                setEquipmentCharacterId(null);
              }}
            />
          )}
        </div>
      </div>

      {/* NEW Combat v2 Action Panel - OUTSIDE all containers with Portal */}
      <ActionPanel
        combatState={combatState}
        encounterId={encounterId}
        selectedCharacters={getSelectedCharacters()}
        onMoveAction={handleMoveAction}
        onCombatStateUpdate={handleCombatStateUpdate}
        movementMode={movementMode}
        movementPath={movementPath}
        onExecuteMove={handleExecuteMove}
        onCancelMove={handleCancelMove}
        debug={false} // Set to true for visibility testing
      />
    </>
  );
}
