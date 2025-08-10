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
  movementMode?: boolean;
  movementRange?: number;
  onCellClick?: (x: number, y: number) => void;
  onEntityClick?: (entityId: string) => void;
  onEntityHover?: (entityId: string | null) => void;
}

// Hex math constants
const SQRT_3 = Math.sqrt(3);

// Calculate hex distance (using offset coordinates with proper conversion)
function hexDistance(x1: number, y1: number, x2: number, y2: number): number {
  // Convert offset to cube coordinates for accurate distance
  // For odd-r offset coordinates (pointy-top hexes)
  const cubeX1 = x1;
  const cubeZ1 = y1 - (x1 - (x1 & 1)) / 2;
  const cubeY1 = -cubeX1 - cubeZ1;

  const cubeX2 = x2;
  const cubeZ2 = y2 - (x2 - (x2 & 1)) / 2;
  const cubeY2 = -cubeX2 - cubeZ2;

  // Manhattan distance in cube coordinates divided by 2
  return Math.max(
    Math.abs(cubeX1 - cubeX2),
    Math.abs(cubeY1 - cubeY2),
    Math.abs(cubeZ1 - cubeZ2)
  );
}

// Convert hex grid coordinates to pixel coordinates (pointy-top hex)
function hexToPixel(
  x: number,
  y: number,
  size: number
): { x: number; y: number } {
  const pixelX = size * SQRT_3 * (x + y / 2);
  const pixelY = size * 1.5 * y;
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
  movementMode = false,
  movementRange = 0,
  onCellClick,
  onEntityClick,
  onEntityHover,
}: HexGridProps) {
  const [hoveredCell, setHoveredCell] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredEntity, setHoveredEntity] = React.useState<string | null>(null);

  const { width, height } = room;

  // Calculate SVG dimensions based on hex layout
  const svgWidth = cellSize * SQRT_3 * (width + 0.5) + cellSize;
  const svgHeight = cellSize * 1.5 * height + cellSize / 2 + cellSize;

  // Get selected character's position for movement calculations
  const selectedEntity = selectedCharacter
    ? Object.values(room.entities).find((e) => e.entityId === selectedCharacter)
    : null;
  const selectedPos = selectedEntity?.position;

  // Calculate valid movement cells (5ft per hex)
  const validMovementCells = React.useMemo(() => {
    if (!movementMode || !selectedPos || movementRange <= 0)
      return new Set<string>();

    const valid = new Set<string>();
    const rangeInHexes = Math.floor(movementRange / 5); // 5ft per hex

    // Create a Set of occupied positions for O(1) lookup
    const occupiedPositions = new Set<string>();
    Object.values(room.entities).forEach((entity) => {
      if (entity.position) {
        occupiedPositions.add(`${entity.position.x},${entity.position.y}`);
      }
    });

    // Only check cells within a bounding box around the selected position
    // This reduces the search space from O(width * height) to O(rangeInHexes²)
    const minX = Math.max(0, selectedPos.x - rangeInHexes);
    const maxX = Math.min(width - 1, selectedPos.x + rangeInHexes);
    const minY = Math.max(0, selectedPos.y - rangeInHexes);
    const maxY = Math.min(height - 1, selectedPos.y + rangeInHexes);

    // Check cells within the bounding box
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = hexDistance(selectedPos.x, selectedPos.y, x, y);

        // Within movement range and not the current position
        if (distance > 0 && distance <= rangeInHexes) {
          // Check if occupied using O(1) Set lookup
          const cellKey = `${x},${y}`;
          if (!occupiedPositions.has(cellKey)) {
            valid.add(cellKey);
          }
        }
      }
    }
    return valid;
  }, [movementMode, selectedPos, movementRange, width, height, room.entities]);

  // Only render hex grids
  if (room.gridType !== GridType.HEX_POINTY) {
    return (
      <div className="text-center p-8" style={{ color: 'var(--text-muted)' }}>
        Unsupported grid type: {room.gridType}
      </div>
    );
  }

  // Generate grid cells
  const gridCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { x: pixelX, y: pixelY } = hexToPixel(x, y, cellSize);
      const centerX = pixelX + (cellSize * SQRT_3) / 2;
      const centerY = pixelY + cellSize;
      const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
      const isValidMove = validMovementCells.has(`${x},${y}`);

      let fill = 'transparent';
      let stroke = 'var(--border-primary)';
      let strokeWidth = '1';
      let opacity = '0.3';

      if (movementMode && isValidMove) {
        fill = isHovered ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.2)';
        stroke = '#22C55E';
        strokeWidth = '2';
        opacity = '0.8';
      } else if (isHovered && !movementMode) {
        fill = 'rgba(99, 102, 241, 0.1)';
      }

      gridCells.push(
        <path
          key={`hex-${x}-${y}`}
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
          onMouseEnter={() => setHoveredCell({ x, y })}
          onMouseLeave={() => setHoveredCell(null)}
          onClick={() => {
            if (onCellClick && (!movementMode || isValidMove)) {
              onCellClick(x, y);
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

    const x = entity.position.x;
    const y = entity.position.y;

    // Validate coordinates are within grid bounds
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const { x: pixelX, y: pixelY } = hexToPixel(x, y, cellSize);
    const centerX = pixelX + (cellSize * SQRT_3) / 2;
    const centerY = pixelY + cellSize;

    const isHovered = hoveredEntity === entity.entityId;
    const isSelected = entity.entityId === selectedCharacter;
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

  return (
    <div className="hex-grid-container">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{
          maxWidth: '100%',
          height: 'auto',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '2px solid var(--border-primary)',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Grid cells */}
        <g className="grid-cells">{gridCells}</g>

        {/* Entity markers */}
        <g className="entity-markers">{entityMarkers}</g>
      </svg>

      {/* Improved Legend */}
      <div
        className="mt-4 p-3 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <div
                className="w-5 h-5 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, #3B82F6 0%, #2563eb 100%)',
                  border: '2px solid #3B82F6',
                }}
              />
            </div>
            <span style={{ color: 'var(--text-primary)' }}>
              Player Characters
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                background: 'radial-gradient(circle, #EF4444 0%, #dc2626 100%)',
                border: '2px solid #EF4444',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>Enemies</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                background: 'radial-gradient(circle, #10B981 0%, #059669 100%)',
                border: '2px solid #10B981',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>Objects</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full animate-pulse"
              style={{
                background: 'radial-gradient(circle, #FCD34D 0%, #F59E0B 100%)',
                border: '2px solid #FCD34D',
                boxShadow: '0 0 10px rgba(252, 211, 77, 0.5)',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>Selected</span>
          </div>
          {movementMode && (
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5"
                style={{
                  background: 'rgba(34, 197, 94, 0.3)',
                  border: '2px solid #22C55E',
                  borderRadius: '2px',
                }}
              />
              <span style={{ color: '#22C55E' }}>
                Valid Movement ({Math.floor(movementRange / 5)} hexes)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
