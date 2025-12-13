import type { DamageNumber } from '@/types/combat';
import {
  cubeKey,
  cubeToOffset,
  hexDistance,
  offsetToCube,
  type CubeCoord,
} from '@/utils/hexUtils';
import { GridType } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  EntityPlacement,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import React from 'react';

interface HexGridProps {
  room: Room;
  cellSize?: number;
  selectedCharacter?: string | null;
  attackTarget?: string | null;
  movementMode?: boolean;
  movementRange?: number;
  movementPath?: CubeCoord[];
  damageNumbers?: DamageNumber[];
  onCellClick?: (coord: CubeCoord) => void;
  onCellDoubleClick?: (coord: CubeCoord) => void;
  onEntityClick?: (entityId: string) => void;
  onEntityHover?: (entityId: string | null) => void;
}

// Hex math constants
const SQRT_3 = Math.sqrt(3);

// Convert cube coordinates to pixel coordinates (pointy-top hex, odd-r offset)
// Uses offset conversion internally for correct positioning
function cubeToPixel(cube: CubeCoord, size: number): { x: number; y: number } {
  const offset = cubeToOffset(cube);
  return offsetToPixel(offset.col, offset.row, size);
}

// Convert offset coordinates to pixel coordinates (pointy-top hex, odd-r offset)
// This is the standard pointy-top hex layout where:
// - Rows are horizontal
// - Odd rows are shifted right by half a hex width
function offsetToPixel(
  col: number,
  row: number,
  size: number
): { x: number; y: number } {
  // For pointy-top hexes (odd-r offset):
  // - Horizontal spacing between column centers: sqrt(3) * size
  // - Vertical spacing between row centers: 1.5 * size
  // - Odd rows are shifted right by sqrt(3)/2 * size
  const pixelX = size * SQRT_3 * (col + (row & 1) * 0.5);
  const pixelY = size * 1.5 * row;
  return { x: pixelX, y: pixelY };
}

