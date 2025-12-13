/**
 * Hex interaction hook for hex-grid-v2
 * Handles raycasting to ground plane for hover/click detection
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CubeCoord } from './hexMath';
import { worldToCube } from './hexMath';

// React Three Fiber event type with intersection point
interface R3FPointerEvent {
  point: THREE.Vector3;
  stopPropagation: () => void;
}

export interface UseHexInteractionProps {
  hexSize: number;
  gridWidth: number;
  gridHeight: number;
  onHexClick?: (coord: CubeCoord) => void;
  onHexHover?: (coord: CubeCoord | null) => void;
}

export interface UseHexInteractionReturn {
  hoveredHex: CubeCoord | null;
  selectedHex: CubeCoord | null;
  groundPlaneProps: {
    onPointerMove: (event: R3FPointerEvent) => void;
    onPointerLeave: () => void;
    onClick: (event: R3FPointerEvent) => void;
  };
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
 */
export function useHexInteraction({
  hexSize,
  gridWidth,
  gridHeight,
  onHexClick,
  onHexHover,
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
  };
}
