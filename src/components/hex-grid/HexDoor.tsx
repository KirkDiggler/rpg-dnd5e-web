/**
 * HexDoor - Visual component for door connections between dungeon rooms
 *
 * Renders a flat rectangle on a hex tile representing a door/connection.
 * Supports visual states: closed (solid brown), open (outline), loading (pulsing).
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

// Door visual constants
const DOOR_WIDTH_RATIO = 0.5; // Relative to hex size
const DOOR_HEIGHT_RATIO = 0.3;
const DOOR_Y_OFFSET = 0.02; // Slightly above hex tile to prevent z-fighting

// Colors for door states
const COLORS = {
  closed: '#8B4513', // Saddle brown - solid wood door
  open: '#228B22', // Forest green - passable
  hover: '#D2691E', // Chocolate - highlighted
  loading: '#DAA520', // Goldenrod - processing
};

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

  // Door dimensions
  const doorWidth = hexSize * DOOR_WIDTH_RATIO;
  const doorHeight = hexSize * DOOR_HEIGHT_RATIO;

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

  return (
    <group position={[worldPos.x, DOOR_Y_OFFSET, worldPos.z]}>
      {/* Door plane - flat on the hex */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial
          color={color}
          transparent={isLoading || isOpen}
          opacity={isOpen ? 0.6 : 1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Door border for open state */}
      {isOpen && (
        <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
          <edgesGeometry
            args={[new THREE.PlaneGeometry(doorWidth, doorHeight)]}
          />
          <lineBasicMaterial color={COLORS.open} />
        </lineSegments>
      )}
    </group>
  );
}
