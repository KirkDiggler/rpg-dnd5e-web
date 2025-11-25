import { useVoxelModel } from '@/hooks/useVoxelModel';
import { hexDistance } from '@/utils/hexUtils';
import type { Room } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';

interface VoxelGridProps {
  room: Room;
  cellSize?: number;
  selectedCharacter?: string | null;
  movementMode?: boolean;
  movementRange?: number;
  onEntityClick?: (entityId: string) => void;
  onEntityHover?: (entityId: string | null) => void;
  onCellClick?: (x: number, y: number) => void;
}

// Hex math constants (matching HexGrid.tsx)
const SQRT_3 = Math.sqrt(3);

// Convert hex grid coordinates to 3D world coordinates
function hexToWorld(x: number, y: number): { x: number; z: number } {
  // Pointy-top hex layout
  // For a hex with radius 0.5:
  // - Width (flat to flat) = sqrt(3) * radius = sqrt(3) * 0.5
  // - Height (point to point) = 2 * radius = 1.0
  // - Vertical spacing between rows = 1.5 * radius = 0.75
  const hexRadius = 0.5;
  const worldX = SQRT_3 * hexRadius * (x + y / 2);
  const worldZ = 1.5 * hexRadius * y;
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
  x: number;
  y: number;
  isOccupied: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isInRange: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
}

function HexCell({
  x,
  y,
  isOccupied,
  isSelected,
  isHovered,
  isInRange,
  onClick,
  onHover,
}: GridCellProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  // Convert grid coordinates to world position
  const pos = hexToWorld(x, y);

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
    <group position={[pos.x, 0, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Main hex tile */}
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        geometry={hexGeometry}
      >
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
  );
}

interface EntityMarkerProps {
  x: number;
  y: number;
  entityType: string;
  isSelected: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
}

function EntityMarker({
  x,
  y,
  entityType,
  isSelected,
  onClick,
  onHover,
}: EntityMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Convert grid coordinates to world position
  const pos = hexToWorld(x, y);

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

  const { model: voxelModel } = useVoxelModel({
    modelPath: shouldUseVoxel ? modelPath : '',
    scale: 0.02, // Scale to make character ~1.0 world units (5 feet) tall
    rotationX: -Math.PI / 2, // Stand up the model right-side up
    rotationY: -Math.PI / 2, // Rotate 90 degrees right (clockwise from top)
  });

  // Simple animation for selected entity
  useFrame((state) => {
    if (groupRef.current && isSelected) {
      groupRef.current.position.y =
        0.05 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    } else if (groupRef.current) {
      groupRef.current.position.y = 0.05;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[pos.x, 0.05, pos.z]}
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
  onEntityClick,
  onEntityHover,
  onCellClick,
}: VoxelGridProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Get selected entity position for range calculation
  const selectedEntity = selectedCharacter
    ? Object.values(room.entities).find((e) => e.entityId === selectedCharacter)
    : null;
  const selectedPosition = selectedEntity?.position;

  // Calculate if a cell is in movement range (using hex distance)
  const isInMovementRange = (x: number, y: number): boolean => {
    if (!movementMode || !selectedPosition || !movementRange) return false;

    const distance = hexDistance(selectedPosition.x, selectedPosition.y, x, y);
    const rangeInHexes = Math.floor(movementRange / 5); // 5ft per hex (matching HexGrid.tsx)

    return distance > 0 && distance <= rangeInHexes;
  };

  // Render hex grid cells
  const renderGrid = () => {
    const cells = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const isOccupied = Object.values(room.entities).some(
          (e) => e.position?.x === x && e.position?.y === y
        );
        const isSelected =
          selectedPosition?.x === x && selectedPosition?.y === y;
        const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
        const isInRange = isInMovementRange(x, y);

        cells.push(
          <HexCell
            key={`hex-${x}-${y}`}
            x={x}
            y={y}
            isOccupied={isOccupied}
            isSelected={isSelected}
            isHovered={isHovered}
            isInRange={isInRange}
            onClick={() => onCellClick?.(x, y)}
            onHover={(hover) => {
              setHoveredCell(hover ? { x, y } : null);
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

      return (
        <EntityMarker
          key={entity.entityId}
          x={entity.position.x}
          y={entity.position.y}
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
    </>
  );
}

export function VoxelGrid(props: VoxelGridProps) {
  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
      <Canvas
        camera={{
          position: [
            -22.099228887851552, 6.343584064334879, 20.566566423746607,
          ],
          zoom: 71.76911159862591,
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
          target={[0.7799356490628112, -0.5942686854433457, -2.796867170551753]}
        />
      </Canvas>
    </div>
  );
}
