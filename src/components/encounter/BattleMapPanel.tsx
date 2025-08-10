import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { Room } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { HexGrid } from '../HexGrid';

interface BattleMapPanelProps {
  room: Room;
  selectedEntity: string | null;
  hoveredEntity: string | null;
  availableCharacters: Character[];
  movementMode?: boolean;
  movementRange?: number;
  onEntityClick: (entityId: string) => void;
  onEntityHover: (entityId: string | null) => void;
  onCellClick: (x: number, y: number) => void;
}

export function BattleMapPanel({
  room,
  selectedEntity,
  hoveredEntity,
  availableCharacters,
  movementMode,
  movementRange,
  onEntityClick,
  onEntityHover,
  onCellClick,
}: BattleMapPanelProps) {
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
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2
          className="text-xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Battle Map
        </h2>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {room.type} • {room.width}×{room.height}
        </div>
      </div>

      {/* Hex Grid */}
      <div className="flex justify-center">
        <HexGrid
          room={room}
          cellSize={35}
          selectedCharacter={selectedEntity}
          movementMode={movementMode}
          movementRange={movementRange}
          onEntityClick={onEntityClick}
          onEntityHover={onEntityHover}
          onCellClick={onCellClick}
        />
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
