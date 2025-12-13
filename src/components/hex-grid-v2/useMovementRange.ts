/**
 * Movement range hook for hex-grid-v2
 * Calculates reachable hexes and boundary edges for movement visualization
 */

import { useMemo } from 'react';
import type { CubeCoord, WorldPos } from './hexMath';
import { cubeToWorld, findPath, getReachableHexes } from './hexMath';

export interface UseMovementRangeProps {
  entityPosition: CubeCoord | null; // Current entity position
  movementRemaining: number; // Feet remaining (divide by 5 for hex steps)
  hexSize: number; // Hex radius for world coord conversion
  isBlocked?: (coord: CubeCoord) => boolean; // Obstacles check
}

export interface BoundaryEdge {
  from: { x: number; z: number }; // World coords
  to: { x: number; z: number }; // World coords
}

export interface UseMovementRangeReturn {
  reachableHexes: Set<string>; // All hexes within movement range
  boundaryEdges: BoundaryEdge[]; // Edges to draw glowing border
  getPathTo: (target: CubeCoord) => CubeCoord[]; // Path from entity to target
  isReachable: (coord: CubeCoord) => boolean; // Quick reachability check
}

/**
 * Convert a cube coordinate to a string key for Set/Map storage
 */
function coordToKey(coord: CubeCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

/**
 * Calculate the 6 edge vertices of a hex in world coordinates
 * For pointy-top hexagons, vertices are at angles: 30°, 90°, 150°, 210°, 270°, 330°
 *
 * @param center - Center position in world coordinates
 * @param hexSize - Hex radius
 * @returns Array of 6 vertex positions in clockwise order starting from top-right
 */
function getHexVertices(center: WorldPos, hexSize: number): WorldPos[] {
  const vertices: WorldPos[] = [];
  // For pointy-top hexes, vertices are at 30° offsets
  for (let i = 0; i < 6; i++) {
    const angleDeg = 30 + 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    vertices.push({
      x: center.x + hexSize * Math.cos(angleRad),
      z: center.z + hexSize * Math.sin(angleRad),
    });
  }
  return vertices;
}

/**
 * Calculate boundary edges for the movement range perimeter
 *
 * A hex edge is a boundary if:
 * 1. The current hex IS reachable
 * 2. The neighbor in that direction is NOT reachable
 *
 * For each boundary edge, we calculate the two vertices that form the edge
 * in world coordinates.
 */
function calculateBoundaryEdges(
  reachableHexes: Set<string>,
  hexSize: number
): BoundaryEdge[] {
  const edges: BoundaryEdge[] = [];

  // Direction vectors for the 6 neighbors (same order as getHexNeighbors)
  const neighborDirections: CubeCoord[] = [
    { x: 1, y: -1, z: 0 }, // E
    { x: 1, y: 0, z: -1 }, // NE
    { x: 0, y: 1, z: -1 }, // NW
    { x: -1, y: 1, z: 0 }, // W
    { x: -1, y: 0, z: 1 }, // SW
    { x: 0, y: -1, z: 1 }, // SE
  ];

  // For each direction, which two vertices form the shared edge
  // Vertices are indexed 0-5 in clockwise order starting from top-right
  const edgeVertexPairs: [number, number][] = [
    [0, 1], // E edge: vertices 0 (30°) to 1 (90°)
    [5, 0], // NE edge: vertices 5 (330°) to 0 (30°)
    [4, 5], // NW edge: vertices 4 (270°) to 5 (330°)
    [3, 4], // W edge: vertices 3 (210°) to 4 (270°)
    [2, 3], // SW edge: vertices 2 (150°) to 3 (210°)
    [1, 2], // SE edge: vertices 1 (90°) to 2 (150°)
  ];

  // Check each reachable hex
  for (const hexKey of reachableHexes) {
    const [x, y, z] = hexKey.split(',').map(Number);
    const coord: CubeCoord = { x, y, z };

    // Get world position and vertices
    const worldPos = cubeToWorld(coord, hexSize);
    const vertices = getHexVertices(worldPos, hexSize);

    // Check each of the 6 neighbors
    for (let i = 0; i < 6; i++) {
      const dir = neighborDirections[i];
      const neighbor: CubeCoord = {
        x: coord.x + dir.x,
        y: coord.y + dir.y,
        z: coord.z + dir.z,
      };

      // If neighbor is NOT reachable, this edge is a boundary
      if (!reachableHexes.has(coordToKey(neighbor))) {
        const [v1Idx, v2Idx] = edgeVertexPairs[i];
        edges.push({
          from: vertices[v1Idx],
          to: vertices[v2Idx],
        });
      }
    }
  }

  return edges;
}

/**
 * Hook for calculating movement range and boundary visualization
 *
 * Given an entity's position and remaining movement, this hook:
 * 1. Calculates all reachable hexes using BFS (getReachableHexes)
 * 2. Determines boundary edges for drawing a glowing perimeter
 * 3. Provides utility functions for pathfinding and reachability checks
 *
 * All calculations are memoized to avoid expensive recomputation on every render.
 */
export function useMovementRange({
  entityPosition,
  movementRemaining,
  hexSize,
  isBlocked,
}: UseMovementRangeProps): UseMovementRangeReturn {
  // Calculate reachable hexes (memoized)
  const reachableHexes = useMemo(() => {
    if (!entityPosition) return new Set<string>();

    // Convert feet to hex steps (5 feet per hex)
    const maxSteps = Math.floor(movementRemaining / 5);

    return getReachableHexes(entityPosition, maxSteps, isBlocked);
  }, [entityPosition, movementRemaining, isBlocked]);

  // Calculate boundary edges (memoized)
  const boundaryEdges = useMemo(() => {
    if (!entityPosition || reachableHexes.size === 0) return [];

    return calculateBoundaryEdges(reachableHexes, hexSize);
  }, [reachableHexes, hexSize, entityPosition]);

  // Memoize utility functions
  const getPathTo = useMemo(() => {
    return (target: CubeCoord): CubeCoord[] => {
      if (!entityPosition) return [];
      return findPath(entityPosition, target, isBlocked);
    };
  }, [entityPosition, isBlocked]);

  const isReachable = useMemo(() => {
    return (coord: CubeCoord): boolean => {
      return reachableHexes.has(coordToKey(coord));
    };
  }, [reachableHexes]);

  return {
    reachableHexes,
    boundaryEdges,
    getPathTo,
    isReachable,
  };
}
