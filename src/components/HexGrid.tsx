import type { EntityPlacement, Room } from '@/api';
import { GridType } from '@/api';
import React from 'react';

interface HexGridProps {
  room: Room;
  cellSize?: number;
  selectedCharacter?: string | null;
  onCellClick?: (x: number, y: number) => void;
  onEntityClick?: (entityId: string) => void;
  onEntityHover?: (entityId: string | null) => void;
}

// Hex grid constants for pointy-top orientation
const SQRT_3 = Math.sqrt(3);

// Convert grid coordinates to pixel coordinates (pointy-top hex)
function hexToPixel(x: number, y: number, cellSize: number) {
  const pixelX = cellSize * (SQRT_3 * x + (SQRT_3 / 2) * y);
  const pixelY = cellSize * ((3 / 2) * y);
  return { x: pixelX, y: pixelY };
}

// Generate hex path (pointy-top)
function hexPath(centerX: number, centerY: number, size: number): string {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // Start from top point
    points.push({
      x: centerX + size * Math.cos(angle),
      y: centerY + size * Math.sin(angle),
    });
  }
  return `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;
}

// Get entity color based on type and selection state
function getEntityColor(
  entityType: string,
  entityId?: string,
  selectedCharacter?: string | null,
  isHovered?: boolean
): string {
  let baseColor: string;
  switch (entityType.toLowerCase()) {
    case 'character':
      baseColor = '#2563eb'; // Blue
      break;
    case 'monster':
      baseColor = '#dc2626'; // Red
      break;
    case 'object':
      baseColor = '#65a30d'; // Green
      break;
    default:
      baseColor = '#6b7280'; // Gray
      break;
  }

  // Highlight selected character
  if (entityId && selectedCharacter === entityId) {
    return '#fbbf24'; // Amber for selected character
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

// Get entity display name
function getEntityDisplayName(entity: EntityPlacement): string {
  // Try to extract a short name from the entity ID
  const parts = entity.entityId.split('_');
  return parts[parts.length - 1];
}

export function HexGrid({
  room,
  cellSize = 30,
  selectedCharacter,
  onCellClick,
  onEntityClick,
  onEntityHover,
}: HexGridProps) {
  const [hoveredCell, setHoveredCell] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredEntity, setHoveredEntity] = React.useState<string | null>(null);
  // Only render hex grids
  if (room.gridType !== GridType.HEX_POINTY) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">
          Unsupported grid type: {GridType[room.gridType]}. This component only
          supports pointy-top hex grids.
        </p>
      </div>
    );
  }

  const width = room.width;
  const height = room.height;

  // Calculate SVG dimensions
  const svgWidth =
    cellSize * (SQRT_3 * width + (SQRT_3 / 2) * (height - 1)) + cellSize;
  const svgHeight = cellSize * ((3 / 2) * height) + cellSize;

  // Create grid cells
  const gridCells: React.ReactElement[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { x: pixelX, y: pixelY } = hexToPixel(x, y, cellSize);
      const centerX = pixelX + (cellSize * SQRT_3) / 2;
      const centerY = pixelY + cellSize;

      const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;

      gridCells.push(
        <path
          key={`cell-${x}-${y}`}
          d={hexPath(centerX, centerY, cellSize * 0.9)}
          fill={isHovered ? 'var(--bg-secondary)' : 'none'}
          stroke="var(--border-primary)"
          strokeWidth="1"
          opacity={isHovered ? '0.8' : '0.6'}
          style={{ cursor: onCellClick ? 'pointer' : 'default' }}
          onMouseEnter={() => setHoveredCell({ x, y })}
          onMouseLeave={() => setHoveredCell(null)}
          onClick={() => onCellClick?.(x, y)}
        />
      );
    }
  }

  // Create entity markers
  const entityMarkers: React.ReactElement[] = [];
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
    const color = getEntityColor(
      entity.entityType,
      entity.entityId,
      selectedCharacter,
      isHovered
    );
    const displayName = getEntityDisplayName(entity);

    entityMarkers.push(
      <g key={`entity-${entity.entityId}`}>
        {/* Entity hex background */}
        <path
          d={hexPath(centerX, centerY, cellSize * 0.8)}
          fill={color}
          opacity={isHovered ? '0.9' : '0.7'}
          stroke={color}
          strokeWidth={entity.entityId === selectedCharacter ? '3' : '2'}
          style={{ cursor: onEntityClick ? 'pointer' : 'default' }}
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
        {/* Selection ring for selected character */}
        {entity.entityId === selectedCharacter && (
          <path
            d={hexPath(centerX, centerY, cellSize * 0.95)}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3"
            opacity="0.8"
            strokeDasharray="5,3"
          />
        )}
        {/* Entity label */}
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dy="0.35em"
          fill="white"
          fontSize={cellSize * 0.3}
          fontWeight="bold"
          style={{ pointerEvents: 'none' }}
        >
          {displayName}
        </text>
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
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '8px',
        }}
      >
        {/* Grid cells */}
        <g className="grid-cells">{gridCells}</g>

        {/* Entity markers */}
        <g className="entity-markers">{entityMarkers}</g>
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: '#2563eb' }}
          />
          <span>Characters</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: '#dc2626' }}
          />
          <span>Monsters</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: '#65a30d' }}
          />
          <span>Objects</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded border-2 border-dashed"
            style={{ backgroundColor: '#fbbf24', borderColor: '#fbbf24' }}
          />
          <span>Selected Character</span>
        </div>
      </div>
    </div>
  );
}
