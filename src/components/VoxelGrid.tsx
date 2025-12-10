import { useVoxelModel } from '@/hooks/useVoxelModel';
import type { DamageNumber } from '@/types/combat';
import {
  cubeKey,
  cubeToOffset,
  hexDistance,
  offsetToCube,
  type CubeCoord,
} from '@/utils/hexUtils';
import type { Room } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';

interface VoxelGridProps {
  room: Room;
  cellSize?: number;
  selectedCharacter?: string | null;
  movementMode?: boolean;
  movementRange?: number;
  damageNumbers?: DamageNumber[];
  onEntityClick?: (entityId: string) => void;
  onEntityHover?: (entityId: string | null) => void;
  onCellClick?: (coord: CubeCoord) => void;
  onCellDoubleClick?: (coord: CubeCoord) => void;
}

// Hex math constants (matching HexGrid.tsx)
const SQRT_3 = Math.sqrt(3);

// Convert cube coordinates to 3D world coordinates (pointy-top hex, odd-r offset)
// First converts to offset, then to world space
function cubeToWorld(cube: CubeCoord): { x: number; z: number } {
  const offset = cubeToOffset(cube);
  return offsetToWorld(offset.col, offset.row);
}

// Convert offset coordinates to 3D world coordinates (pointy-top hex, odd-r offset)
// odd-r: odd rows are shifted in X direction by half a hex width
function offsetToWorld(col: number, row: number): { x: number; z: number } {
  // For a hex with radius 0.5:
  // - Width (flat to flat) = sqrt(3) * radius = sqrt(3) * 0.5
  // - Height (point to point) = 2 * radius = 1.0
  // - Vertical spacing between rows = 1.5 * radius = 0.75
  const hexRadius = 0.5;
  // For pointy-top hexes (odd-r offset):
  // - Columns are spaced by sqrt(3) * radius (horizontal/X spacing)
  // - Rows are spaced by 1.5 * radius (depth/Z spacing)
  // - Odd rows are shifted in X by sqrt(3)/2 * radius
  const worldX = SQRT_3 * hexRadius * (col + (row & 1) * 0.5);
  const worldZ = 1.5 * hexRadius * row;
  return { x: worldX, z: worldZ };
}

// Create hexagon shape for Three.js
// For pointy-top hexes, the width is sqrt(3) * radius and height is 2 * radius
// To make them touch, radius should be 0.5 (so width = sqrt(3)/2 ≈ 0.866)
function createHexagonShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // Pointy-top orientation
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();
  return shape;
}

interface GridCellProps {
  col: number;
  row: number;
  isOccupied: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isInRange: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onHover: (hover: boolean) => void;
}

function HexCell({
  col,
  row,
  isOccupied,
  isSelected,
  isHovered,
  isInRange,
  onClick,
  onDoubleClick,
  onHover,
}: GridCellProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  // Convert offset coordinates to world position
  const pos = offsetToWorld(col, row);

  // Determine cell color based on state
  const getColor = () => {
    if (isSelected) return '#4ade80'; // Green for selected
    if (isHovered) return '#60a5fa'; // Blue for hovered
    if (isInRange) return '#22c55e'; // Green for in range (matching 2D)
    if (isOccupied) return '#ef4444'; // Red for occupied
    return '#1e293b'; // Darker for default (better contrast)
  };

  // Create hex geometry with thicker base
  // Radius 0.5 makes hexes touch perfectly (width = sqrt(3)/2 ≈ 0.866)
  const hexShape = createHexagonShape(0.5);
  const hexGeometry = new THREE.ExtrudeGeometry(hexShape, {
    depth: 0.1, // Thicker for better visibility
    bevelEnabled: false,
  });

  // Create edges for visible borders
  const edges = new THREE.EdgesGeometry(hexGeometry);

  return (
    <group position={[pos.x, 0, pos.z]}>
      {/* Invisible cylinder hit area for easier clicking - not rotated with hex */}
      <mesh
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        position={[0, 0.5, 0]} // Center at half height
      >
        <cylinderGeometry args={[0.45, 0.45, 1.0, 6]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Visual hex tile */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* Main hex tile */}
        <mesh ref={meshRef} geometry={hexGeometry}>
          <meshStandardMaterial
            color={getColor()}
            transparent
            opacity={isInRange ? 0.7 : 0.5}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>

        {/* Visible hex borders */}
        <lineSegments ref={edgesRef} geometry={edges}>
          <lineBasicMaterial
            color={isHovered || isSelected ? '#ffffff' : '#64748b'}
            linewidth={2}
            opacity={0.8}
            transparent
          />
        </lineSegments>
      </group>
    </group>
  );
}

