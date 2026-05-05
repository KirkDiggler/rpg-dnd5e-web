import type { DungeonMapState } from '@/hooks/useDungeonMap';
import type { CubeCoord } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  EntityState,
  MonsterCombatState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useMemo } from 'react';
import { HexGrid } from '../hex-grid';
import {
  buildEntitiesFromDungeonMap,
  buildEntitiesFromEncounterState,
} from './entityBuildUtils';

interface BattleMapPanelProps {
  dungeonMap: DungeonMapState;
  selectedEntity: string | null;
  /** Local player's available characters (for isPlayerTurn check) */
  availableCharacters: Character[];
  /** All party characters including other players (for display/lookup) */
  allPartyCharacters: Character[];
  // Combat integration props for HexGrid
  encounterId?: string | null;
  combatState?: CombatState | null;
  /** Monster combat state for texture selection (includes monsterType) */
  monsters?: MonsterCombatState[];
  /** Unified entity state from useEncounterState - preferred over legacy props */
  encounterEntities?: Map<string, EntityState>;
  onEntityClick: (entityId: string) => void;
  onCellClick: (coord: CubeCoord) => void;
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (
    entity: { id: string; type: string; name: string } | null
  ) => void;
  onDoorClick?: (connectionId: string) => void;
  isDoorLoading?: boolean;
}

export function BattleMapPanel({
  dungeonMap,
  selectedEntity,
  availableCharacters,
  allPartyCharacters,
  encounterId,
  combatState,
  monsters,
  encounterEntities,
  onEntityClick,
  onCellClick,
  onMoveComplete,
  onAttackComplete,
  onHoverChange,
  onDoorClick,
  isDoorLoading,
}: BattleMapPanelProps) {
  // Build a set of dead monster IDs so we can exclude them from the grid
  const deadMonsterIds = useMemo(() => {
    const ids = new Set<string>();
    if (monsters) {
      for (const m of monsters) {
        if (m.currentHitPoints <= 0) {
          ids.add(m.monsterId);
        }
      }
    }
    return ids;
  }, [monsters]);

  // Build entities array for HexGrid.
  // Prefers unified encounter state (all rooms, dungeon-absolute positions).
  // Falls back to accumulated dungeonMap entities (legacy path).
  const entities = useMemo(() => {
    if (encounterEntities && encounterEntities.size > 0) {
      return buildEntitiesFromEncounterState(encounterEntities);
    }
    return buildEntitiesFromDungeonMap(
      dungeonMap.entities,
      allPartyCharacters,
      deadMonsterIds
    );
  }, [
    encounterEntities,
    dungeonMap.entities,
    allPartyCharacters,
    deadMonsterIds,
  ]);

  // Convert doors map to array for HexGrid
  const doorsArray = useMemo(
    () => Array.from(dungeonMap.doors.values()),
    [dungeonMap.doors]
  );

  // Convert walls map to array for HexGrid
  const walls = useMemo(
    () => Array.from(dungeonMap.walls.values()),
    [dungeonMap.walls]
  );

  return (
    <div
      className="rounded-lg"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        height: '100%',
      }}
    >
      <HexGrid
        floorTiles={dungeonMap.floorTiles}
        entities={entities}
        selectedEntityId={selectedEntity || undefined}
        onHexClick={onCellClick}
        onEntityClick={onEntityClick}
        encounterId={encounterId}
        combatState={combatState}
        characters={allPartyCharacters}
        monsters={monsters}
        currentEntityId={combatState?.currentTurn?.entityId}
        movementRemaining={
          combatState?.currentTurn
            ? (combatState.currentTurn.movementMax || 30) -
              (combatState.currentTurn.movementUsed || 0)
            : 0
        }
        isPlayerTurn={
          combatState?.currentTurn?.entityId
            ? availableCharacters.some(
                (c) => c.id === combatState.currentTurn?.entityId
              )
            : false
        }
        onMoveComplete={onMoveComplete}
        onAttackComplete={onAttackComplete}
        onHoverChange={onHoverChange}
        doors={doorsArray}
        onDoorClick={onDoorClick}
        isDoorLoading={isDoorLoading}
        walls={walls}
      />
    </div>
  );
}
