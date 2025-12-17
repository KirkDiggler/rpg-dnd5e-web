import {
  useActivateFeature,
  useAttack,
  useDungeonStart,
  useEndTurn,
  useListCharacters,
  useMoveCharacter,
  useOpenDoor,
} from '@/api';
import { useDiscord } from '@/discord';
import {
  getAbilityDisplay,
  getConditionDisplay,
  getFeatureDisplay,
  getSpellDisplay,
  getWeaponDisplay,
} from '@/utils/enumDisplays';
import {
  cubeKey,
  findHexPath,
  hexDistance,
  type CubeCoord,
} from '@/utils/hexUtils';
import {
  formatEntityId,
  monsterTurnsToLogEntries,
} from '@/utils/monsterTurnUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  EncounterEndReason,
  type CombatState,
  type DoorInfo,
  type MonsterTurnResult,
  type Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DungeonDifficulty,
  DungeonLength,
  DungeonTheme,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useEffect, useState } from 'react';
import { CombatPanel, type CombatLogEntry } from './combat-v2';
import { usePlayerTurn } from './combat-v2/hooks/usePlayerTurn';
import { BattleMapPanel } from './encounter/BattleMapPanel';
import { PartySetupPanel } from './encounter/PartySetupPanel';
import { Equipment } from './Equipment';
import { GameModeSelector, LobbyScreen } from './lobby';
import type { DungeonConfig } from './lobby/dungeonConfig';
import { useToast } from './ui';

type GameMode = 'select' | 'solo' | 'multiplayer';

/**
 * Update room entity positions based on monster movement paths
 * @param room - Current room state
 * @param turns - Monster turns containing movement paths
 * @returns Updated room with new entity positions
 */
function applyMonsterMovement(room: Room, turns: MonsterTurnResult[]): Room {
  // Clone the entities map to avoid mutating state directly
  const updatedEntities = { ...room.entities };

  for (const turn of turns) {
    // If monster moved, update their position to final position in path
    if (turn.movementPath.length > 0) {
      const finalPosition = turn.movementPath[turn.movementPath.length - 1];
      const entity = updatedEntities[turn.monsterId];

      if (entity && finalPosition) {
        // Create updated entity with new position
        // Use the finalPosition directly since it's already a proper Position proto
        updatedEntities[turn.monsterId] = {
          ...entity,
          position: finalPosition,
        };
      }
    }
  }

  return {
    ...room,
    entities: updatedEntities,
  };
}

