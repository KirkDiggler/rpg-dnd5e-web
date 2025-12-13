/**
 * HexEntity - Visual component for a game entity positioned on a hex
 *
 * Renders a simple 3D shape (cylinder/capsule) at the specified hex position.
 * For v1: simple geometry to prove positioning works. Voxel models come later.
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

export interface HexEntityProps {
  entityId: string;
  name: string;
  position: CubeCoord;
  type: 'player' | 'monster';
  hexSize: number;
  isSelected?: boolean;
  onClick?: (entityId: string) => void;
}

// Visual state colors
const COLORS = {
  player: {
    default: '#3182ce', // blue
    selected: '#63b3ed', // brighter blue
  },
  monster: {
    default: '#e53e3e', // red
    selected: '#fc8181', // brighter red
  },
};

// Entity dimensions relative to hex size
const ENTITY_HEIGHT = 1.5; // Height of the cylinder
const ENTITY_RADIUS_SCALE = 0.3; // Radius as fraction of hex size
const Y_OFFSET = 0.1; // Small Y offset to sit above the hex plane

/**
 * Creates a capsule-like shape for the entity
 * Using CapsuleGeometry for a simple 3D representation
 *
 * @param hexSize - The hex radius (for scaling)
 * @returns A THREE.CapsuleGeometry
 */
function createEntityGeometry(hexSize: number): THREE.CapsuleGeometry {
  const radius = hexSize * ENTITY_RADIUS_SCALE;
  const height = ENTITY_HEIGHT;
  // CapsuleGeometry(radius, length, capSegments, radialSegments)
  return new THREE.CapsuleGeometry(radius, height, 8, 16);
}

export function HexEntity({
  entityId,
  // name prop not destructured - will be used for tooltips/labels in future
  position,
  type,
  hexSize,
  isSelected = false,
  onClick,
}: HexEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create the entity geometry
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  // Determine color based on type and selection state
  const color = isSelected ? COLORS[type].selected : COLORS[type].default;

  // Handle click events
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation(); // Prevent hex click from firing
    if (onClick) {
      onClick(entityId);
    }
  };

  // Position entity at hex center with Y offset
  // The capsule is already oriented vertically (Y-up), so no rotation needed
  const yPosition = Y_OFFSET + ENTITY_HEIGHT / 2; // Center of capsule at correct height

  return (
    <mesh
      ref={meshRef}
      position={[worldPos.x, yPosition, worldPos.z]}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
    </mesh>
  );
}
