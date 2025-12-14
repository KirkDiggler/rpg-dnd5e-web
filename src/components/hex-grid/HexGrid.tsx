/**
 * HexGrid - Main component for the hex grid battle map
 *
 * Creates a Three.js scene with:
 * - Orthographic camera looking down at the board
 * - Lighting (ambient + directional)
 * - Invisible ground plane for hit detection
 * - HexTile for each grid cell
 * - HexEntity for each entity
 * - Movement range border visualization
 * - Path preview on hover
 * - Turn order overlay
 */

import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { HexEntity } from './HexEntity';
import { cubeToWorld, type CubeCoord } from './hexMath';
import { HexTile } from './HexTile';
import { MovementRangeBorder } from './MovementRangeBorder';
import { PathPreview } from './PathPreview';
import type { TurnOrderEntry } from './TurnOrderOverlay';
import { TurnOrderOverlay } from './TurnOrderOverlay';
import { useCameraControls } from './useCameraControls';
import { useHexInteraction } from './useHexInteraction';
import { useMovementRange } from './useMovementRange';

export interface HexGridProps {
  gridWidth: number;
  gridHeight: number;
  entities: Array<{
    entityId: string;
    name: string;
    position: { x: number; y: number; z: number };
    type: 'player' | 'monster';
  }>;
  selectedEntityId?: string;
  onHexClick?: (coord: { x: number; y: number; z: number }) => void;
  onHexHover?: (coord: { x: number; y: number; z: number } | null) => void;
  onEntityClick?: (entityId: string) => void;
  // Combat integration props
  encounterId?: string | null;
  currentEntityId?: string | null;
  movementRemaining?: number;
  isPlayerTurn?: boolean;
  combatState?: CombatState | null;
  characters?: Character[];
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (entity: { id: string; type: string } | null) => void;
}

// Hex size constant - radius from center to vertex
const HEX_SIZE = 1.0;

// Ground plane size - large enough to cover the entire grid with plenty of margin
const GROUND_PLANE_SIZE = 200;

/**
 * Scene component - renders inside the Canvas
 * Separated so we can use React Three Fiber hooks
 */