// Create SVG path for a hexagon
function hexPath(cx: number, cy: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // Start at the top
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M ${points.join(' L ')} Z`;
}

// Get entity color based on type
function getEntityColor(
  entityType: string,
  entityId?: string,
  selectedCharacter?: string | null,
  isHovered?: boolean
): string {
  let baseColor = '#6b7280';
  switch (entityType.toLowerCase()) {
    case 'character':
    case 'player':
      baseColor = '#3B82F6'; // Bright blue
      break;
    case 'monster':
    case 'enemy':
      baseColor = '#EF4444'; // Bright red
      break;
    case 'object':
      baseColor = '#10B981'; // Emerald green
      break;
    default:
      baseColor = '#6b7280'; // Gray
      break;
  }

  // Highlight selected character
  if (entityId && selectedCharacter === entityId) {
    return '#FCD34D'; // Bright amber for selected
  }

  // Brighten on hover
  if (isHovered) {
    // Convert hex to RGB and brighten
    const hex = baseColor.replace('#', '');
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + 40);
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + 40);
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + 40);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return baseColor;
}

// Get a better entity display name
function getEntityDisplayName(entity: EntityPlacement): string {
  const entityId = entity.entityId;

  // Check if it looks like a character ID (e.g., "char-1" or similar)
  if (entityId.includes('char-')) {
    const num = entityId.split('-').pop();
    return `C${num}`;
  }

  // Check if it's a monster (common patterns)
  if (entityId.toLowerCase().includes('goblin')) return 'Gob';
  if (entityId.toLowerCase().includes('orc')) return 'Orc';
  if (entityId.toLowerCase().includes('skeleton')) return 'Skel';
  if (entityId.toLowerCase().includes('zombie')) return 'Zom';

  // For generated IDs with underscores, take initials
  if (entityId.includes('_')) {
    const parts = entityId.split('_');
    // If last part is a short ID, use it
    const lastPart = parts[parts.length - 1];
    if (lastPart.length <= 4) {
      return lastPart.toUpperCase();
    }
    // Otherwise take first 3 chars
    return lastPart.substring(0, 3).toUpperCase();
  }

  // Default: take first 3-4 characters
  return entityId.substring(0, Math.min(4, entityId.length)).toUpperCase();
}

export function HexGrid({
  room,
  cellSize = 30,
  selectedCharacter,
  attackTarget,
  movementMode = false,
  movementRange = 0,
  movementPath = [],
  damageNumbers = [],
  onCellClick,
  onCellDoubleClick,
  onEntityClick,
  onEntityHover,
}: HexGridProps) {
  // Track hovered cell using cube coordinates
  const [hoveredCell, setHoveredCell] = React.useState<CubeCoord | null>(null);
  const [hoveredEntity, setHoveredEntity] = React.useState<string | null>(null);

  const { width, height } = room;

  // Calculate SVG dimensions based on hex layout
  const svgWidth = cellSize * SQRT_3 * (width + 0.5) + cellSize;
  const svgHeight = cellSize * 1.5 * height + cellSize / 2 + cellSize;

  // Get selected character's position for movement calculations
  // Server provides cube coordinates in position.x, position.y, position.z
  const selectedEntity = selectedCharacter
    ? Object.values(room.entities).find((e) => e.entityId === selectedCharacter)
    : null;
  const selectedPos = selectedEntity?.position
    ? {
        x: selectedEntity.position.x,
        y: selectedEntity.position.y,
        z: selectedEntity.position.z,
      }
    : null;

  // Calculate valid movement cells (5ft per hex)
  const validMovementCells = React.useMemo(() => {
    if (!movementMode || !selectedPos || movementRange <= 0)
      return new Set<string>();

    const valid = new Set<string>();

    // Calculate starting position and remaining movement
    const startPos: CubeCoord =
      movementPath && movementPath.length > 0
        ? movementPath[movementPath.length - 1] // Start from last path position
        : selectedPos; // Or from entity's current position

    // Calculate movement used by path
    let movementUsed = 0;
    if (movementPath && movementPath.length > 0) {
      let prev = selectedPos;
      for (const pos of movementPath) {
        movementUsed +=
          hexDistance(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z) * 5; // 5ft per hex
        prev = pos;
      }
    }

    const remainingMovement = movementRange - movementUsed;
    const remainingHexes = Math.floor(remainingMovement / 5);

    if (remainingHexes <= 0) return new Set(); // No movement left

    // Create a Set of occupied positions for O(1) lookup (using cube key)
    const occupiedPositions = new Set<string>();
    Object.values(room.entities).forEach((entity) => {
      if (entity.position) {
        occupiedPositions.add(
          cubeKey({
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
          })
        );
      }
    });

    // Convert start position to offset for bounding box calculation
    const startOffset = cubeToOffset(startPos);
    const minCol = Math.max(0, startOffset.col - remainingHexes);
    const maxCol = Math.min(width - 1, startOffset.col + remainingHexes);
    const minRow = Math.max(0, startOffset.row - remainingHexes);
    const maxRow = Math.min(height - 1, startOffset.row + remainingHexes);

    // Iterate over offset grid and convert to cube for distance calculation
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellCube = offsetToCube({ col, row });
        const distance = hexDistance(
          startPos.x,
          startPos.y,
          startPos.z,
          cellCube.x,
          cellCube.y,
          cellCube.z
        );
        if (distance <= remainingHexes && distance > 0) {
          const cellKey = cubeKey(cellCube);
          // Don't allow occupied positions
          if (!occupiedPositions.has(cellKey)) {
            valid.add(cellKey);
          }
        }
      }
    }

    return valid;
  }, [
    movementMode,
    selectedPos,
    movementRange,
    width,
    height,
    room.entities,
    movementPath,
  ]);

  // Only render hex grids
  if (room.gridType !== GridType.HEX_POINTY) {
    return (
      <div className="text-center p-8" style={{ color: 'var(--text-muted)' }}>
        Unsupported grid type: {room.gridType}
      </div>
    );
  }

  // Generate grid cells (iterate in offset coordinates, convert to cube for logic)
  const gridCells = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cellCube = offsetToCube({ col, row });
      const { x: pixelX, y: pixelY } = offsetToPixel(col, row, cellSize);
      const centerX = pixelX + (cellSize * SQRT_3) / 2;
      const centerY = pixelY + cellSize;
      const cellKey = cubeKey(cellCube);
      const isHovered = hoveredCell && cubeKey(hoveredCell) === cellKey;
      const isValidMove = validMovementCells.has(cellKey);
      const isInPath =
        movementPath?.some((p) => cubeKey(p) === cellKey) || false;

      let fill = 'transparent';
      let stroke = 'var(--border-primary)';
      let strokeWidth = '1';
      let opacity = '0.3';

      if (isInPath) {
        fill = 'rgba(59, 130, 246, 0.5)'; // Blue for path cells
        stroke = '#3B82F6';
        strokeWidth = '3';
        opacity = '1';
      } else if (movementMode && isValidMove) {
        fill = isHovered ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.2)';
        stroke = '#22C55E';
        strokeWidth = '2';
        opacity = '0.8';
      } else if (isHovered && !movementMode) {
        fill = 'rgba(99, 102, 241, 0.1)';
      }

      gridCells.push(
        <path
          key={`hex-${col}-${row}`}
          d={hexPath(centerX, centerY, cellSize * 0.95)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={opacity}
          style={{
            cursor:
              onCellClick && (!movementMode || isValidMove)
                ? 'pointer'
                : 'default',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={() => setHoveredCell(cellCube)}
          onMouseLeave={() => setHoveredCell(null)}
          onClick={() => {
            if (onCellClick && (!movementMode || isValidMove)) {
              onCellClick(cellCube);
            }
          }}
          onDoubleClick={() => {
            // Double-click always allowed - it will validate movement in the handler
            if (onCellDoubleClick) {
              onCellDoubleClick(cellCube);
            }
          }}
        />
      );
    }
  }

  // Generate entity markers with better visual design
  const entityMarkers: React.ReactNode[] = [];
  Object.values(room.entities).forEach((entity) => {
    if (!entity.position) return;

    // Server provides cube coordinates in position.x, position.y, position.z
    const entityCube: CubeCoord = {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    };
    const entityOffset = cubeToOffset(entityCube);

    // Validate coordinates are within grid bounds (using offset)
    if (
      entityOffset.col < 0 ||
      entityOffset.col >= width ||
      entityOffset.row < 0 ||
      entityOffset.row >= height
    )
      return;

    const { x: pixelX, y: pixelY } = cubeToPixel(entityCube, cellSize);
    const centerX = pixelX + (cellSize * SQRT_3) / 2;
    const centerY = pixelY + cellSize;

    const isHovered = hoveredEntity === entity.entityId;
    const isSelected = entity.entityId === selectedCharacter;
    const isAttackTarget = entity.entityId === attackTarget;
    const color = getEntityColor(
      entity.entityType,
      entity.entityId,
      selectedCharacter,
      isHovered
    );
    const displayName = getEntityDisplayName(entity);

    // Determine if this is a player character or enemy
    const isPlayer =
      entity.entityType.toLowerCase() === 'character' ||
      entity.entityType.toLowerCase() === 'player';

    entityMarkers.push(
      <g key={`entity-${entity.entityId}`}>
        {/* Outer glow for selected entities */}
        {isSelected && (
          <circle
            cx={centerX}
            cy={centerY}
            r={cellSize * 0.85}
            fill="none"
            stroke="#FCD34D"
            strokeWidth="3"
            opacity="0.5"
            strokeDasharray="5,3"
            className="animate-pulse"
          />
        )}

        {/* Attack target indicator - red pulsing ring */}
        {isAttackTarget && (
          <circle
            cx={centerX}
            cy={centerY}
            r={cellSize * 0.9}
            fill="none"
            stroke="#EF4444"
            strokeWidth="4"
            opacity="0.7"
            strokeDasharray="3,2"
            className="animate-pulse"
          />
        )}

        {/* Entity circle with gradient */}
        <defs>
          <radialGradient id={`grad-${entity.entityId}`}>
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.7" />
          </radialGradient>
        </defs>

        <circle
          cx={centerX}
          cy={centerY}
          r={cellSize * 0.7}
          fill={`url(#grad-${entity.entityId})`}
          stroke={isSelected ? '#FCD34D' : color}
          strokeWidth={isSelected ? '3' : '2'}
          opacity={isHovered ? '1' : '0.9'}
          style={{
            cursor: onEntityClick ? 'pointer' : 'default',
            filter: isHovered ? 'brightness(1.2)' : 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={() => {
            setHoveredEntity(entity.entityId);
            onEntityHover?.(entity.entityId);
          }}
          onMouseLeave={() => {
            setHoveredEntity(null);
            onEntityHover?.(null);
          }}
          onClick={() => onEntityClick?.(entity.entityId)}
        />

        {/* Entity icon/label with better styling */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Background for text */}
          <circle
            cx={centerX}
            cy={centerY}
            r={cellSize * 0.35}
            fill="rgba(0, 0, 0, 0.7)"
            opacity="0.8"
          />

          {/* Entity label */}
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dy="0.35em"
            fill="white"
            fontSize={cellSize * 0.35}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {displayName}
          </text>

          {/* Small type indicator */}
          <text
            x={centerX}
            y={centerY + cellSize * 0.45}
            textAnchor="middle"
            fill={isPlayer ? '#60A5FA' : '#F87171'}
            fontSize={cellSize * 0.2}
            fontWeight="normal"
          >
            {isPlayer ? 'PC' : 'NPC'}
          </text>
        </g>
      </g>
    );
  });

  // Add path step numbers
  const pathMarkers =
    movementPath?.map((pos, idx) => {
      const { x: pixelX, y: pixelY } = cubeToPixel(pos, cellSize);
      const centerX = pixelX + (cellSize * SQRT_3) / 2;
      const centerY = pixelY + cellSize;

      return (
        <text
          key={`path-num-${idx}`}
          x={centerX}
          y={centerY - cellSize * 0.3}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#FFFFFF"
          fontSize={cellSize * 0.5}
          fontWeight="bold"
          stroke="#000000"
          strokeWidth="1"
          style={{ pointerEvents: 'none' }}
        >
          {idx + 1}
        </text>
      );
    }) || [];

  // Render floating damage numbers
  const damageNumberElements = damageNumbers.map((dmg) => {
    const entity = Object.values(room.entities).find(
      (e) => e.entityId === dmg.entityId
    );
    if (!entity?.position) return null;

    const entityCube: CubeCoord = {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    };
    const { x: pixelX, y: pixelY } = cubeToPixel(entityCube, cellSize);
    const centerX = pixelX + (cellSize * SQRT_3) / 2;
    const centerY = pixelY + cellSize;

    return (
      <g key={dmg.id} className="damage-number">
        <style>
          {`
            @keyframes floatUp {
              0% {
                transform: translateY(0);
                opacity: 1;
              }
              100% {
                transform: translateY(-50px);
                opacity: 0;
              }
            }
            .damage-number {
              animation: floatUp 1.5s ease-out forwards;
            }
          `}
        </style>
        <text
          x={centerX}
          y={centerY - cellSize * 0.8}
          textAnchor="middle"
          fill={dmg.isCritical ? '#FCD34D' : '#EF4444'}
          fontSize={dmg.isCritical ? cellSize * 0.8 : cellSize * 0.6}
          fontWeight="bold"
          stroke="#000000"
          strokeWidth="2"
          style={{ pointerEvents: 'none' }}
        >
          {dmg.isCritical ? `CRIT! ${dmg.damage}` : dmg.damage}
        </text>
      </g>
    );
  });

  return (
    <div
      className="hex-grid-container"
      style={{ maxHeight: 'calc(100vh - 420px)', overflow: 'auto' }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 450px)',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '2px solid var(--border-primary)',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Grid cells */}
        <g className="grid-cells">{gridCells}</g>

        {/* Path markers */}
        <g className="path-markers">{pathMarkers}</g>

        {/* Entity markers */}
        <g className="entity-markers">{entityMarkers}</g>

        {/* Floating damage numbers */}
        {damageNumberElements}
      </svg>

      {/* Compact Legend */}
      <div
        className="mt-2 px-2 py-1 rounded"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#3B82F6' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>PC</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#EF4444' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Enemy</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#FCD34D' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Selected</span>
          </div>
          {movementMode && (
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3"
                style={{
                  background: 'rgba(34, 197, 94, 0.3)',
                  border: '1px solid #22C55E',
                }}
              />
              <span style={{ color: '#22C55E' }}>
                Move ({Math.floor(movementRange / 5)}hex)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
