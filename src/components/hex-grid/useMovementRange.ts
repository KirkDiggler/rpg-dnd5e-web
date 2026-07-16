/**
 * Movement range hook for hex-grid
 * Calculates reachable hexes and boundary edges for movement visualization
 */

import { useMemo } from 'react';
import type { CubeCoord, WorldPos } from './hexMath';
import {
  coordToKey,
  cubeToWorld,
  findPath,
  getReachableHexes,
  HEX_DIRECTIONS,
} from './hexMath';

export interface UseMovementRangeProps {
  entityPosition: CubeCoord | null; // Current entity position
  movementRemaining: number; // Feet remaining (divide by 5 for hex steps)
  hexSize: number; // Hex radius for world coord conversion
  // Entity-aware (walls AND other entities) — MUST match the predicate real
  // pathfinding uses (useHexInteraction), or the reachable set can promise
  // hexes real movement refuses (rpg-dnd5e-web#459 Copilot review: a hex
  // only reachable by passing through an occupied hex would be marked
  // reachable here but rejected by actual pathing).
  isBlocked?: (coord: CubeCoord) => boolean;
  // Rendering-only: identifies a hex as occupied by another entity (not
  // terrain), used solely to suppress the "hole" boundary edge drawn
  // around an ally — it does NOT affect what's reachable or where paths
  // can go. Omit to draw every boundary edge, including ally holes.
  isOccupiedByOtherEntity?: (coord: CubeCoord) => boolean;
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
 *
 * Exception (rpg-dnd5e-web#456/#459): if the unreachable neighbor is
 * occupied by another entity rather than blocked terrain, no edge is drawn
 * for it. The hex is still correctly excluded from `reachableHexes` (an
 * ally blocks stopping there, same as real pathing) — this only
 * suppresses the hex-shaped "hole" that reads as broken geometry rather
 * than "you can't stop on your friend". `isOccupiedByOtherEntity` is
 * checked per-neighbor, not per-hex, since it's the boundary edge (not the
 * reachable hex itself) that would otherwise ring the ally.
 *
 * Exported for unit testing without rendering HexGrid.
 */
export function calculateBoundaryEdges(
  reachableHexes: Set<string>,
  hexSize: number,
  isOccupiedByOtherEntity?: (coord: CubeCoord) => boolean
): BoundaryEdge[] {
  const edges: BoundaryEdge[] = [];

  // For each direction, which two vertices form the shared edge
  // Direction order matches HEX_DIRECTIONS: E, NE, NW, W, SW, SE
  // Vertices are indexed 0-5 starting from 30° going clockwise:
  //   0 (30°)  → bottom-right
  //   1 (90°)  → bottom
  //   2 (150°) → bottom-left
  //   3 (210°) → top-left
  //   4 (270°) → top
  //   5 (330°) → top-right
  const edgeVertexPairs: [number, number][] = [
    [5, 0], // E edge: right side (vertex 5 top-right to vertex 0 bottom-right)
    [4, 5], // NE edge: top-right (vertex 4 top to vertex 5 top-right)
    [3, 4], // NW edge: top-left (vertex 3 top-left to vertex 4 top)
    [2, 3], // W edge: left side (vertex 2 bottom-left to vertex 3 top-left)
    [1, 2], // SW edge: bottom-left (vertex 1 bottom to vertex 2 bottom-left)
    [0, 1], // SE edge: bottom-right (vertex 0 bottom-right to vertex 1 bottom)
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
      const dir = HEX_DIRECTIONS[i];
      const neighbor: CubeCoord = {
        x: coord.x + dir.x,
        y: coord.y + dir.y,
        z: coord.z + dir.z,
      };

      // If neighbor is NOT reachable, this edge is a boundary — unless
      // the neighbor is only unreachable because an ally is standing on
      // it (rendering-only suppression; see doc comment above).
      if (!reachableHexes.has(coordToKey(neighbor))) {
        if (isOccupiedByOtherEntity?.(neighbor)) continue;
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
 * Whether MovementRangeBorder should render at all.
 *
 * rpg-dnd5e-web#456: the border used to render always-on outside combat
 * (isPlayerTurn is forced true during FREE_ROAM so clicks still dispatch —
 * see EncounterView.tsx's isMyTurn ternary), reading as permanent map
 * geometry rather than an actionable "here's what you can do right now"
 * indicator. It fooled a careful playtest verifier into reporting broken
 * wall rendering.
 *
 * Show it only when it's actionable:
 * - In TURN_BASED combat, only on the local player's own turn.
 * - In FREE_ROAM (no active combat), only while a move is actually being
 *   planned — the player is hovering a hex or already has a path preview.
 *   Idle exploration with no pointer activity shows nothing.
 *
 * Exported for unit testing without rendering HexGrid.
 */
export function shouldShowMovementBorder(
  inTurnBasedCombat: boolean,
  isPlayerTurn: boolean,
  isPlanningMove: boolean
): boolean {
  if (inTurnBasedCombat) return isPlayerTurn;
  return isPlanningMove;
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
  isOccupiedByOtherEntity,
}: UseMovementRangeProps): UseMovementRangeReturn {
  // Calculate reachable hexes (memoized). isBlocked here must be the same
  // entity-aware predicate real pathfinding uses — see the interface doc
  // comment for why.
  const reachableHexes = useMemo(() => {
    if (!entityPosition) return new Set<string>();

    // Convert feet to hex steps (5 feet per hex)
    const maxSteps = Math.floor(movementRemaining / 5);

    return getReachableHexes(entityPosition, maxSteps, isBlocked);
  }, [entityPosition, movementRemaining, isBlocked]);

  // Calculate boundary edges (memoized)
  const boundaryEdges = useMemo(() => {
    if (!entityPosition || reachableHexes.size === 0) return [];

    return calculateBoundaryEdges(
      reachableHexes,
      hexSize,
      isOccupiedByOtherEntity
    );
  }, [reachableHexes, hexSize, entityPosition, isOccupiedByOtherEntity]);

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
