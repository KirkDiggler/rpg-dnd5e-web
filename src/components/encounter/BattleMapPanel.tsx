import type { CubeCoord } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { HexGrid } from '../hex-grid';

interface BattleMapPanelProps {
  room: Room;
  selectedEntity: string | null;
  availableCharacters: Character[];
  // Combat integration props for HexGrid
  encounterId?: string | null;
  combatState?: CombatState | null;
  onEntityClick: (entityId: string) => void;
  onCellClick: (coord: CubeCoord) => void;
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (entity: { id: string; type: string } | null) => void;
}

export function BattleMapPanel({
  room,
  selectedEntity,
  availableCharacters,
  encounterId,
  combatState,
  onEntityClick,
  onCellClick,
  onMoveComplete,
  onAttackComplete,
  onHoverChange,
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
        entities={Object.values(room.entities || {}).map((entity) => ({
          entityId: entity.entityId,
          name:
            availableCharacters.find((c) => c.id === entity.entityId)?.name ||
            entity.entityId,
          position: {
            x: entity.position?.x || 0,
            y: entity.position?.y || 0,
            z: entity.position?.z || 0,
          },
          type: entity.entityType === 'CHARACTER' ? 'player' : 'monster',
        }))}
        selectedEntityId={selectedEntity || undefined}
        onHexClick={onCellClick}
        onEntityClick={onEntityClick}
        // Combat integration
        encounterId={encounterId}
        combatState={combatState}
        characters={availableCharacters}
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
      />
    </div>
  );
}
