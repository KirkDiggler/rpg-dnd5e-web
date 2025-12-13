/**
 * HexGridV2 - Main component for the v2 hex grid
 *
 * Creates a Three.js scene with:
 * - Orthographic camera looking down at the board
 * - Lighting (ambient + directional)
 * - Invisible ground plane for hit detection
 * - HexTile for each grid cell
 * - HexEntity for each entity
 */

import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { HexEntity } from './HexEntity';
import { cubeToWorld, type CubeCoord } from './hexMath';
import { HexTile } from './HexTile';
import { useCameraControls } from './useCameraControls';
import { useHexInteraction } from './useHexInteraction';

export interface HexGridV2Props {
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
}: HexGridV2Props) {
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

  // Use the interaction hook for hover/click detection
  const { hoveredHex, selectedHex, groundPlaneProps } = useHexInteraction({
    hexSize: HEX_SIZE,
    gridWidth,
    gridHeight,
    onHexClick,
    onHexHover,
  });

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
          onClick={onEntityClick}
        />
      ))}
    </>
  );
}

/**
 * Main HexGridV2 component
 * Sets up the Canvas and renders the scene
 */
export function HexGridV2(props: HexGridV2Props) {
  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
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
    </div>
  );
}
