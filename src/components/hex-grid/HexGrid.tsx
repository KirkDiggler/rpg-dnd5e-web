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

import type { AbsoluteFloorTile } from '@/hooks/useDungeonMap';
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  DoorInfo,
  MonsterCombatState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { HexDoor } from './HexDoor';
import { HexEntity } from './HexEntity';
import { cubeToWorld, getHexLine, type CubeCoord } from './hexMath';
import { MovementRangeBorder } from './MovementRangeBorder';
import { PathPreview } from './PathPreview';
import { ShadedHexFloor } from './ShadedHexFloor';
import { ShadedHexWall } from './ShadedHexWall';
import type { TurnOrderEntry } from './TurnOrderOverlay';
import { TurnOrderOverlay } from './TurnOrderOverlay';
import { useCameraControls } from './useCameraControls';
import { useHexInteraction } from './useHexInteraction';
import { useMovementRange } from './useMovementRange';

export interface HexGridProps {
  floorTiles: Map<string, AbsoluteFloorTile>;
  entities: Array<{
    entityId: string;
    name: string;
    position: { x: number; y: number; z: number };
    type: 'player' | 'monster' | 'obstacle';
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
  /** Monster combat state for texture selection (includes monsterType) */
  monsters?: MonsterCombatState[];
  onMoveComplete?: (path: CubeCoord[]) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (
    entity: { id: string; type: string; name: string } | null
  ) => void;
  // Door props
  doors?: DoorInfo[];
  onDoorClick?: (connectionId: string) => void;
  isDoorLoading?: boolean;
  onDoorHoverChange?: (
    door: { connectionId: string; physicalHint: string } | null
  ) => void;
  // Wall props
  walls?: Wall[];
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
  floorTiles,
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
  doors = [],
  onDoorClick,
  isDoorLoading = false,
  onDoorHoverChange,
  characters = [],
  monsters = [],
  walls = [],
}: HexGridProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Create character lookup map by ID for efficient entity -> character mapping
  const characterMap = useMemo(() => {
    const map = new Map<string, (typeof characters)[0]>();
    for (const character of characters) {
      map.set(character.id, character);
    }
    return map;
  }, [characters]);

  // Create monster lookup map by ID for efficient entity -> monsterType mapping
  const monsterMap = useMemo(() => {
    const map = new Map<string, (typeof monsters)[0]>();
    for (const monster of monsters) {
      map.set(monster.monsterId, monster);
    }
    return map;
  }, [monsters]);

