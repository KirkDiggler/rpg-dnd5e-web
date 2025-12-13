import type { DamageNumber } from '@/types/combat';
import { formatCharacterSummary } from '@/utils/displayNames';
import type { CubeCoord } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { HexGridV2 } from '../hex-grid-v2';
import { HexGrid } from '../HexGrid';
import { VoxelGrid } from '../VoxelGrid';

// Re-export for consumers that import from here
export type { DamageNumber } from '@/types/combat';

interface BattleMapPanelProps {
  room: Room;
  selectedEntity: string | null;
  hoveredEntity: string | null;
  availableCharacters: Character[];
  attackTarget?: string | null;
  movementMode?: boolean;
  movementRange?: number;
  movementPath?: CubeCoord[];
  damageNumbers?: DamageNumber[];
  onEntityClick: (entityId: string) => void;
  onEntityHover: (entityId: string | null) => void;
  onCellClick: (coord: CubeCoord) => void;
  onCellDoubleClick?: (coord: CubeCoord) => void;
  // Combat integration props for HexGridV2
  encounterId?: string | null;
  combatState?: CombatState | null;
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
}

type ViewMode = '2d' | '3d' | '3d-v2';

export function BattleMapPanel({
  room,
  selectedEntity,
  hoveredEntity,
  availableCharacters,
  attackTarget,
  movementMode,
  movementRange,
  movementPath,
  damageNumbers,
  onEntityClick,
  onEntityHover,
  onCellClick,
  onCellDoubleClick,
  encounterId,
  combatState,
  onMoveComplete,
  onAttackComplete,
}: BattleMapPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('3d'); // Default to 3D view

  // Find the hovered character and entity directly from protobuf data
  const hoveredCharacter = hoveredEntity
    ? availableCharacters.find((c) => c.id === hoveredEntity)
    : null;
  const hoveredEntityData =
    hoveredEntity && room.entities
      ? Object.values(room.entities).find((e) => e.entityId === hoveredEntity)
      : null;

  return (
    <div
      className="rounded-lg p-2"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
      }}
    >
      {/* Compact Header - view toggle and info */}
      <div className="flex justify-end items-center gap-3 mb-2">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('2d')}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                viewMode === '2d'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: viewMode === '2d' ? 'white' : 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            2D
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                viewMode === '3d'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: viewMode === '3d' ? 'white' : 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            3D
          </button>
          <button
            onClick={() => setViewMode('3d-v2')}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                viewMode === '3d-v2'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: viewMode === '3d-v2' ? 'white' : 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            3D v2
          </button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {room.type} • {room.width}×{room.height}
        </div>
      </div>

      {/* Grid - 2D, 3D, or 3D v2 */}
      <div className="flex justify-center">
        {viewMode === '2d' ? (
          <HexGrid
            room={room}
            cellSize={28}
            selectedCharacter={selectedEntity}
            attackTarget={attackTarget}
            movementMode={movementMode}
            movementRange={movementRange}
            movementPath={movementPath}
            damageNumbers={damageNumbers}
            onEntityClick={onEntityClick}
            onEntityHover={onEntityHover}
            onCellClick={onCellClick}
            onCellDoubleClick={onCellDoubleClick}
          />
        ) : viewMode === '3d' ? (
          <VoxelGrid
            room={room}
            selectedCharacter={selectedEntity}
            movementMode={movementMode}
            movementRange={movementRange}
            damageNumbers={damageNumbers}
            onEntityClick={onEntityClick}
            onEntityHover={onEntityHover}
            onCellClick={onCellClick}
            onCellDoubleClick={onCellDoubleClick}
          />
        ) : (
          <HexGridV2
            gridWidth={room.width}
            gridHeight={room.height}
            entities={Object.values(room.entities || {}).map((entity) => ({
              entityId: entity.entityId,
              name:
                availableCharacters.find((c) => c.id === entity.entityId)
                  ?.name || entity.entityId,
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
          />
        )}
      </div>

      {/* Entity Hover Info - Using protobuf types directly */}
      {hoveredEntity && hoveredEntityData && (
        <div
          className="mt-4 p-3 rounded"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <h5
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {hoveredCharacter?.name || hoveredEntityData.entityId}
              </h5>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {hoveredCharacter
                  ? formatCharacterSummary(
                      hoveredCharacter.level,
                      hoveredCharacter.race,
                      hoveredCharacter.class
                    )
                  : `Type: ${hoveredEntityData.entityType}`}
              </p>
              {hoveredEntityData.position && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Position: ({hoveredEntityData.position.x},{' '}
                  {hoveredEntityData.position.y})
                </p>
              )}
            </div>
            <div className="text-right">
              {hoveredCharacter && (
                <>
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {hoveredCharacter.currentHitPoints} HP
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    AC: {hoveredCharacter.combatStats?.armorClass || 10}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
