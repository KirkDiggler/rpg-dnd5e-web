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
  attackMode?: boolean;
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

// Get object subtype from entity ID
function getObjectSubtype(entityId: string): string {
  const id = entityId.toLowerCase();
  if (id.includes('barrel')) return 'barrel';
  if (id.includes('crate') || id.includes('box')) return 'crate';
  if (id.includes('wall')) return 'wall';
  if (id.includes('rubble')) return 'rubble';
  if (id.includes('door')) return 'door';
  if (id.includes('chest')) return 'chest';
  if (id.includes('trap')) return 'trap';
  if (id.includes('pillar') || id.includes('column')) return 'pillar';
  if (id.includes('statue')) return 'statue';
  if (id.includes('altar')) return 'altar';
  if (id.includes('table')) return 'table';
  if (id.includes('chair')) return 'chair';
  return 'object';
}

// Get entity color based on type
function getEntityColor(
  entityType: string,
  entityId?: string,
  selectedCharacter?: string | null,
  isHovered?: boolean
): string {
  let baseColor = '#6b7280';
  const typeLower = entityType.toLowerCase();

  switch (typeLower) {
    case 'character':
    case 'player':
      baseColor = '#3B82F6'; // Bright blue
      break;
    case 'monster':
    case 'enemy':
      baseColor = '#EF4444'; // Bright red
      break;
    case 'wall':
    case 'pillar':
      baseColor = '#6B7280'; // Gray
      break;
    case 'barrel':
      baseColor = '#92400E'; // Brown
      break;
    case 'crate':
      baseColor = '#7C2D12'; // Dark brown
      break;
    case 'rubble':
      baseColor = '#78716C'; // Stone gray
      break;
    case 'object':
      // Different colors for different object types
      if (entityId) {
        const subtype = getObjectSubtype(entityId);
        switch (subtype) {
          case 'barrel':
            baseColor = '#92400E'; // Brown
            break;
          case 'crate':
          case 'chest':
            baseColor = '#7C2D12'; // Dark brown
            break;
          case 'wall':
          case 'pillar':
            baseColor = '#6B7280'; // Gray
            break;
          case 'rubble':
            baseColor = '#78716C'; // Stone gray
            break;
          case 'door':
            baseColor = '#854D0E'; // Dark yellow/brown
            break;
          case 'trap':
            baseColor = '#DC2626'; // Red
            break;
          case 'altar':
          case 'statue':
            baseColor = '#9333EA'; // Purple
            break;
          case 'table':
          case 'chair':
            baseColor = '#92400E'; // Wood brown
            break;
          default:
            baseColor = '#10B981'; // Emerald green
            break;
        }
      } else {
        baseColor = '#10B981'; // Emerald green
      }
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

// Get icon for object types
function getObjectIcon(entityId: string): string {
  const subtype = getObjectSubtype(entityId);
  switch (subtype) {
    case 'barrel':
      return '🛢️';
    case 'crate':
      return '📦';
    case 'chest':
      return '🗃️';
    case 'wall':
      return '🧱';
    case 'rubble':
      return '🪨';
    case 'door':
      return '🚪';
    case 'trap':
      return '⚠️';
    case 'pillar':
      return '🏛️';
    case 'statue':
      return '🗿';
    case 'altar':
      return '⛩️';
    case 'table':
      return '🪑';
    case 'chair':
      return '💺';
    default:
      return '📍';
  }
}

// Get a better entity display name
function getEntityDisplayName(entity: EntityPlacement): string {
  const entityId = entity.entityId;
  const entityType = entity.entityType.toLowerCase();

  // For objects (including walls, barrels, etc.), show icons instead of text
  if (
    entityType === 'object' ||
    entityType === 'wall' ||
    entityType === 'pillar' ||
    entityType === 'barrel' ||
    entityType === 'crate' ||
    entityType === 'rubble'
  ) {
    // Use entityType directly if it's a specific object type
    if (entityType !== 'object') {
      switch (entityType) {
        case 'wall':
          return '🧱';
        case 'pillar':
          return '🏛️';
        case 'barrel':
          return '🛢️';
        case 'crate':
          return '📦';
        case 'rubble':
          return '🪨';
        default:
          return '📍';
      }
    }
    // Otherwise try to detect from entity ID
    return getObjectIcon(entityId);
  }

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
  attackMode = false,
  onCellClick,
  onEntityClick,
  onEntityHover,
}: HexGridProps) {
  const [hoveredCell, setHoveredCell] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredEntity, setHoveredEntity] = React.useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

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
    // Also track blocking objects separately
    const occupiedPositions = new Set<string>();
    const blockingPositions = new Set<string>();

    Object.values(room.entities).forEach((entity) => {
      if (entity.position) {
        const posKey = `${entity.position.x},${entity.position.y}`;
        occupiedPositions.add(posKey);

        // Walls, pillars, and ALL objects block movement (based on room_generator.go)
        // Note: barrels block movement but not line of sight
        // crates and rubble block both movement and line of sight
        const entTypeLower = entity.entityType.toLowerCase();
        if (
          entTypeLower === 'object' ||
          entTypeLower === 'wall' ||
          entTypeLower === 'pillar' ||
          entTypeLower === 'barrel' ||
          entTypeLower === 'crate' ||
          entTypeLower === 'rubble'
        ) {
          // All objects block movement according to the server code
          blockingPositions.add(posKey);
        }
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
          // Allow movement to cells with non-blocking objects (like barrels/crates)
          // but not to cells with creatures or blocking objects
          if (
            !occupiedPositions.has(cellKey) ||
            (occupiedPositions.has(cellKey) && !blockingPositions.has(cellKey))
          ) {
            // Additional check: ensure the cell doesn't have a creature
            const hasCreature = Object.values(room.entities).some(
              (entity) =>
                entity.position?.x === x &&
                entity.position?.y === y &&
                entity.entityType.toLowerCase() !== 'object'
            );
            if (!hasCreature) {
              valid.add(cellKey);
            }
          }
        }
      }
    }
    return valid;
  }, [movementMode, selectedPos, movementRange, width, height, room.entities]);

  // Calculate valid attack targets (enemies within range)
  const validAttackTargets = React.useMemo(() => {
    if (!attackMode || !selectedPos) return new Set<string>();

    const valid = new Set<string>();

    // Attack ranges in hexes (5ft per hex)
    const meleeRange = 1; // 5ft
    // const rangedRange = 30; // 150ft (typical ranged weapon) - for future use

    Object.values(room.entities).forEach((entity) => {
      if (!entity.position) return;

      // Don't target the selected character
      if (entity.entityId === selectedCharacter) return;

      // Only target enemies/monsters (not objects or allies)
      const entityType = entity.entityType.toLowerCase();
      if (entityType !== 'monster' && entityType !== 'enemy') return;

      const distance = hexDistance(
        selectedPos.x,
        selectedPos.y,
        entity.position.x,
        entity.position.y
      );

      // Check if within attack range (start with melee for now)
      if (distance <= meleeRange) {
        valid.add(entity.entityId);
      }
    });

    return valid;
  }, [attackMode, selectedPos, selectedCharacter, room.entities]);

  // Only render hex grids
  if (room.gridType !== GridType.HEX_POINTY) {
    return (
      <div className="text-center p-8" style={{ color: 'var(--text-muted)' }}>
        Unsupported grid type: {room.gridType}
      </div>
    );
  }

  // Check which hexes have walls or blocking objects
  const wallHexes = new Set<string>();
  const objectHexes = new Map<string, string>(); // hex key -> object type

  Object.values(room.entities).forEach((entity) => {
    if (entity.position) {
      const posKey = `${entity.position.x},${entity.position.y}`;
      const entTypeLower = entity.entityType.toLowerCase();

      if (entTypeLower === 'wall' || entTypeLower === 'pillar') {
        wallHexes.add(posKey);
      } else if (
        entTypeLower === 'barrel' ||
        entTypeLower === 'crate' ||
        entTypeLower === 'rubble' ||
        entTypeLower === 'object'
      ) {
        objectHexes.set(posKey, entTypeLower);
      }
    }
  });

  // Generate grid cells
  const gridCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { x: pixelX, y: pixelY } = hexToPixel(x, y, cellSize);
      const centerX = pixelX + (cellSize * SQRT_3) / 2;
      const centerY = pixelY + cellSize;
      const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
      const isValidMove = validMovementCells.has(`${x},${y}`);
      const cellKey = `${x},${y}`;
      const isWallHex = wallHexes.has(cellKey);
      const objectType = objectHexes.get(cellKey);

      let fill = 'transparent';
      let stroke = 'var(--border-primary)';
      let strokeWidth = '1';
      let opacity = '0.3';

      // Wall hexes are filled with stone gray
      if (isWallHex) {
        fill = '#4B5563'; // Stone gray
        stroke = '#374151'; // Darker gray border
        strokeWidth = '2';
        opacity = '1';
      } else if (objectType) {
        // Other objects get subtle fills
        if (objectType === 'barrel') {
          fill = 'rgba(146, 64, 14, 0.3)'; // Brown tint
        } else if (objectType === 'crate') {
          fill = 'rgba(124, 45, 18, 0.3)'; // Dark brown tint
        } else if (objectType === 'rubble') {
          fill = 'rgba(120, 113, 108, 0.4)'; // Stone tint
        }
        opacity = '0.6';
      } else if (movementMode && isValidMove) {
        fill = isHovered ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.2)';
        stroke = '#22C55E';
        strokeWidth = '2';
        opacity = '0.8';
      } else if (isHovered && !movementMode) {
        fill = 'rgba(99, 102, 241, 0.1)';
      }

      // Check if this hex has an entity for hover tooltip
      const hexEntity = Object.values(room.entities).find(
        (e) => e.position?.x === x && e.position?.y === y
      );

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
          onMouseEnter={(e) => {
            setHoveredCell({ x, y });
            // If this hex has an object entity, show tooltip
            if (hexEntity && (isWallHex || objectType)) {
              setHoveredEntity(hexEntity.entityId);
              onEntityHover?.(hexEntity.entityId);
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltipPos({ x: rect.x + rect.width / 2, y: rect.y - 10 });
            }
          }}
          onMouseLeave={() => {
            setHoveredCell(null);
            if (hexEntity && (isWallHex || objectType)) {
              setHoveredEntity(null);
              onEntityHover?.(null);
              setTooltipPos(null);
            }
          }}
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
    const isValidAttackTarget = validAttackTargets.has(entity.entityId);
    const entityTypeLower = entity.entityType.toLowerCase();
    const isObject =
      entityTypeLower === 'object' ||
      entityTypeLower === 'wall' ||
      entityTypeLower === 'pillar' ||
      entityTypeLower === 'barrel' ||
      entityTypeLower === 'crate' ||
      entityTypeLower === 'rubble';

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

    // Note: We're coloring the hex cells directly for walls/objects now
    // so we don't need to render separate shapes for them

    entityMarkers.push(
      <g key={`entity-${entity.entityId}`}>
        {/* Outer glow for selected entities (not for objects) */}
        {isSelected && !isObject && (
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

        {/* Attack target highlighting */}
        {isValidAttackTarget && !isObject && (
          <circle
            cx={centerX}
            cy={centerY}
            r={cellSize * 0.9}
            fill="none"
            stroke="#EF4444"
            strokeWidth="3"
            opacity="0.8"
            strokeDasharray="3,2"
          />
        )}

        {/* Entity shape - different for objects */}
        <defs>
          <radialGradient id={`grad-${entity.entityId}`}>
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop
              offset="100%"
              stopColor={color}
              stopOpacity={isObject ? '0.85' : '0.7'}
            />
          </radialGradient>
        </defs>

        {!isObject && (
          // Regular circle for creatures only
          <circle
            cx={centerX}
            cy={centerY}
            r={cellSize * 0.7}
            fill={`url(#grad-${entity.entityId})`}
            stroke={isSelected ? '#FCD34D' : color}
            strokeWidth={isSelected ? '3' : '2'}
            opacity={isHovered ? '1' : '0.9'}
            style={{
              cursor:
                onEntityClick && (isValidAttackTarget || !attackMode)
                  ? 'pointer'
                  : 'default',
              filter: isHovered ? 'brightness(1.2)' : 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              setHoveredEntity(entity.entityId);
              onEntityHover?.(entity.entityId);
              // Set tooltip position relative to the SVG
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltipPos({ x: rect.x + rect.width / 2, y: rect.y - 10 });
            }}
            onMouseLeave={() => {
              setHoveredEntity(null);
              onEntityHover?.(null);
              setTooltipPos(null);
            }}
            onClick={() => onEntityClick?.(entity.entityId)}
          />
        )}

        {/* Entity icon/label with better styling */}
        <g style={{ pointerEvents: 'none' }}>
          {!isObject ? (
            <>
              {/* Background for text (creatures only) */}
              <circle
                cx={centerX}
                cy={centerY}
                r={cellSize * 0.35}
                fill="rgba(0, 0, 0, 0.7)"
                opacity="0.8"
              />

              {/* Entity label for creatures */}
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
            </>
          ) : (
            <>
              {/* Object icon only - no background, larger size */}
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dy="0.25em"
                fill="white"
                fontSize={cellSize * 0.6}
                fontWeight="normal"
                fontFamily="system-ui"
                style={{
                  textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                  filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.7))',
                }}
              >
                {displayName}
              </text>
            </>
          )}
        </g>
      </g>
    );
  });

  // Get hovered entity details for tooltip
  const hoveredEntityData = hoveredEntity
    ? Object.values(room.entities).find((e) => e.entityId === hoveredEntity)
    : null;

  return (
    <div className="hex-grid-container" style={{ position: 'relative' }}>
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

      {/* Tooltip */}
      {hoveredEntityData && tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid #475569',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '14px',
            color: '#f1f5f9',
            pointerEvents: 'none',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            minWidth: '150px',
          }}
        >
          <div
            style={{
              fontWeight: 'bold',
              marginBottom: '4px',
              color: '#60a5fa',
            }}
          >
            {hoveredEntityData.entityId.split('_')[0].toUpperCase()}
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
            Type:{' '}
            <span style={{ color: '#f1f5f9' }}>
              {hoveredEntityData.entityType}
            </span>
          </div>
          {hoveredEntityData.position && (
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Position:{' '}
              <span style={{ color: '#f1f5f9' }}>
                ({hoveredEntityData.position.x}, {hoveredEntityData.position.y})
              </span>
            </div>
          )}
          {hoveredEntityData.entityType.toLowerCase() === 'wall' && (
            <div
              style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}
            >
              Blocks movement & sight
            </div>
          )}
          {hoveredEntityData.entityType.toLowerCase() === 'barrel' && (
            <div
              style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}
            >
              Blocks movement
            </div>
          )}
          {hoveredEntityData.entityType.toLowerCase() === 'crate' && (
            <div
              style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}
            >
              Blocks movement & sight
            </div>
          )}
        </div>
      )}

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
              className="w-5 h-5"
              style={{
                background: 'radial-gradient(circle, #6B7280 0%, #4B5563 100%)',
                border: '2px solid #6B7280',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>
              Walls 🧱 / Pillars 🏛️
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                background: 'radial-gradient(circle, #92400E 0%, #78350F 100%)',
                border: '2px solid #92400E',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>
              Barrels 🛢️ / Crates 📦 / Rubble 🪨
            </span>
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
          {attackMode && (
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full"
                style={{
                  background: 'transparent',
                  border: '2px dashed #EF4444',
                  borderRadius: '50%',
                }}
              />
              <span style={{ color: '#EF4444' }}>
                Valid Attack Targets (melee range)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
