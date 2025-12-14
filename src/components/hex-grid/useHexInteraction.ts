/**
 * Hex interaction hook for hex-grid
 * Handles raycasting to ground plane for hover/click detection
 * Provides path preview functionality for movement and combat
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CubeCoord } from './hexMath';
import { findPath, HEX_DIRECTIONS, worldToCube } from './hexMath';

// React Three Fiber event type with intersection point
interface R3FPointerEvent {
  point: THREE.Vector3;
  stopPropagation: () => void;
}

// Entity type for tracking entities on the grid
export interface Entity {
  position: CubeCoord;
  type: 'player' | 'monster';
  name: string;
}

export interface UseHexInteractionProps {
  hexSize: number;
  gridWidth: number;
  gridHeight: number;
  onHexClick?: (coord: CubeCoord) => void;
  onHexHover?: (coord: CubeCoord | null) => void;
  // Path preview parameters
  entityPosition?: CubeCoord | null;
  movementRemaining?: number; // in feet
  isBlocked?: (coord: CubeCoord) => boolean;
  entities?: Map<string, Entity>; // entity ID -> entity data
}

export interface HoveredEntityInfo {
  id: string;
  type: string;
  name: string;
}

export interface UseHexInteractionReturn {
  hoveredHex: CubeCoord | null;
  selectedHex: CubeCoord | null;
  groundPlaneProps: {
    onPointerMove: (event: R3FPointerEvent) => void;
    onPointerLeave: () => void;
    onClick: (event: R3FPointerEvent) => void;
  };
  // Path preview return values
  pathPreview: CubeCoord[]; // Path from entity to hovered hex (empty if out of range)
  hoveredEntity: HoveredEntityInfo | null; // Entity under cursor
  canAttack: boolean; // True if hovering enemy within range
  attackPath: CubeCoord[]; // Path to adjacent hex when hovering enemy
}

/**
 * Find the entity at a given coordinate
 */
function findEntityAtCoord(
  coord: CubeCoord,
  entities?: Map<string, Entity>
): HoveredEntityInfo | null {
  if (!entities) return null;

  for (const [id, entity] of entities.entries()) {
    if (
      entity.position.x === coord.x &&
      entity.position.y === coord.y &&
      entity.position.z === coord.z
    ) {
      return { id, type: entity.type, name: entity.name };
    }
  }
  return null;
}

/**
 * Find the nearest adjacent hex to a target, prioritizing shortest path from start
 */
function findNearestAdjacentHex(
  start: CubeCoord,
  target: CubeCoord,
  isBlocked?: (coord: CubeCoord) => boolean
): CubeCoord | null {
  // Get all 6 adjacent hexes to the target using shared direction constants
  const adjacentHexes = HEX_DIRECTIONS.map((dir) => ({
    x: target.x + dir.x,
    y: target.y + dir.y,
    z: target.z + dir.z,
  }));

  // Find the adjacent hex with the shortest path from start
  let bestHex: CubeCoord | null = null;
  let shortestPath: CubeCoord[] = [];

  for (const hex of adjacentHexes) {
    if (isBlocked?.(hex)) continue;

    const path = findPath(start, hex, isBlocked);
    if (path.length > 0) {
      if (!bestHex || path.length < shortestPath.length) {
        bestHex = hex;
        shortestPath = path;
      }
    }
  }

  return bestHex;
}

/**
 * Hook for managing hex grid interaction via ground plane raycasting
 *
 * Approach:
 * 1. Attach event handlers to a ground plane mesh at Y=0
 * 2. On pointer events, Three.js provides the intersection point
 * 3. Convert intersection (x, z) to cube coords via worldToCube
 * 4. Validate hex is within grid bounds
 * 5. Update state and call callbacks
 * 6. Calculate path preview based on entity position and movement range
 */