  // Calculate grid center for camera target
  const gridCenter = useMemo(() => {
    if (floorTiles.size === 0) {
      return new THREE.Vector3(0, 0, 0);
    }
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const [, tile] of floorTiles) {
      const worldPos = cubeToWorld(
        { x: tile.x, y: tile.y, z: tile.z },
        HEX_SIZE
      );
      minX = Math.min(minX, worldPos.x);
      maxX = Math.max(maxX, worldPos.x);
      minZ = Math.min(minZ, worldPos.z);
      maxZ = Math.max(maxZ, worldPos.z);
    }
    return new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  }, [floorTiles]);

  // Compute camera focus target on turn change only (not on movement during turn)
  const focusTarget = useMemo(() => {
    if (!currentEntityId) return null;
    const entity = entities.find((e) => e.entityId === currentEntityId);
    if (!entity) return null;
    const worldPos = cubeToWorld(entity.position, HEX_SIZE);
    return new THREE.Vector3(worldPos.x, 0, worldPos.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only trigger on turn change
  }, [currentEntityId]);

  // Custom camera controls: WASD pan, Q/E rotate, scroll zoom
  useCameraControls({
    target: gridCenter,
    polarAngle: Math.PI / 3.5, // ~51 degrees from vertical - slightly lower tactical angle
    panSpeed: 0.3,
    rotateSpeed: 0.02,
    minZoom: 30,
    maxZoom: 150,
    focusTarget,
  });

  // Build entity map for interaction hook
  const entitiesMap = useMemo(() => {
    const map = new Map();
    entities.forEach((entity) => {
      // Look up monster type if this is a monster entity
      const monster =
        entity.type === 'monster' ? monsterMap.get(entity.entityId) : undefined;
      map.set(entity.entityId, {
        position: {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        },
        type: entity.type,
        name: entity.name,
        monsterType: monster?.monsterType,
      });
    });
    return map;
  }, [entities, monsterMap]);

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

  // Check if a hex is blocked (not a floor tile or has an entity)
  // Uses useCallback to ensure stable function reference for downstream memoization
  const isBlocked = useCallback(
    (coord: CubeCoord) => {
      const key = `${coord.x},${coord.y},${coord.z}`;
      if (!floorTiles.has(key)) {
        return true;
      }
      return entities.some(
        (entity) =>
          entity.position.x === coord.x &&
          entity.position.y === coord.y &&
          entity.position.z === coord.z &&
          entity.entityId !== currentEntityId
      );
    },
    [entities, currentEntityId, floorTiles]
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
    floorTiles,
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

  // Extract door positions for tile coloring
  const doorPositions = useMemo((): CubeCoord[] => {
    return doors
      .filter((door) => door.position)
      .map((door) => ({
        x: door.position!.x,
        y: door.position!.y,
        z: door.position!.z,
      }));
  }, [doors]);

  // Extract wall positions for tile coloring (all hexes along each wall)
  const wallPositions = useMemo((): CubeCoord[] => {
    const positions: CubeCoord[] = [];
    for (const wall of walls) {
      if (!wall.start || !wall.end) continue;
      const start: CubeCoord = {
        x: wall.start.x,
        y: wall.start.y,
        z: wall.start.z,
      };
      const end: CubeCoord = { x: wall.end.x, y: wall.end.y, z: wall.end.z };
      positions.push(...getHexLine(start, end));
    }
    return positions;
  }, [walls]);

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

      {/* Render all hex tiles using auto-shaded instanced mesh */}
      <ShadedHexFloor
        floorTiles={floorTiles}
        hexSize={HEX_SIZE}
        hoveredHex={hoveredHex}
        selectedHex={selectedHex}
        doorPositions={doorPositions}
        wallPositions={wallPositions}
      />

      {/* Render walls (after tiles, before doors) — already deduplicated in useDungeonMap */}
      {walls.map((wall) => {
        const key = `wall-${wall.start?.x ?? 'u'}-${wall.start?.y ?? 'u'}-${wall.start?.z ?? 'u'}-${wall.end?.x ?? 'u'}-${wall.end?.y ?? 'u'}-${wall.end?.z ?? 'u'}`;
        return <ShadedHexWall key={key} wall={wall} hexSize={HEX_SIZE} />;
      })}

      {/* Render doors (after tiles, before movement range) */}
      {doors.map((door) => {
        if (!door.position) return null;
        const doorPosition: CubeCoord = {
          x: door.position.x,
          y: door.position.y,
          z: door.position.z,
        };
        return (
          <HexDoor
            key={door.connectionId}
            connectionId={door.connectionId}
            position={doorPosition}
            physicalHint={door.physicalHint}
            isOpen={door.isOpen}
            isLoading={isDoorLoading}
            hexSize={HEX_SIZE}
            onClick={(connectionId) => {
              if (!isPlayerTurn || isProcessing || isDoorLoading || door.isOpen)
                return;
              onDoorClick?.(connectionId);
            }}
            onHoverChange={onDoorHoverChange}
            disabled={!isPlayerTurn || isProcessing}
          />
        );
      })}

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
          character={characterMap.get(entity.entityId)}
          monster={monsterMap.get(entity.entityId)}
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
  const [isContextLost, setIsContextLost] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Handle WebGL context loss/restore for GPU protection
  const handleCanvasCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      canvasRef.current = gl.domElement;
    },
    []
  );

  // Set up context loss event listeners with proper cleanup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost - GPU may be overloaded');
      setIsContextLost(true);
    };

    const handleContextRestored = () => {
      console.info('WebGL context restored');
      setIsContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  });

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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isContextLost ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-secondary, #1a1a2e)',
            color: 'var(--text-primary, #fff)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ margin: '0 0 0.5rem 0' }}>Graphics Error</h2>
          <p style={{ color: 'var(--text-muted, #888)', margin: '0 0 1rem 0' }}>
            Your GPU couldn&apos;t handle the rendering load.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: 'var(--accent-primary, #5865F2)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload Page
          </button>
        </div>
      ) : (
        <Canvas
          orthographic
          frameloop="demand"
          onCreated={handleCanvasCreated}
          camera={{
            // Lower isometric angle similar to Stolen Realm
            position: [8, 10, 8],
            zoom: 80,
            near: 0.1,
            far: 1000,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene {...props} />
        </Canvas>
      )}

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
