/**
 * HexDoor - Visual component for door connections between dungeon rooms
 *
 * Renders a hex-shaped pillar representing a door/connection.
 * Uses the same geometry as HexWall for visual consistency.
 * Supports visual states: closed (solid brown), open (green), loading (pulsing).
 * Clickable to navigate to adjacent rooms during player's turn.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

export interface HexDoorProps {
  connectionId: string;
  position: CubeCoord;
  physicalHint: string;
  isOpen: boolean;
  isLoading: boolean;
  hexSize: number;
  onClick: (connectionId: string) => void;
  onHoverChange?: (
    door: { connectionId: string; physicalHint: string } | null
  ) => void;
  disabled: boolean;
}

// Door visual constants (in world space units)
const DOOR_HEIGHT = 0.8; // Same height as walls for consistent appearance

// Colors for door states
const COLORS = {
  closed: '#8B4513', // Saddle brown - solid wood door
  open: '#228B22', // Forest green - passable
  hover: '#D2691E', // Chocolate - highlighted
  loading: '#DAA520', // Goldenrod - processing
};

/**
 * Creates a hex shape matching the tile geometry exactly
 * Uses the same vertex calculation as InstancedHexTiles (30 + 60*i degrees)
 */
function createHexShape(hexSize: number): THREE.Shape {
  const shape = new THREE.Shape();
  const scale = 0.95; // Matches wall scale for consistency

  for (let i = 0; i < 6; i++) {
    const angleDeg = 30 + 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    const x = hexSize * scale * Math.cos(angleRad);
    const y = hexSize * scale * Math.sin(angleRad);

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return shape;
}

export function HexDoor({
  connectionId,
  position,
  physicalHint,
  isOpen,
  isLoading,
  hexSize,
  onClick,
  onHoverChange,
  disabled,
}: HexDoorProps) {
  const { invalidate } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create hex geometry matching tile/wall alignment
  const geometry = useMemo(() => {
    const shape = createHexShape(hexSize);
    const extrudeSettings = {
      depth: DOOR_HEIGHT,
      bevelEnabled: false,
    };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [hexSize]);

  // Animate loading state with pulsing opacity
  // Only run animation when actually loading to avoid GPU overhead
  useFrame((state) => {
    if (!isLoading || !meshRef.current) return;
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    // Pulse between 0.5 and 1.0 opacity
    material.opacity = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4);
    invalidate(); // Request next frame for animation
  });

  // Reset opacity when loading completes
  useEffect(() => {
    if (!isLoading && meshRef.current) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      material.opacity = isOpen ? 0.6 : 1.0;
    }
  }, [isLoading, isOpen]);

  // Determine color based on state
  const color = useMemo(() => {
    if (isLoading) return COLORS.loading;
    if (isHovered && !disabled) return COLORS.hover;
    if (isOpen) return COLORS.open;
    return COLORS.closed;
  }, [isLoading, isHovered, disabled, isOpen]);

  // Handle click
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!disabled && !isLoading) {
      onClick(connectionId);
    }
  };

  // Handle pointer events
  const handlePointerOver = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setIsHovered(true);
    if (!disabled && !isLoading) {
      document.body.style.cursor = 'pointer';
    }
    onHoverChange?.({ connectionId, physicalHint });
  };

  const handlePointerOut = () => {
    setIsHovered(false);
    document.body.style.cursor = 'auto';
    onHoverChange?.(null);
  };

  // Render hex pillar door
  // Rotation: -PI/2 on X to lay the extrusion flat, then it grows upward
  return (
    <mesh
      ref={meshRef}
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <meshStandardMaterial
        color={color}
        transparent={isLoading || isOpen}
        opacity={isOpen ? 0.6 : 1.0}
      />
    </mesh>
  );
}
