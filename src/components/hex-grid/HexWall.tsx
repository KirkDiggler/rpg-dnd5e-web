/**
 * HexWall - Visual component for wall segments in dungeon rooms
 *
 * Renders hex-shaped pillars along the wall path from start to end.
 * Each hex the wall passes through gets a full hex pillar.
 * Uses the same hex geometry as tiles (ShapeGeometry + ExtrudeGeometry) for perfect alignment.
 */

import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

export interface HexWallProps {
  wall: Wall;
  hexSize: number;
}

// Wall visual constants (in world space units, matches hex size scale)
const WALL_HEIGHT = 0.8;

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

/**
 * Creates a hex shape matching the tile geometry exactly
 * Uses the same vertex calculation as InstancedHexTiles (30 + 60*i degrees)
 */
function createHexShape(hexSize: number): THREE.Shape {
  const shape = new THREE.Shape();
  const scale = 0.95; // Slightly smaller than tiles for visual distinction

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

/**
 * Get all hex positions along a line from start to end using cube coordinate lerp
 * This is the standard hex line-drawing algorithm
 */
function getHexesAlongLine(start: CubeCoord, end: CubeCoord): CubeCoord[] {
  const distance = Math.max(
    Math.abs(start.x - end.x),
    Math.abs(start.y - end.y),
    Math.abs(start.z - end.z)
  );

  if (distance === 0) {
    return [start];
  }

  const hexes: CubeCoord[] = [];
  for (let i = 0; i <= distance; i++) {
    const t = i / distance;
    // Lerp each coordinate
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const z = start.z + (end.z - start.z) * t;
    // Round to nearest hex
    hexes.push(cubeRound({ x, y, z }));
  }

  return hexes;
}

/**
 * Round fractional cube coordinates to nearest valid hex
 */
function cubeRound(cube: { x: number; y: number; z: number }): CubeCoord {
  let rx = Math.round(cube.x);
  let ry = Math.round(cube.y);
  let rz = Math.round(cube.z);

  const xDiff = Math.abs(rx - cube.x);
  const yDiff = Math.abs(ry - cube.y);
  const zDiff = Math.abs(rz - cube.z);

  // Adjust the component with largest rounding error to maintain x + y + z = 0
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

export function HexWall({ wall, hexSize }: HexWallProps) {
  // Get all hex positions along the wall
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

    return getHexesAlongLine(start, end);
  }, [wall.start, wall.end]);

  // Convert to world positions
  const worldPositions = useMemo(
    () => hexPositions.map((hex) => cubeToWorld(hex, hexSize)),
    [hexPositions, hexSize]
  );

  // Create hex geometry matching tile alignment exactly
  const geometry = useMemo(() => {
    const shape = createHexShape(hexSize);
    const extrudeSettings = {
      depth: WALL_HEIGHT,
      bevelEnabled: false,
    };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [hexSize]);

  const color = getMaterialColor(wall.material || 'stone');

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
        >
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </>
  );
}