export function useHexInteraction({
  hexSize,
  gridWidth,
  gridHeight,
  onHexClick,
  onHexHover,
  entityPosition,
  movementRemaining = 0,
  isBlocked,
  entities,
}: UseHexInteractionProps): UseHexInteractionReturn {
  const [hoveredHex, setHoveredHex] = useState<CubeCoord | null>(null);
  const [selectedHex, setSelectedHex] = useState<CubeCoord | null>(null);

  // Track last hovered hex to avoid redundant callbacks
  const lastHoveredRef = useRef<CubeCoord | null>(null);

  /**
   * Check if a cube coordinate is within the grid bounds
   * Grid dimensions: width = hexes across (x range), height = hexes down (z range)
   * Valid coords: x in [0, gridWidth), z in [0, gridHeight), y = -x - z
   */
  const isValidHex = useCallback(
    (coord: CubeCoord): boolean => {
      return (
        coord.x >= 0 &&
        coord.x < gridWidth &&
        coord.z >= 0 &&
        coord.z < gridHeight &&
        coord.y === -coord.x - coord.z // Validate cube invariant
      );
    },
    [gridWidth, gridHeight]
  );

  /**
   * Compare two cube coordinates for equality
   */
  const coordsEqual = (a: CubeCoord | null, b: CubeCoord | null): boolean => {
    if (a === null || b === null) return a === b;
    return a.x === b.x && a.y === b.y && a.z === b.z;
  };

  /**
   * Handle pointer move over ground plane
   * Three.js provides the intersection point in event.point
   */
  const handlePointerMove = useCallback(
    (event: R3FPointerEvent) => {
      // Extract world position from raycast intersection
      const intersection = event.point;
      const worldPos = { x: intersection.x, z: intersection.z };

      // Convert to cube coordinates
      const cubeCoord = worldToCube(worldPos, hexSize);

      // Validate hex is in bounds
      if (!isValidHex(cubeCoord)) {
        // Out of bounds - clear hover if needed
        if (lastHoveredRef.current !== null) {
          lastHoveredRef.current = null;
          setHoveredHex(null);
          onHexHover?.(null);
        }
        return;
      }

      // Check if this is a new hex (avoid redundant updates)
      if (!coordsEqual(cubeCoord, lastHoveredRef.current)) {
        lastHoveredRef.current = cubeCoord;
        setHoveredHex(cubeCoord);
        onHexHover?.(cubeCoord);
      }
    },
    [hexSize, isValidHex, onHexHover]
  );

  /**
   * Handle pointer leaving ground plane
   */
  const handlePointerLeave = useCallback(() => {
    lastHoveredRef.current = null;
    setHoveredHex(null);
    onHexHover?.(null);
  }, [onHexHover]);

  /**
   * Handle click on ground plane
   */
  const handleClick = useCallback(
    (event: R3FPointerEvent) => {
      // Extract world position from raycast intersection
      const intersection = event.point;
      const worldPos = { x: intersection.x, z: intersection.z };

      // Convert to cube coordinates
      const cubeCoord = worldToCube(worldPos, hexSize);

      // Validate hex is in bounds
      if (!isValidHex(cubeCoord)) {
        return;
      }

      // Update selected hex
      setSelectedHex(cubeCoord);
      onHexClick?.(cubeCoord);
    },
    [hexSize, isValidHex, onHexClick]
  );

  // Calculate path preview and entity hover state (memoized)
  const pathPreviewState = useMemo(() => {
    // Default state - no path preview
    if (!hoveredHex || !entityPosition) {
      return {
        pathPreview: [],
        hoveredEntity: null,
        canAttack: false,
        attackPath: [],
      };
    }

    // Check if hovering over an entity
    const entityAtHex = findEntityAtCoord(hoveredHex, entities);

    if (entityAtHex) {
      // Hovering an entity
      if (entityAtHex.type === 'monster') {
        // Enemy - calculate attack path
        const nearestAdjacentHex = findNearestAdjacentHex(
          entityPosition,
          hoveredHex,
          isBlocked
        );

        if (!nearestAdjacentHex) {
          // No path to enemy
          return {
            pathPreview: [],
            hoveredEntity: entityAtHex,
            canAttack: false,
            attackPath: [],
          };
        }

        // Calculate path to adjacent hex
        const pathToAdjacent = findPath(
          entityPosition,
          nearestAdjacentHex,
          isBlocked
        );

        // Check if path is within movement range (5 feet per hex)
        // Guard against empty path (would result in negative cost)
        const pathCost =
          pathToAdjacent.length > 0
            ? (pathToAdjacent.length - 1) * 5
            : Infinity;
        const isWithinRange =
          pathToAdjacent.length > 0 && pathCost <= movementRemaining;

        return {
          pathPreview: [],
          hoveredEntity: entityAtHex,
          canAttack: isWithinRange,
          attackPath: isWithinRange ? pathToAdjacent : [],
        };
      } else {
        // Ally - just show entity info, no path
        return {
          pathPreview: [],
          hoveredEntity: entityAtHex,
          canAttack: false,
          attackPath: [],
        };
      }
    }

    // Hovering empty hex - calculate movement path
    const path = findPath(entityPosition, hoveredHex, isBlocked);

    // Check if destination is within movement range
    const pathCost = (path.length - 1) * 5; // Subtract 1 for start hex
    const isWithinRange = pathCost <= movementRemaining && path.length > 0;

    return {
      pathPreview: isWithinRange ? path : [],
      hoveredEntity: null,
      canAttack: false,
      attackPath: [],
    };
  }, [hoveredHex, entityPosition, entities, isBlocked, movementRemaining]);

  // Memoize ground plane props to avoid unnecessary re-renders
  const groundPlaneProps = useMemo(
    () => ({
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave,
      onClick: handleClick,
    }),
    [handlePointerMove, handlePointerLeave, handleClick]
  );

  return {
    hoveredHex,
    selectedHex,
    groundPlaneProps,
    ...pathPreviewState,
  };
}