function Scene({
  gridWidth,
  gridHeight,
  entities,
  selectedEntityId,
  onHexClick,
  onHexHover,
  onEntityClick,
  currentEntityId,
  movementRemaining = 0,
  isPlayerTurn = false,
  onMoveComplete,
  onAttackComplete,
  onHoverChange,
}: HexGridProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate grid center for camera target
  const gridCenter = useMemo(() => {
    // Center hex in cube coords
    const centerX = Math.floor(gridWidth / 2);
    const centerZ = Math.floor(gridHeight / 2);
    const centerY = -centerX - centerZ;
    // Convert to world coords
    const worldPos = cubeToWorld(
      { x: centerX, y: centerY, z: centerZ },
      HEX_SIZE
    );
    return new THREE.Vector3(worldPos.x, 0, worldPos.z);
  }, [gridWidth, gridHeight]);

  // Custom camera controls: WASD pan, Q/E rotate, scroll zoom
  useCameraControls({
    target: gridCenter,
    polarAngle: Math.PI / 3, // 60 degrees from vertical (30 degrees from horizontal)
    panSpeed: 0.3,
    rotateSpeed: 0.02,
    minZoom: 30,
    maxZoom: 150,
  });

  // Build entity map for interaction hook
  const entitiesMap = useMemo(() => {
    const map = new Map();
    entities.forEach((entity) => {
      map.set(entity.entityId, {
        position: {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        },
        type: entity.type,
      });
    });
    return map;
  }, [entities]);

  // Get current entity position
  const currentEntityPosition = useMemo(() => {
    if (!currentEntityId) return null;
    const entity = entities.find((e) => e.entityId === currentEntityId);
    if (!entity) return null;
    return {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    };
  }, [currentEntityId, entities]);

  // Check if a hex is blocked (outside bounds or has an entity)
  // Uses useCallback to ensure stable function reference for downstream memoization
  const isBlocked = useCallback(
    (coord: CubeCoord) => {
      // Check grid bounds (x must be in [0, gridWidth), z must be in [0, gridHeight))
      if (
        coord.x < 0 ||
        coord.x >= gridWidth ||
        coord.z < 0 ||
        coord.z >= gridHeight
      ) {
        return true;
      }
      // Check for other entities
      return entities.some(
        (entity) =>
          entity.position.x === coord.x &&
          entity.position.y === coord.y &&
          entity.position.z === coord.z &&
          entity.entityId !== currentEntityId
      );
    },
    [entities, currentEntityId, gridWidth, gridHeight]
  );

  // Use the interaction hook for hover/click detection with path preview
  const {
    hoveredHex,
    selectedHex,
    groundPlaneProps,
    pathPreview,
    canAttack,
    attackPath,
    hoveredEntity,
  } = useHexInteraction({
    hexSize: HEX_SIZE,
    gridWidth,
    gridHeight,
    onHexClick: (coord) => {
      // Only allow interactions on player turn and when not processing
      if (!isPlayerTurn || isProcessing) return;

      // If we have a path preview, execute move
      if (pathPreview.length > 0 && onMoveComplete) {
        setIsProcessing(true);
        onMoveComplete(pathPreview);
        // Parent component will reset isProcessing via state update
        setTimeout(() => setIsProcessing(false), 100);
      }

      onHexClick?.(coord);
    },
    onHexHover,
    entityPosition: currentEntityPosition,
    movementRemaining,
    isBlocked,
    entities: entitiesMap,
  });

  // Notify parent when hovered entity changes
  useEffect(() => {
    onHoverChange?.(hoveredEntity);
  }, [hoveredEntity, onHoverChange]);

  // Use movement range hook for boundary visualization
  const { boundaryEdges } = useMovementRange({
    entityPosition: currentEntityPosition,
    movementRemaining,
    hexSize: HEX_SIZE,
    isBlocked,
  });

  // Handle entity clicks (for attacking)
  const handleEntityClick = (entityId: string) => {
    if (!isPlayerTurn || isProcessing) {
      onEntityClick?.(entityId);
      return;
    }

    // Check if this is an enemy that can be attacked
    const entity = entities.find((e) => e.entityId === entityId);
    if (entity?.type === 'monster' && canAttack && attackPath.length > 0) {
      setIsProcessing(true);
      // First move along attack path
      if (onMoveComplete && attackPath.length > 1) {
        onMoveComplete(attackPath);
      }
      // Then attack
      if (onAttackComplete) {
        onAttackComplete(entityId);
      }
      setTimeout(() => setIsProcessing(false), 100);
    }

    onEntityClick?.(entityId);
  };

  // Helper to check if a cube coord matches another
  const coordsEqual = (
    a: CubeCoord | null,
    b: { x: number; y: number; z: number }
  ): boolean => {
    if (a === null) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />

      {/* Invisible ground plane for hit detection */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]} // Lay flat on XZ plane
        {...groundPlaneProps}
      >
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Render all hex tiles */}
      {Array.from({ length: gridHeight }, (_, z) =>
        Array.from({ length: gridWidth }, (_, x) => {
          const y = -x - z;
          const position: CubeCoord = { x, y, z };
          const isHovered = coordsEqual(hoveredHex, position);
          const isSelected = coordsEqual(selectedHex, position);

          return (
            <HexTile
              key={`hex-${x}-${y}-${z}`}
              position={position}
              hexSize={HEX_SIZE}
              isHovered={isHovered}
              isSelected={isSelected}
            />
          );
        })
      )}

      {/* Movement range border (only on player turn) */}
      {isPlayerTurn && boundaryEdges.length > 0 && (
        <MovementRangeBorder boundaryEdges={boundaryEdges} />
      )}

      {/* Path preview (only on player turn) */}
      {isPlayerTurn && pathPreview.length > 0 && (
        <PathPreview path={pathPreview} hexSize={HEX_SIZE} />
      )}

      {/* Attack path preview (only on player turn, when hovering enemy) */}
      {isPlayerTurn && canAttack && attackPath.length > 0 && (
        <PathPreview
          path={attackPath}
          hexSize={HEX_SIZE}
          color="#ef4444"
          opacity={0.5}
        />
      )}

      {/* Render all entities */}
      {entities.map((entity) => (
        <HexEntity
          key={entity.entityId}
          entityId={entity.entityId}
          name={entity.name}
          position={entity.position}
          type={entity.type}
          hexSize={HEX_SIZE}
          isSelected={entity.entityId === selectedEntityId}
          onClick={handleEntityClick}
        />
      ))}
    </>
  );
}

/**
 * Main HexGrid component
 * Sets up the Canvas and renders the scene
 */
export function HexGrid(props: HexGridProps) {
  const { combatState, characters = [] } = props;

  // Build turn order from combat state
  const turnOrder = useMemo((): TurnOrderEntry[] => {
    if (!combatState?.turnOrder) return [];
    return combatState.turnOrder.map((entry) => ({
      entityId: entry.entityId,
      entityType: entry.entityType,
      initiative: entry.initiative,
    }));
  }, [combatState]);

  const activeIndex = combatState?.activeIndex ?? -1;
  const round = combatState?.round ?? 1;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        position: 'relative',
      }}
    >
      <Canvas
        orthographic
        camera={{
          // Steep isometric angle for good hex visibility
          position: [8, 16, 8],
          zoom: 80,
          near: 0.1,
          far: 1000,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene {...props} />
      </Canvas>

      {/* Turn order carousel overlay at top */}
      {turnOrder.length > 0 && (
        <TurnOrderOverlay
          turnOrder={turnOrder}
          activeIndex={activeIndex}
          characters={characters}
          round={round}
        />
      )}
    </div>
  );
}
