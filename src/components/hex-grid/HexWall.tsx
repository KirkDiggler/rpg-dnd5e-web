/**
 * HexWall - Visual component for wall segments in dungeon rooms
 *
 * Renders a 3D box mesh between two hex positions representing a wall.
 * Supports different materials with placeholder colors until assets are ready.
 */

import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { useMemo } from 'react';
import { cubeToWorld } from './hexMath';

export interface HexWallProps {
  wall: Wall;
  hexSize: number;
}

// Wall visual constants (in world space units, matches hex size scale)
const WALL_HEIGHT = 0.8;
const DEFAULT_WALL_THICKNESS = 0.15;
const MIN_WALL_LENGTH = 0.01; // Below this length, render as pillar instead of wall

// Placeholder colors by material type
function getMaterialColor(material: string): string {
  switch (material) {
    case 'stone':
      return '#666666';
    case 'wood':
      return '#8B4513';
    case 'metal':
      return '#A0A0A0';
    default:
      return '#444444';
  }
}

export function HexWall({ wall, hexSize }: HexWallProps) {
  // Convert cube coords to world positions (handles undefined gracefully)
  const startWorld = useMemo(
    () =>
      wall.start
        ? cubeToWorld(
            { x: wall.start.x, y: wall.start.y, z: wall.start.z },
            hexSize
          )
        : null,
    [wall.start, hexSize]
  );

  const endWorld = useMemo(
    () =>
      wall.end
        ? cubeToWorld({ x: wall.end.x, y: wall.end.y, z: wall.end.z }, hexSize)
        : null,
    [wall.end, hexSize]
  );

  // Calculate wall geometry
  const geometry = useMemo(() => {
    if (!startWorld || !endWorld) return null;

    const midX = (startWorld.x + endWorld.x) / 2;
    const midZ = (startWorld.z + endWorld.z) / 2;
    const length = Math.hypot(
      endWorld.x - startWorld.x,
      endWorld.z - startWorld.z
    );
    const angle = Math.atan2(
      endWorld.z - startWorld.z,
      endWorld.x - startWorld.x
    );

    return { midX, midZ, length, angle };
  }, [startWorld, endWorld]);

  // Early return after all hooks are called
  if (!startWorld || !endWorld || !geometry) {
    return null;
  }

  // Handle zero-length walls (pillars) - render as a small cube
  const isPillar = geometry.length < MIN_WALL_LENGTH;
  const thickness =
    (wall.thickness ?? 0) > 0 ? wall.thickness : DEFAULT_WALL_THICKNESS;
  const color = getMaterialColor(wall.material || 'stone');

  if (isPillar) {
    // Render as a pillar (small cube) at the start position
    return (
      <mesh position={[startWorld.x, WALL_HEIGHT / 2, startWorld.z]}>
        <boxGeometry args={[thickness * 2, WALL_HEIGHT, thickness * 2]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }

  // Render as a wall segment between start and end
  return (
    <mesh
      position={[geometry.midX, WALL_HEIGHT / 2, geometry.midZ]}
      rotation={[0, -geometry.angle, 0]}
    >
      <boxGeometry args={[geometry.length, WALL_HEIGHT, thickness]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
