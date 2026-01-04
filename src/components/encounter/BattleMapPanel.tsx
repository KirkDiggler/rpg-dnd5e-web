import type { CubeCoord } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  DoorInfo,
  MonsterCombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { HexGrid } from '../hex-grid';

interface BattleMapPanelProps {
  room: Room;
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
  onEntityClick: (entityId: string) => void;
  onCellClick: (coord: CubeCoord) => void;
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (
    entity: { id: string; type: string; name: string } | null
  ) => void;
  // Door props
  doors?: DoorInfo[];
  onDoorClick?: (connectionId: string) => void;
  isDoorLoading?: boolean;
}

export function BattleMapPanel({
  room,
  selectedEntity,
  availableCharacters,
  allPartyCharacters,
  encounterId,
  combatState,
  monsters,
  onEntityClick,
  onCellClick,
  onMoveComplete,
  onAttackComplete,
  onHoverChange,
  doors,
  onDoorClick,
  isDoorLoading,
}: BattleMapPanelProps) {
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
        gridWidth={room.width}
        gridHeight={room.height}
        entities={Object.values(room.entities || {}).map((entity) => {
          // Map proto entity type to display type
          let displayType: 'player' | 'monster' | 'obstacle';
          const entityType = entity.entityType?.toUpperCase() || '';
          if (entityType === 'CHARACTER') {
            displayType = 'player';
          } else if (entityType === 'MONSTER') {
            displayType = 'monster';
          } else {
            // PILLAR, OBSTACLE, or any other type becomes obstacle
            displayType = 'obstacle';
          }

          return {
            entityId: entity.entityId,
            name:
              allPartyCharacters.find((c) => c.id === entity.entityId)?.name ||
              entity.entityId,
            position: {
              x: entity.position?.x || 0,
              y: entity.position?.y || 0,
              z: entity.position?.z || 0,
            },
            type: displayType,
          };
        })}
        selectedEntityId={selectedEntity || undefined}
        onHexClick={onCellClick}
        onEntityClick={onEntityClick}
        // Combat integration
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
        doors={doors}
        onDoorClick={onDoorClick}
        isDoorLoading={isDoorLoading}
        walls={room.walls}
      />
    </div>
  );
}
