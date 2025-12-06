import {
  useActivateFeature,
  useAttack,
  useDungeonStart,
  useListCharacters,
  useMoveCharacter,
} from '@/api';
import { useDiscord } from '@/discord';
import { findHexPath, hexDistance } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { CombatPanel } from './combat-v2';
import { usePlayerTurn } from './combat-v2/hooks/usePlayerTurn';
import { BattleMapPanel, type DamageNumber } from './encounter/BattleMapPanel';
import { InitiativePanel } from './encounter/InitiativePanel';
import { PartySetupPanel } from './encounter/PartySetupPanel';
import { Equipment } from './Equipment';
import { useToast } from './ui';

export function EncounterDemo() {
  const { dungeonStart, loading, error } = useDungeonStart();
  const { moveCharacter } = useMoveCharacter();
  const { attack } = useAttack();
  const { activateFeature } = useActivateFeature();
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

  // Character selection state
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  const [attackTarget, setAttackTarget] = useState<string | null>(null);

  // UI state
  const [equipmentCharacterId, setEquipmentCharacterId] = useState<
    string | null
  >(null);
  const [movementMode, setMovementMode] = useState(false);
  const [movementPath, setMovementPath] = useState<
    Array<{ x: number; y: number }>
  >([]);

  // Damage number state
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);

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
      const currentEntity = room?.entities[currentTurnEntityId];
      if (currentEntity?.position && clickedEntity.position) {
        const distance = hexDistance(
          currentEntity.position.x,
          currentEntity.position.y,
          clickedEntity.position.x,
          clickedEntity.position.y
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

  // Double-click: move directly to target hex in one action
  const handleCellDoubleClick = async (x: number, y: number) => {
    // Need a selected entity and encounter
    const currentTurnEntityId = combatState?.currentTurn?.entityId;
    if (!currentTurnEntityId || !encounterId) return;

    const entityPos = room?.entities[currentTurnEntityId]?.position;
    if (!entityPos) return;

    // Get occupied positions (excluding the current turn entity)
    const occupiedPositions = new Set<string>();
    if (room?.entities) {
      Object.values(room.entities).forEach((entity) => {
        if (
          entity.position &&
          entity.blocksMovement &&
          entity.entityId !== currentTurnEntityId
        ) {
          occupiedPositions.add(`${entity.position.x},${entity.position.y}`);
        }
      });
    }

    // Find path from entity position to clicked hex (ignore any existing path for double-click)
    const pathToTarget = findHexPath(
      { x: entityPos.x, y: entityPos.y },
      { x, y },
      occupiedPositions
    );

    // Validate total movement cost
    const pathCost = pathToTarget.length * 5;
    const maxMovement = combatState?.currentTurn?.movementMax || 30;
    const usedMovement = combatState?.currentTurn?.movementUsed || 0;

    if (pathCost > maxMovement - usedMovement) {
      addToast({
        type: 'error',
        message: `Not enough movement! Need ${pathCost}ft, have ${maxMovement - usedMovement}ft remaining`,
        duration: 3000,
      });
      return;
    }

    if (pathToTarget.length === 0) return;

    try {
      const response = await moveCharacter(
        encounterId,
        currentTurnEntityId,
        pathToTarget
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

        setMovementPath([]);
        setMovementMode(false);

        addToast({
          type: 'success',
          message: `Moved ${pathToTarget.length * 5}ft`,
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
    if (!encounterId || !combatState?.currentTurn?.entityId || !attackTarget) {
      console.warn('Missing required data for attack', {
        encounterId,
        attackerId: combatState?.currentTurn?.entityId,
        attackTarget,
      });
      return;
    }

    try {
      const response = await attack(
        encounterId,
        combatState.currentTurn.entityId,
        attackTarget
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
        // TODO: ListCharacters doesn't include equipmentSlots - need API update to include weapon name
        const attackerId = combatState.currentTurn.entityId;
        const attackerChar = availableCharacters.find(
          (c) => c.id === attackerId
        );
        const weaponName =
          attackerChar?.equipmentSlots?.mainHand?.equipment?.name || 'Weapon';

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
              // Use weapon name for "weapon" source, otherwise capitalize source
              const source =
                comp.source === 'weapon'
                  ? weaponName
                  : comp.source.charAt(0).toUpperCase() + comp.source.slice(1);
              return `  ${source}: ${diceStr}${bonusStr}`;
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

          // Add floating damage number
          const damageId = `${attackTarget}-${Date.now()}`;
          setDamageNumbers((prev) => [
            ...prev,
            {
              id: damageId,
              entityId: attackTarget,
              damage,
              isCritical: critical,
            },
          ]);

          // Remove after animation completes (1.5 seconds)
          setTimeout(() => {
            setDamageNumbers((prev) => prev.filter((dn) => dn.id !== damageId));
          }, 1500);
        }
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

  return (
    <>
      <div
        className="min-h-screen p-8"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-[1800px] mx-auto">
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
            // Active encounter - use flex for reliable side-by-side layout
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {/* Battle map - takes remaining space */}
              <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                <BattleMapPanel
                  room={room}
                  selectedEntity={selectedEntity}
                  hoveredEntity={hoveredEntity}
                  availableCharacters={availableCharacters}
                  attackTarget={attackTarget}
                  movementMode={movementMode}
                  movementRange={
                    combatState?.currentTurn?.movementMax
                      ? combatState.currentTurn.movementMax -
                        (combatState.currentTurn.movementUsed || 0)
                      : 0
                  }
                  movementPath={movementPath}
                  damageNumbers={damageNumbers}
                  onEntityClick={handleEntityClick}
                  onEntityHover={handleEntityHover}
                  onCellClick={handleCellClick}
                  onCellDoubleClick={handleCellDoubleClick}
                />
              </div>

              {/* Initiative & controls - fixed width sidebar */}
              <div style={{ width: '320px', flexShrink: 0 }}>
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
      />
      */}

      {/* NEW Combat Panel - Full redesigned UI with character info and combat log */}
      {currentCharacter && (
        <CombatPanel
          character={currentCharacter}
          combatState={combatState}
          turnState={currentTurn}
          isPlayerTurn={isPlayerTurn}
          onAttack={handleAttackAction}
          onMove={handleMoveAction}
          onSpell={handleSpell}
          onFeature={handleActivateFeature}
          onBackpack={handleBackpack}
          onWeaponClick={handleWeaponClick}
        />
      )}
    </>
  );
}
