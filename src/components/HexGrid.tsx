import type { EntityPlacement, Room } from '@/api';
import { GridType } from '@/api';
import React from 'react';

interface HexGridProps {
  room: Room;
  cellSize?: number;
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

// Get entity color based on type
function getEntityColor(entityType: string): string {
  switch (entityType.toLowerCase()) {
    case 'character':
      return '#2563eb'; // Blue
    case 'monster':
      return '#dc2626'; // Red
    case 'object':
      return '#65a30d'; // Green
    default:
      return '#6b7280'; // Gray
  }
}

// Get entity display name
function getEntityDisplayName(entity: EntityPlacement): string {
  // Try to extract a short name from the entity ID
  const parts = entity.entityId.split('_');
  return parts[parts.length - 1] || entity.entityId.substring(0, 3);
}

export function HexGrid({ room, cellSize = 30 }: HexGridProps) {
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

      gridCells.push(
        <path
          key={`cell-${x}-${y}`}
          d={hexPath(centerX, centerY, cellSize * 0.9)}
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth="1"
          opacity="0.6"
        />
      );
    }
  }

  // Create entity markers
  const entityMarkers: React.ReactElement[] = [];
  room.entities.forEach((entity) => {
    if (!entity.position) return;

    const x = entity.position.x;
    const y = entity.position.y;

    // Validate coordinates are within grid bounds
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const { x: pixelX, y: pixelY } = hexToPixel(x, y, cellSize);
    const centerX = pixelX + (cellSize * SQRT_3) / 2;
    const centerY = pixelY + cellSize;

    const color = getEntityColor(entity.entityType);
    const displayName = getEntityDisplayName(entity);

    entityMarkers.push(
      <g key={`entity-${entity.entityId}`}>
        {/* Entity hex background */}
        <path
          d={hexPath(centerX, centerY, cellSize * 0.8)}
          fill={color}
          opacity="0.7"
          stroke={color}
          strokeWidth="2"
        />
        {/* Entity label */}
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dy="0.35em"
          fill="white"
          fontSize={cellSize * 0.3}
          fontWeight="bold"
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
      </div>
    </div>
  );
}