interface EntityMarkerProps {
  cube: CubeCoord;
  entityType: string;
  isSelected: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
}

function EntityMarker({
  cube,
  entityType,
  isSelected,
  onClick,
  onHover,
}: EntityMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Convert cube coordinates to world position
  const pos = cubeToWorld(cube);

  // Determine color based on entity type (matching 2D HexGrid colors)
  const getColor = () => {
    if (isSelected) return '#10b981'; // Green when selected
    const type = entityType.toLowerCase();
    if (type === 'character' || type === 'player') return '#3B82F6'; // Blue for players
    if (type === 'monster' || type === 'enemy') return '#EF4444'; // Red for monsters
    return '#8b5cf6'; // Purple for other
  };

  // Load voxel model based on entity type
  const type = entityType.toLowerCase();
  const isPlayer = type === 'character' || type === 'player';
  const isMonster = type === 'monster' || type === 'enemy';
  const isPillar = type === 'pillar' || type === 'obstacle';

  // Players get high-res model, monsters get low-res for comparison, pillars stay as boxes
  const shouldUseVoxel = isPlayer || isMonster;

  const modelPath = isPlayer
    ? '/models/human_complete_hires_solid.vox'
    : '/models/human_complete.vox'; // Low-res 13KB model for monsters

  // Players need smaller scale due to high-res model dimensions
  // Scale to make character ~5 feet tall (reduced from 0.015/0.02 which was 4x too large)
  const modelScale = isPlayer ? 0.00375 : 0.005;

  const { model: voxelModel } = useVoxelModel({
    modelPath: shouldUseVoxel ? modelPath : '',
    scale: modelScale, // Scale to make character ~1.0 world units (5 feet) tall
    rotationX: -Math.PI / 2, // Stand up the model right-side up
    rotationY: -Math.PI / 2, // Rotate 90 degrees right (clockwise from top)
  });

  // Simple animation for selected entity
  // Base Y of 0.15 prevents feet clipping into hex tiles
  useFrame((state) => {
    if (groupRef.current && isSelected) {
      groupRef.current.position.y =
        0.15 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    } else if (groupRef.current) {
      groupRef.current.position.y = 0.15;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[pos.x, 0.15, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(false);
      }}
    >
      {shouldUseVoxel && voxelModel ? (
        // Use voxel model for characters and monsters
        // Don't clone - just reference the model directly since each EntityMarker
        // is positioned independently via the group transform
        <primitive object={voxelModel} />
      ) : (
        // Box geometry for pillars/obstacles and while loading
        // Pillars should be around 10 feet (2.0 world units), characters ~5-6 feet (1.0-1.2 units)
        <mesh>
          <boxGeometry args={[0.8, isPillar ? 2.0 : 1.2, 0.8]} />
          <meshStandardMaterial
            color={getColor()}
            emissive={isSelected ? getColor() : '#000000'}
            emissiveIntensity={isSelected ? 0.2 : 0}
          />
        </mesh>
      )}
    </group>
  );
}

function Scene({
  room,
  selectedCharacter,
  movementMode,
  movementRange,
  damageNumbers = [],
  onEntityClick,
  onEntityHover,
  onCellClick,
  onCellDoubleClick,
}: VoxelGridProps) {
  const [hoveredCell, setHoveredCell] = useState<CubeCoord | null>(null);

  // Get selected entity position for range calculation (server provides cube coords)
  const selectedEntity = selectedCharacter
    ? Object.values(room.entities).find((e) => e.entityId === selectedCharacter)
    : null;
  const selectedCube: CubeCoord | null = selectedEntity?.position
    ? {
        x: selectedEntity.position.x,
        y: selectedEntity.position.y,
        z: selectedEntity.position.z,
      }
    : null;

  // Calculate if a cell is in movement range (using hex distance with cube coords)
  const isInMovementRange = (cellCube: CubeCoord): boolean => {
    if (!movementMode || !selectedCube || !movementRange) return false;

    const distance = hexDistance(
      selectedCube.x,
      selectedCube.y,
      selectedCube.z,
      cellCube.x,
      cellCube.y,
      cellCube.z
    );
    const rangeInHexes = Math.floor(movementRange / 5); // 5ft per hex (matching HexGrid.tsx)

    return distance > 0 && distance <= rangeInHexes;
  };

  // Render hex grid cells (iterate in offset, convert to cube for logic)
  const renderGrid = () => {
    const cells = [];
    for (let row = 0; row < room.height; row++) {
      for (let col = 0; col < room.width; col++) {
        const cellCube = offsetToCube({ col, row });
        const cellKey = cubeKey(cellCube);

        const isOccupied = Object.values(room.entities).some((e) => {
          if (!e.position) return false;
          return (
            cubeKey({ x: e.position.x, y: e.position.y, z: e.position.z }) ===
            cellKey
          );
        });
        const isSelected = selectedCube && cubeKey(selectedCube) === cellKey;
        const isHovered = hoveredCell && cubeKey(hoveredCell) === cellKey;
        const isInRange = isInMovementRange(cellCube);

        cells.push(
          <HexCell
            key={`hex-${col}-${row}`}
            col={col}
            row={row}
            isOccupied={isOccupied}
            isSelected={!!isSelected}
            isHovered={!!isHovered}
            isInRange={isInRange}
            onClick={() => onCellClick?.(cellCube)}
            onDoubleClick={() => onCellDoubleClick?.(cellCube)}
            onHover={(hover) => {
              setHoveredCell(hover ? cellCube : null);
            }}
          />
        );
      }
    }
    return cells;
  };

  // Render entity markers
  const renderEntities = () => {
    return Object.values(room.entities).map((entity) => {
      if (!entity.position) return null;

      const entityCube: CubeCoord = {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      };

      return (
        <EntityMarker
          key={entity.entityId}
          cube={entityCube}
          entityType={entity.entityType}
          isSelected={entity.entityId === selectedCharacter}
          onClick={() => onEntityClick?.(entity.entityId)}
          onHover={(hover) => {
            onEntityHover?.(hover ? entity.entityId : null);
          }}
        />
      );
    });
  };

  // Render floating damage numbers as HTML overlay
  const renderDamageNumbers = () => {
    return damageNumbers.map((dmg) => {
      const entity = Object.values(room.entities).find(
        (e) => e.entityId === dmg.entityId
      );
      if (!entity?.position) return null;

      const entityCube: CubeCoord = {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      };
      const pos = cubeToWorld(entityCube);

      return (
        <group
          key={dmg.id}
          position={[pos.x - room.width / 2, 1.5, pos.z - room.height / 2]}
        >
          <Html center>
            <div
              style={{
                color: dmg.isCritical ? '#FCD34D' : '#EF4444',
                fontSize: dmg.isCritical ? '2rem' : '1.5rem',
                fontWeight: 'bold',
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                pointerEvents: 'none',
                animation: 'floatUp3D 1.5s ease-out forwards',
              }}
            >
              {dmg.isCritical ? `CRIT! ${dmg.damage}` : dmg.damage}
            </div>
          </Html>
        </group>
      );
    });
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />

      {/* Grid */}
      <group position={[-room.width / 2, 0, -room.height / 2]}>
        {renderGrid()}
        {renderEntities()}
      </group>

      {/* Floating damage numbers */}
      {renderDamageNumbers()}
    </>
  );
}

export function VoxelGrid(props: VoxelGridProps) {
  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
      <style>
        {`
          @keyframes floatUp3D {
            0% {
              transform: translateY(0);
              opacity: 1;
            }
            100% {
              transform: translateY(-100px);
              opacity: 0;
            }
          }
        `}
      </style>
      <Canvas
        camera={{
          // Classic isometric: ~35° from horizontal, closer to action
          position: [10, 12, 10],
          zoom: 120,
        }}
        orthographic
      >
        <Scene {...props} />
        <OrbitControls
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.2} // Don't go completely horizontal
          minPolarAngle={Math.PI / 6} // Don't go too high (top-down)
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
