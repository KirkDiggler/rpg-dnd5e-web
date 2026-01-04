/**
 * HexWall - Visual component for wall segments in dungeon rooms
 *
 * Renders hex-shaped pillars along the wall path from start to end.
 * Each hex the wall passes through gets a full hex pillar.
 * Uses shared hex geometry for visual consistency with tiles and doors.
 */

import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createHexPillarGeometry } from './hexGeometry';
import { cubeToWorld, getHexLine, type CubeCoord } from './hexMath';

export interface HexWallProps {
  wall: Wall;
  hexSize: number;
}

// Wall height in world space units (matches hex size scale)
const WALL_HEIGHT = 0.8;

// Color lookup by material type
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
  // Get all hex positions along the wall using shared line algorithm
  const hexPositions = useMemo(() => {
    if (!wall.start || !wall.end) return [];

    const start: CubeCoord = {
      x: wall.start.x,
      y: wall.start.y,
      z: wall.start.z,
    };
    const end: CubeCoord = {
      x: wall.end.x,
      y: wall.end.y,
      z: wall.end.z,
    };

    return getHexLine(start, end);
  }, [wall.start, wall.end]);

  // Convert to world positions
  const worldPositions = useMemo(
    () => hexPositions.map((hex) => cubeToWorld(hex, hexSize)),
    [hexPositions, hexSize]
  );

  // Create shared hex geometry for all pillars
  const geometry = useMemo(
    () => createHexPillarGeometry(hexSize, WALL_HEIGHT),
    [hexSize]
  );

  // Create shared material (same color for all segments of this wall)
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: getMaterialColor(wall.material || 'stone'),
      }),
    [wall.material]
  );

  if (worldPositions.length === 0) {
    return null;
  }

  // Render a hex pillar at each position along the wall
  // Rotation: -PI/2 on X to lay the extrusion flat (matches tile rotation)
  // Then the extrusion grows upward from y=0
  return (
    <>
      {worldPositions.map((pos, index) => (
        <mesh
          key={`${hexPositions[index].x}-${hexPositions[index].y}-${hexPositions[index].z}`}
          position={[pos.x, 0, pos.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={geometry}
          material={material}
        />
      ))}
    </>
  );
}