export function EncounterDemo() {
  const { dungeonStart, loading, error } = useDungeonStart();
  const { moveCharacter } = useMoveCharacter();
  const { attack } = useAttack();
  const { activateFeature } = useActivateFeature();
  const { endTurn } = useEndTurn();
  const { openDoor, loading: doorLoading } = useOpenDoor();
  const { addToast } = useToast();
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

  // Dungeon/door state
  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Full character data with equipment (separate from list data)
  const [fullCharactersMap, setFullCharactersMap] = useState<
    Map<string, Character>
  >(new Map());

  // Character selection state
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [attackTarget, setAttackTarget] = useState<string | null>(null);

  // UI state
  const [equipmentCharacterId, setEquipmentCharacterId] = useState<
    string | null
  >(null);
  const [movementMode, setMovementMode] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<{
    id: string;
    type: string;
    name: string;
  } | null>(null);
  // Click-to-lock: when user clicks an entity, lock hover panel to that entity
  const [selectedHoverEntity, setSelectedHoverEntity] = useState<{
    id: string;
    type: string;
    name: string;
  } | null>(null);
  const [movementPath, setMovementPath] = useState<CubeCoord[]>([]);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [gameMode, setGameMode] = useState<GameMode>('select');
  const [dungeonConfig, setDungeonConfig] = useState<DungeonConfig>({
    theme: DungeonTheme.CAVE,
    difficulty: DungeonDifficulty.MEDIUM,
    length: DungeonLength.MEDIUM,
  });

  // Get player name from Discord or use default
  const playerName = discord.user?.username || 'Player';

  /**
   * Get display name for an entity ID
   * Checks fullCharactersMap, availableCharacters, and room entities in order.
   * Can optionally use a specific room (e.g., from a response) instead of current state.
   */
  const getEntityDisplayName = (
    entityId: string,
    roomOverride?: Room | null
  ): string => {
    // Try full character data first (most complete)
    const fullChar = fullCharactersMap.get(entityId);
    if (fullChar?.name) return fullChar.name;

    // Try available characters
    const availChar = availableCharacters.find((c) => c.id === entityId);
    if (availChar?.name) return availChar.name;

    // Try room entities (monsters/NPCs)
    const roomToCheck = roomOverride ?? room;
    if (roomToCheck?.entities[entityId]) {
      return formatEntityId(entityId);
    }

    return entityId;
  };

  const handleStartEncounter = async () => {
    try {
      const response = await dungeonStart({
        characterIds: selectedCharacterIds,
        theme: dungeonConfig.theme,
        difficulty: dungeonConfig.difficulty,
        length: dungeonConfig.length,
      });

      if (response.encounterId) {
        setEncounterId(response.encounterId);
      }

      // Capture dungeon ID and doors for room navigation
      if (response.dungeonId) {
        setDungeonId(response.dungeonId);
      }
      if (response.doors) {
        setDoors(response.doors);
      }

      // Start with the room from response, may be updated below if monsters moved
      let roomToSet = response.room;

      if (response.combatState) {
        setCombatState(response.combatState);
        // Select the current turn entity by default
        if (response.combatState.currentTurn?.entityId) {
          setSelectedEntity(response.combatState.currentTurn.entityId);
        }
      }

      // Process monster turns if present (monsters go first in initiative)
      if (response.monsterTurns && response.monsterTurns.length > 0) {
        // Convert monster turns to combat log entries
        const currentRound = response.combatState?.round || 1;
        const monsterLogEntries = monsterTurnsToLogEntries(
          response.monsterTurns,
          currentRound,
          (targetId) => getEntityDisplayName(targetId, response.room)
        );

        // Add to combat log
        setCombatLog((prev) => [...prev, ...monsterLogEntries]);

        // Update room with monster positions after their movement
        if (roomToSet) {
          roomToSet = applyMonsterMovement(roomToSet, response.monsterTurns);
        }
      }

      // Set the room (with updated monster positions if they moved)
      if (roomToSet) {
        setRoom(roomToSet);
      }
    } catch (err) {
      console.error('Failed to start dungeon:', err);
      addToast({
        type: 'error',
        message: 'Failed to start encounter',
        duration: 4000,
      });
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
    // Get clicked entity
    const clickedEntity = room?.entities[entityId];
    if (!clickedEntity) return;

    // Set the selected hover entity for click-to-lock in the info panel
    // Get the entity name from availableCharacters or format the entity ID for monsters
    const entityName =
      availableCharacters.find((c) => c.id === entityId)?.name ||
      formatEntityId(entityId);
    setSelectedHoverEntity({
      id: entityId,
      type:
        clickedEntity.entityType.toLowerCase() === 'monster'
          ? 'monster'
          : 'player',
      name: entityName,
    });

    const currentTurnEntityId = combatState?.currentTurn?.entityId;

    // If clicking on our own character (current turn), toggle movement mode
    if (currentTurnEntityId && entityId === currentTurnEntityId) {
      setMovementMode((prev) => !prev);
      if (movementMode) {
        setMovementPath([]); // Clear path when exiting movement mode
      }
      setSelectedEntity(entityId);
      return;
    }

    // If it's a monster/enemy and we have a current turn entity, mark as attack target
    if (
      currentTurnEntityId &&
      clickedEntity.entityType.toLowerCase() === 'monster'
    ) {
      // Check if adjacent (within 1 hex for melee)
      // Server provides cube coordinates in position.x, position.y, position.z
      const currentEntity = room?.entities[currentTurnEntityId];
      if (currentEntity?.position && clickedEntity.position) {
        const distance = hexDistance(
          currentEntity.position.x,
          currentEntity.position.y,
          currentEntity.position.z,
          clickedEntity.position.x,
          clickedEntity.position.y,
          clickedEntity.position.z
        );

        // Set as attack target (can be adjacent or not - button will handle enabling)
        setAttackTarget(entityId);
        console.log(
          `Target selected: ${entityId}, distance: ${distance} hexes, adjacent: ${distance === 1}`
        );
      }
    }

    setSelectedEntity(entityId);
  };

  const handleCellClick = async (clickedCube: CubeCoord) => {
    if (movementMode && selectedEntity && encounterId) {
      const entityPos = room?.entities[selectedEntity]?.position;
      if (!entityPos) return;

      // Get the last position in the path, or entity's current position (as cube coords)
      const lastPos: CubeCoord =
        movementPath.length > 0
          ? movementPath[movementPath.length - 1]
          : { x: entityPos.x, y: entityPos.y, z: entityPos.z };

      // Get occupied positions (excluding the target) using cube keys
      const occupiedPositions = new Set<string>();
      if (room?.entities) {
        Object.values(room.entities).forEach((entity) => {
          if (
            entity.position &&
            entity.blocksMovement &&
            entity.entityId !== selectedEntity
          ) {
            occupiedPositions.add(
              cubeKey({
                x: entity.position.x,
                y: entity.position.y,
                z: entity.position.z,
              })
            );
          }
        });
      }

      // Find path from last position to clicked hex
      const newSegment = findHexPath(lastPos, clickedCube, occupiedPositions);

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

  // Handler for HexGrid click-to-move
  const handleMoveComplete = async (path: CubeCoord[]) => {
    const currentTurnEntityId = combatState?.currentTurn?.entityId;
    if (!currentTurnEntityId || !encounterId || path.length === 0) return;

    try {
      const response = await moveCharacter(
        encounterId,
        currentTurnEntityId,
        path
      );
      if (response.success) {
        if (response.updatedRoom) setRoom(response.updatedRoom);

        // Update combat state to reflect new movement remaining
        if (combatState && combatState.currentTurn) {
          const movementUsed =
            combatState.currentTurn.movementMax - response.movementRemaining;
          setCombatState({
            ...combatState,
            currentTurn: {
              ...combatState.currentTurn,
              movementUsed,
            },
          });
        }

        addToast({
          type: 'success',
          message: `Moved ${path.length * 5}ft`,
          duration: 2000,
        });
      } else {
        addToast({
          type: 'error',
          message: response.error?.message || 'Move failed',
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('Failed to move character:', err);
      addToast({
        type: 'error',
        message: 'Failed to move character',
        duration: 3000,
      });
    }
  };

  // Handler for HexGrid click-to-attack
  const handleAttackComplete = async (targetId: string) => {
    // Use the existing attack handler with the target
    setAttackTarget(targetId);
    // Small delay to let state update, then trigger attack
    setTimeout(() => {
      handleAttackAction();
    }, 0);
  };

  const handleCombatStateUpdate = (newCombatState: CombatState) => {
    setCombatState(newCombatState);
    // Update selected entity to the new current turn's entity
    if (newCombatState.currentTurn?.entityId) {
      setSelectedEntity(newCombatState.currentTurn.entityId);
    }
    // Clear movement mode and attack target when turn changes
    setMovementMode(false);
    setAttackTarget(null);
  };

  const handleAttackAction = async () => {
    if (!encounterId || !combatState?.currentTurn?.entityId) {
      console.warn('Missing required data for attack', {
        encounterId,
        attackerId: combatState?.currentTurn?.entityId,
      });
      return;
    }

    // Use attackTarget if set, otherwise fall back to selectedEntity if it's a monster
    let target = attackTarget;
    if (!target && selectedEntity) {
      const selectedEntityData = room?.entities[selectedEntity];
      if (selectedEntityData?.entityType.toLowerCase() === 'monster') {
        target = selectedEntity;
      }
    }

    if (!target) {
      addToast({
        type: 'info',
        message: 'Select a target first! Click on an enemy to target them.',
        duration: 4000,
      });
      return;
    }

    // Update attackTarget state to match what we're using
    if (target !== attackTarget) {
      setAttackTarget(target);
    }

    try {
      const response = await attack(
        encounterId,
        combatState.currentTurn.entityId,
        target
      );

      console.log('Attack response:', response);

      if (response.result) {
        const {
          hit,
          damage,
          damageType,
          critical,
          attackRoll,
          attackTotal,
          targetAc,
          damageBreakdown,
        } = response.result;
        console.log(
          `Attack ${hit ? 'HIT' : 'MISSED'}! (${attackTotal} vs AC ${targetAc})`
        );

        // Calculate modifier from roll
        const modifier = attackTotal - attackRoll;
        const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

        // Build attack roll line: "Attack: 10 +5 = 15 vs AC 15"
        const attackLine = `Attack: ${attackRoll} ${modifierStr} = ${attackTotal} vs AC ${targetAc}`;

        // Get attacker's weapon name from their equipment
        // Use fullCharactersMap which has full equipment data from GetCharacter
        const attackerId = combatState.currentTurn.entityId;
        const fullAttackerChar = fullCharactersMap.get(attackerId);
        const weaponName =
          fullAttackerChar?.equipmentSlots?.mainHand?.equipment?.name ||
          'Weapon';

        // Build damage breakdown string if available
        let damageLines = '';
        if (hit) {
          if (damageBreakdown && damageBreakdown.components.length > 0) {
            // Show each damage component on its own line
            const componentLines = damageBreakdown.components.map((comp) => {
              const diceSum = comp.finalDiceRolls.reduce((a, b) => a + b, 0);
              const diceStr =
                comp.finalDiceRolls.length > 0
                  ? `(${comp.finalDiceRolls.join('+')})=${diceSum}`
                  : '';
              const bonusStr =
                comp.flatBonus !== 0
                  ? comp.flatBonus > 0
                    ? ` +${comp.flatBonus}`
                    : ` ${comp.flatBonus}`
                  : '';
              // Use type-safe sourceRef if available, fallback to legacy source
              let sourceName: string;
              if (comp.sourceRef?.source.case) {
                const { case: sourceCase, value } = comp.sourceRef.source;
                switch (sourceCase) {
                  case 'weapon':
                    // Use type-safe enum display for weapon name
                    sourceName = getWeaponDisplay(value).title;
                    break;
                  case 'ability':
                    sourceName = getAbilityDisplay(value).title;
                    break;
                  case 'condition':
                    sourceName = getConditionDisplay(value).title;
                    break;
                  case 'feature':
                    sourceName = getFeatureDisplay(value).title;
                    break;
                  case 'spell':
                    sourceName = getSpellDisplay(value).title;
                    break;
                  default:
                    sourceName = 'Unknown';
                }
              } else {
                // Legacy fallback
                sourceName =
                  comp.source === 'weapon'
                    ? weaponName
                    : comp.source.charAt(0).toUpperCase() +
                      comp.source.slice(1);
              }
              return `  ${sourceName}: ${diceStr}${bonusStr}`;
            });
            // Calculate total from components
            const total = damageBreakdown.components.reduce((sum, comp) => {
              const diceSum = comp.finalDiceRolls.reduce((a, b) => a + b, 0);
              return sum + diceSum + comp.flatBonus;
            }, 0);
            damageLines = `Damage: ${total} ${damageType}\n${componentLines.join('\n')}`;
          } else {
            damageLines = `Damage: ${damage} ${damageType}`;
          }
        }

        // Show toast notification with detailed roll info
        if (critical) {
          addToast({
            message: `💥 CRITICAL HIT!\n${attackLine}\n${damageLines}`,
            type: 'critical',
            duration: 0, // Stay until dismissed
          });
        } else if (hit) {
          addToast({
            message: `⚔️ HIT!\n${attackLine}\n${damageLines}`,
            type: 'success',
            duration: 0, // Stay until dismissed
          });
        } else {
          addToast({
            message: `💨 MISS!\n${attackLine}`,
            type: 'error',
            duration: 0, // Stay until dismissed
          });
        }

        if (hit) {
          console.log(
            `Damage: ${damage} ${damageType}${critical ? ' (CRITICAL!)' : ''}`
          );
        }

        // Add combat log entry - get display names for attacker and target
        const targetName = getEntityDisplayName(target);
        const attackerName = getEntityDisplayName(attackerId);

        const logEntry: CombatLogEntry = {
          id: `attack-${Date.now()}`,
          timestamp: new Date(),
          round: combatState.round,
          actorName: attackerName,
          targetName,
          action: critical
            ? 'Critical Hit!'
            : hit
              ? 'Attack Hit'
              : 'Attack Miss',
          description: hit
            ? `${attackerName} hits ${targetName} for ${damage} ${damageType} damage`
            : `${attackerName} misses ${targetName}`,
          type: 'attack',
          diceRolls: [
            {
              value: attackRoll,
              sides: 20,
              isNatural1: attackRoll === 1,
              isNatural20: attackRoll === 20,
              isCritical: critical,
            },
          ],
          details: {
            attackRoll,
            attackTotal,
            targetAc,
            damage: hit ? damage : undefined,
            damageType: hit ? damageType : undefined,
            critical,
            weaponName,
            damageBreakdown: hit ? damageBreakdown : undefined,
          },
        };
        setCombatLog((prev) => [...prev, logEntry]);
      }

      // Update combat state if returned
      if (response.combatState) {
        handleCombatStateUpdate(response.combatState);
      }

      // Clear attack target after successful attack
      setAttackTarget(null);
    } catch (err) {
      console.error('Failed to execute attack:', err);
      addToast({
        type: 'error',
        message: 'Failed to execute attack',
        duration: 4000,
      });
    }
  };

  const handleMoveAction = () => {
    setMovementMode((prev) => !prev);
    if (movementMode) {
      setMovementPath([]); // Clear path when exiting movement mode
    }
  };

  // Movement execution handlers removed - movement now handled by CombatPanel's Move button
  // which toggles movement mode. Actual movement execution is still done via handleCellDoubleClick

  const handleActivateFeature = async (featureId: string) => {
    if (!encounterId || !combatState?.currentTurn?.entityId) {
      console.warn('Missing required data for feature activation', {
        encounterId,
        entityId: combatState?.currentTurn?.entityId,
      });
      return;
    }

    // Find the character ID from the current entity
    const currentCharacter = getSelectedCharacters().find((char) =>
      selectedCharacterIds.includes(char.id)
    );

    if (!currentCharacter) {
      console.warn('Could not find current character');
      return;
    }

    try {
      const response = await activateFeature(
        encounterId,
        currentCharacter.id,
        featureId
      );

      if (response.success) {
        addToast({
          type: 'success',
          message: `🔥 ${response.message || 'Feature activated!'}`,
          duration: 3500,
        });

        // Update combat state if returned
        if (response.updatedCombatState) {
          handleCombatStateUpdate(response.updatedCombatState);
        }

        // Update character in local state if returned
        if (response.updatedCharacter) {
          // The character data would be updated through the combat state
          // or we could refetch character data here
          console.log('Character updated:', response.updatedCharacter);
        }
      } else {
        addToast({
          type: 'error',
          message: response.message || 'Failed to activate feature',
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('Failed to activate feature:', err);
      addToast({
        type: 'error',
        message: 'Failed to activate feature',
        duration: 3000,
      });
    }
  };

  // Door click handler for room navigation
  const handleDoorClick = async (connectionId: string) => {
    if (!dungeonId) {
      console.warn('Cannot open door: no dungeonId');
      return;
    }

    setIsTransitioning(true);

    // Brief fade out
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const response = await openDoor(dungeonId, connectionId);

      if (!response.success) {
        setIsTransitioning(false);
        addToast({
          type: 'error',
          message: response.error || 'Failed to open door',
          duration: 3000,
        });
        return;
      }

      // Update all state with new room
      if (response.encounterId) {
        setEncounterId(response.encounterId);
      }

      // Start with the room from response, may be updated below if monsters moved
      let roomToSet = response.room;

      if (response.combatState) {
        setCombatState(response.combatState);
        // Select the current turn entity by default
        if (response.combatState.currentTurn?.entityId) {
          setSelectedEntity(response.combatState.currentTurn.entityId);
        }
      }

      // Update doors for the new room
      if (response.doors) {
        setDoors(response.doors);
      }

      // Process monster turns if present (monsters go first in initiative in new room)
      if (response.monsterTurns && response.monsterTurns.length > 0) {
        // Convert monster turns to combat log entries
        const currentRound = response.combatState?.round || 1;
        const monsterLogEntries = monsterTurnsToLogEntries(
          response.monsterTurns,
          currentRound,
          (targetId) => getEntityDisplayName(targetId, response.room)
        );

        // Add to combat log
        setCombatLog((prev) => [...prev, ...monsterLogEntries]);

        // Update room with monster positions after their movement
        if (roomToSet) {
          roomToSet = applyMonsterMovement(roomToSet, response.monsterTurns);
        }
      }

      // Set the room (with updated monster positions if they moved)
      if (roomToSet) {
        setRoom(roomToSet);
      }

      // Clear movement state for new room
      setMovementMode(false);
      setMovementPath([]);
      setAttackTarget(null);

      addToast({
        type: 'success',
        message: 'Entered new room',
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to open door:', err);
      addToast({
        type: 'error',
        message: 'Failed to open door',
        duration: 3000,
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  // Fetch full character data with equipment when combat starts
  useEffect(() => {
    if (encounterId && selectedCharacterIds.length > 0) {
      console.log(
        '[useEffect] Fetching full character data for:',
        selectedCharacterIds
      );
      // Fetch full character data for all selected characters
      selectedCharacterIds.forEach(async (characterId) => {
        try {
          const request = { characterId };
          const { characterClient } = await import('@/api/client');
          const { create } = await import('@bufbuild/protobuf');
          const { GetCharacterRequestSchema } =
            await import('@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb');

          const getCharRequest = create(GetCharacterRequestSchema, request);
          const response = await characterClient.getCharacter(getCharRequest);

          if (response.character) {
            setFullCharactersMap((prev) => {
              const newMap = new Map(prev);
              newMap.set(characterId, response.character!);

              return newMap;
            });
          }
        } catch (error) {
          console.error(
            `Failed to fetch full character data for ${characterId}:`,
            error
          );
        }
      });
    }
  }, [encounterId, selectedCharacterIds]);

  const getSelectedCharacters = (): Character[] => {
    // During combat, prefer full character data with equipment if available
    if (combatState && combatState.turnOrder.length > 0) {
      const chars = selectedCharacterIds
        .map((id) => {
          const fullChar = fullCharactersMap.get(id);
          const basicChar = availableCharacters.find((char) => char.id === id);

          return fullChar || basicChar;
        })
        .filter((char): char is Character => char !== undefined);

      return chars;
    }

    // Before combat, use available characters
    return availableCharacters.filter((char) =>
      selectedCharacterIds.includes(char.id)
    );
  };

  // Extract turn information using usePlayerTurn hook
  const { isPlayerTurn, currentCharacter, currentTurn } = usePlayerTurn({
    combatState,
    selectedCharacters: getSelectedCharacters(),
  });

  // Placeholder handlers for new CombatPanel callbacks
  const handleSpell = () => {
    addToast({
      type: 'info',
      message: 'Spell selection not yet implemented',
      duration: 3000,
    });
  };

  const handleBackpack = () => {
    // Open equipment modal for current character
    if (currentCharacter) {
      setEquipmentCharacterId(currentCharacter.id);
    }
  };

  const handleWeaponClick = (slot: 'mainHand' | 'offHand') => {
    // Clicking a weapon should trigger an attack with that weapon
    // For now, use the existing attack handler
    console.log(`Weapon clicked: ${slot}`);
    handleAttackAction();
  };

  const handleEndTurn = async () => {
    if (!encounterId) {
      console.warn('Cannot end turn: no encounterId');
      return;
    }

    try {
      const response = await endTurn(encounterId);

      // Process monster turns if present
      if (response.monsterTurns && response.monsterTurns.length > 0) {
        // Convert monster turns to combat log entries
        const currentRound = combatState?.round || 1;
        const monsterLogEntries = monsterTurnsToLogEntries(
          response.monsterTurns,
          currentRound,
          getEntityDisplayName
        );

        // Add to combat log
        setCombatLog((prev) => [...prev, ...monsterLogEntries]);

        // Update room with monster positions after their movement
        if (room) {
          const updatedRoom = applyMonsterMovement(room, response.monsterTurns);
          setRoom(updatedRoom);
        }
      }

      // Check for encounter result (victory/defeat)
      if (response.encounterResult) {
        const { reason } = response.encounterResult;

        if (reason === EncounterEndReason.VICTORY) {
          addToast({
            type: 'success',
            message: 'Victory! All enemies defeated!',
            duration: 0, // Stay until dismissed
          });

          // Optionally add to combat log
          setCombatLog((prev) => [
            ...prev,
            {
              id: `victory-${Date.now()}`,
              timestamp: new Date(),
              round: combatState?.round || 1,
              actorName: 'System',
              action: 'Victory',
              description: 'All enemies have been defeated!',
              type: 'info',
            },
          ]);
        } else if (reason === EncounterEndReason.DEFEAT) {
          addToast({
            type: 'error',
            message: 'Defeat! Your party has fallen...',
            duration: 0, // Stay until dismissed
          });

          // Optionally add to combat log
          setCombatLog((prev) => [
            ...prev,
            {
              id: `defeat-${Date.now()}`,
              timestamp: new Date(),
              round: combatState?.round || 1,
              actorName: 'System',
              action: 'Defeat',
              description: 'Your party has been defeated...',
              type: 'info',
            },
          ]);
        }
      }

      if (response.combatState) {
        handleCombatStateUpdate(response.combatState);
        // Only show "Turn ended" toast if combat hasn't ended
        if (!response.encounterResult) {
          addToast({
            type: 'success',
            message: 'Turn ended',
            duration: 2000,
          });
        }
      }
    } catch (err) {
      console.error('Failed to end turn:', err);
      addToast({
        type: 'error',
        message: 'Failed to end turn',
        duration: 3000,
      });
    }
  };

  return (
    <>
      <div
        className="min-h-screen p-4"
        style={{
          backgroundColor: 'var(--bg-primary)',
          // Add bottom padding to account for fixed CombatPanel (~320px)
          paddingBottom: currentCharacter ? '340px' : undefined,
        }}
      >
        <div className="max-w-[1800px] mx-auto">
          {/* Main Content - Header removed to save vertical space */}
          {!room ? (
            // Pre-encounter: show mode selection or setup screens
            gameMode === 'select' ? (
              <GameModeSelector
                onSelectSolo={() => setGameMode('solo')}
                onSelectMultiplayer={() => setGameMode('multiplayer')}
              />
            ) : gameMode === 'multiplayer' ? (
              <LobbyScreen
                availableCharacters={availableCharacters}
                charactersLoading={charactersLoading}
                currentPlayerId={playerId}
                currentPlayerName={playerName}
                onBack={() => setGameMode('select')}
                onStartCombat={(id, event) => {
                  console.log('Starting multiplayer combat:', id);
                  console.log('CombatStartedEvent:', event);
                  console.log('Event party:', event.party);
                  console.log('Event combatState:', event.combatState);
                  console.log('Event room:', event.room);
                  // Set encounter ID and room from the CombatStarted event
                  setEncounterId(id);

                  // Extract characters from party members and store them
                  const partyCharacters = event.party
                    .filter((member) => member.character?.id)
                    .map((member) => member.character!);

                  if (partyCharacters.length > 0) {
                    // Set character IDs for selection
                    setSelectedCharacterIds(partyCharacters.map((c) => c.id));

                    // Add characters to fullCharactersMap so getSelectedCharacters finds them
                    setFullCharactersMap((prev) => {
                      const newMap = new Map(prev);
                      partyCharacters.forEach((char) => {
                        newMap.set(char.id, char);
                      });
                      return newMap;
                    });
                  }

                  // Set combat state from the event
                  if (event.combatState) {
                    setCombatState(event.combatState);
                  }

                  if (event.room) {
                    setRoom(event.room);
                    addToast({
                      type: 'success',
                      message: 'Combat started!',
                      duration: 2000,
                    });
                  } else {
                    console.error('CombatStartedEvent missing room data');
                    addToast({
                      type: 'error',
                      message: 'Failed to start combat: missing room data',
                      duration: 3000,
                    });
                  }
                }}
              />
            ) : (
              // Solo mode - existing party setup
              <div>
                <button
                  onClick={() => setGameMode('select')}
                  className="mb-4 text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ← Back to Mode Selection
                </button>
                <PartySetupPanel
                  availableCharacters={availableCharacters}
                  selectedCharacterIds={selectedCharacterIds}
                  dungeonConfig={dungeonConfig}
                  onDungeonConfigChange={setDungeonConfig}
                  onCharacterToggle={handleCharacterToggle}
                  onStartEncounter={handleStartEncounter}
                  loading={loading}
                  charactersLoading={charactersLoading}
                  error={error}
                />
              </div>
            )
          ) : (
            // Active encounter - battle map fills available space
            // Calculate height: viewport minus combat panel (~280px) minus padding (32px top + bottom)
            <div style={{ height: 'calc(100vh - 340px)' }}>
              <BattleMapPanel
                room={room}
                selectedEntity={selectedEntity}
                availableCharacters={availableCharacters}
                onEntityClick={handleEntityClick}
                onCellClick={handleCellClick}
                // Combat integration
                encounterId={encounterId}
                combatState={combatState}
                onMoveComplete={handleMoveComplete}
                onAttackComplete={handleAttackComplete}
                onHoverChange={setHoveredEntity}
                // Door props
                doors={doors}
                onDoorClick={handleDoorClick}
                isDoorLoading={doorLoading}
              />
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

      {/* OLD Combat v2 Action Panel - COMMENTED OUT - Replaced by new CombatPanel
      <ActionPanel
        combatState={combatState}
        encounterId={encounterId}
        selectedCharacters={getSelectedCharacters()}
        room={room}
        attackTarget={attackTarget}
        onMoveAction={handleMoveAction}
        onAttackAction={handleAttackAction}
        onActivateFeature={handleActivateFeature}
        onCombatStateUpdate={handleCombatStateUpdate}
        movementMode={movementMode}
        movementPath={movementPath}
        onExecuteMove={handleExecuteMove}
        onCancelMove={handleCancelMove}
        debug={false} // Set to true for visibility testing
      */}

      {/* NEW Combat Panel - Full redesigned UI with character info and combat log */}
      {currentCharacter && (
        <CombatPanel
          character={currentCharacter}
          combatState={combatState}
          turnState={currentTurn}
          isPlayerTurn={isPlayerTurn}
          combatLog={combatLog}
          hoveredEntity={hoveredEntity}
          selectedHoverEntity={selectedHoverEntity}
          characters={availableCharacters}
          onAttack={handleAttackAction}
          onMove={handleMoveAction}
          onSpell={handleSpell}
          onFeature={handleActivateFeature}
          onBackpack={handleBackpack}
          onWeaponClick={handleWeaponClick}
          onEndTurn={handleEndTurn}
        />
      )}

      {/* Room transition overlay */}
      {isTransitioning && (
        <div
          className="fixed inset-0 bg-black pointer-events-none z-50"
          style={{ opacity: 1 }}
        />
      )}
    </>
  );
}
