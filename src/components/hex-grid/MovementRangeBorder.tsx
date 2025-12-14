/**
 * MovementRangeBorder - Renders glowing perimeter around movement range
 *
 * Visualizes the boundary of reachable hexes with a soft glowing border line.
 * Uses edge data from useMovementRange which provides world coordinates for
 * each boundary edge segment.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BoundaryEdge } from './useMovementRange';

interface MovementRangeBorderProps {
  boundaryEdges: BoundaryEdge[]; // Edge segments with world coords
  color?: string; // Glow color (default cyan)
  opacity?: number; // Border opacity (default 0.8)
  glowIntensity?: number; // Emissive glow strength (default 2.0)
}

// Default visual settings for movement range border
const DEFAULT_COLOR = '#00bcd4'; // Cyan
const DEFAULT_OPACITY = 0.8;
const DEFAULT_GLOW_INTENSITY = 2.0;
const BORDER_Y_OFFSET = 0.05; // Slightly above ground to prevent z-fighting
const LINE_WIDTH = 0.08; // Width of the border line

/**
 * Renders a glowing border around the movement range
 *
 * Each edge is drawn as a thin rectangular mesh (flat ribbon) connecting
 * two vertices. Using meshes instead of lines allows for:
 * - Emissive materials (glow effect)
 * - Better control over width and appearance
 * - Consistent rendering across devices
 *
 * The border uses an emissive material to create a soft glow effect.
 * Optional: Can add subtle pulsing animation using useFrame.
 */
export function MovementRangeBorder({
  boundaryEdges,
  color = DEFAULT_COLOR,
  opacity = DEFAULT_OPACITY,
  glowIntensity = DEFAULT_GLOW_INTENSITY,
}: MovementRangeBorderProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Create geometry for all edges batched together
  const geometry = useMemo(() => {
    if (boundaryEdges.length === 0) return null;

    // Build a single buffer geometry containing all edge segments
    const positions: number[] = [];
    const indices: number[] = [];

    let vertexIndex = 0;

    boundaryEdges.forEach((edge) => {
      const { from, to } = edge;

      // Each edge is a thin rectangle (4 vertices, 2 triangles)
      // Calculate perpendicular vector for width
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.sqrt(dx * dx + dz * dz);

      // Perpendicular vector (rotate 90 degrees in XZ plane)
      const perpX = -dz / length;
      const perpZ = dx / length;

      // Half width offset
      const offsetX = perpX * LINE_WIDTH * 0.5;
      const offsetZ = perpZ * LINE_WIDTH * 0.5;

      // 4 vertices for the rectangle
      // Bottom left
      positions.push(from.x - offsetX, BORDER_Y_OFFSET, from.z - offsetZ);
      // Bottom right
      positions.push(from.x + offsetX, BORDER_Y_OFFSET, from.z + offsetZ);
      // Top right
      positions.push(to.x + offsetX, BORDER_Y_OFFSET, to.z + offsetZ);
      // Top left
      positions.push(to.x - offsetX, BORDER_Y_OFFSET, to.z - offsetZ);

      // Two triangles forming the rectangle
      // Triangle 1: bottom-left, bottom-right, top-right
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      // Triangle 2: bottom-left, top-right, top-left
      indices.push(vertexIndex, vertexIndex + 2, vertexIndex + 3);

      vertexIndex += 4;
    });

    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    bufferGeometry.setIndex(indices);
    bufferGeometry.computeVertexNormals();

    return bufferGeometry;
  }, [boundaryEdges]);

  // Optional: Add subtle pulsing animation
  useFrame((state) => {
    if (groupRef.current) {
      // Subtle pulse: oscillate opacity between 0.7 and 1.0
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.15 + 0.85;
      groupRef.current.children.forEach((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshBasicMaterial
        ) {
          child.material.opacity = opacity * pulse;
        }
      });
    }
  });

  // Don't render if no edges
  if (!geometry) return null;

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={glowIntensity}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
