import type { DamageNumber } from '@/types/combat';
import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { Room } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
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
  movementPath?: Array<{ x: number; y: number }>;
  damageNumbers?: DamageNumber[];
  onEntityClick: (entityId: string) => void;
  onEntityHover: (entityId: string | null) => void;
  onCellClick: (x: number, y: number) => void;
  onCellDoubleClick?: (x: number, y: number) => void;
}

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
}: BattleMapPanelProps) {
  const [view3D, setView3D] = useState(false);

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
      {/* Compact Header - just view toggle and info */}
      <div className="flex justify-end items-center gap-3 mb-2">
        <button
          onClick={() => setView3D(!view3D)}
          className="px-2 py-1 rounded text-xs font-medium transition-colors"
          style={{
            backgroundColor: view3D
              ? 'var(--accent-primary)'
              : 'var(--bg-secondary)',
            color: view3D ? 'white' : 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {view3D ? '3D View' : '2D View'}
        </button>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {room.type} • {room.width}×{room.height}
        </div>
      </div>

      {/* Grid - 2D or 3D */}
      <div className="flex justify-center">
        {view3D ? (
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
          <HexGrid
            room={room}
            cellSize={35}
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
