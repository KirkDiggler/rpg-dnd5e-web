/**
 * ShadedHexWall - Visual component for wall segments using WallBuilder
 *
 * Drop-in replacement for HexWall that uses WallBuilder with AdvancedCharacterShader
 * for auto-shaded voxel-style walls instead of plain MeshStandardMaterial pillars.
 *
 * Creates wall meshes between start and end positions using WallBuilder.createWallBetween,
 * converting cube coordinates to world coordinates via hexMath.cubeToWorld.
 */

import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { WallBuilder, WallColors } from '@/rendering/WallBuilder';

import { cubeToWorld, getHexLine, type CubeCoord } from './hexMath';

export interface ShadedHexWallProps {
  wall: Wall;
  hexSize: number;
}

// Wall height in world space units (matches HexWall's WALL_HEIGHT)
const WALL_HEIGHT = 0.8;

// Color lookup by material type
function getMaterialColor(material: string): number {
  switch (material) {
    case 'stone':
      return WallColors.stoneMedium;
    case 'wood':
      return WallColors.woodMedium;
    case 'metal':
      return WallColors.stoneDark;
    case 'dungeon':
      return WallColors.dungeonGray;
    default:
      return WallColors.stoneMedium;
  }
}

export function ShadedHexWall({ wall, hexSize }: ShadedHexWallProps) {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const builderRef = useRef<WallBuilder | null>(null);

  useEffect(() => {
    if (!groupRef.current || !wall.start || !wall.end) return;

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

    const color = getMaterialColor(wall.material || 'stone');

    // WallBuilder thickness is relative to hexWidth, so set hexWidth = hexSize * 2
    // (hexWidth in WallBuilder means the full width, hexSize is the radius)
    const builder = new WallBuilder({
      hexWidth: hexSize * 2,
      wallThicknessRatio: 0.1,
      color,
      shadingVariance: 0.15,
    });
    builderRef.current = builder;

    const group = groupRef.current;

    // Get all hex positions along the wall line
    const hexPositions = getHexLine(start, end);

    // Create wall segments between consecutive hex positions
    for (let i = 0; i < hexPositions.length - 1; i++) {
      const posA = cubeToWorld(hexPositions[i], hexSize);
      const posB = cubeToWorld(hexPositions[i + 1], hexSize);

      const anchorA = new THREE.Vector3(posA.x, 0, posA.z);
      const anchorB = new THREE.Vector3(posB.x, 0, posB.z);

      const wallMesh = builder.createWallBetween(
        anchorA,
        anchorB,
        WALL_HEIGHT,
        { color }
      );
      group.add(wallMesh);
    }

    // If the wall is a single hex, create a pillar instead
    if (hexPositions.length === 1) {
      const pos = cubeToWorld(hexPositions[0], hexSize);
      const pillar = builder.createPillar(
        new THREE.Vector3(pos.x, 0, pos.z),
        WALL_HEIGHT,
        { color }
      );
      group.add(pillar);
    }

    // Also add pillars at each hex position for visual consistency
    for (const hexPos of hexPositions) {
      const pos = cubeToWorld(hexPos, hexSize);
      const pillar = builder.createPillar(
        new THREE.Vector3(pos.x, 0, pos.z),
        WALL_HEIGHT,
        { color }
      );
      group.add(pillar);
    }

    invalidate();

    return () => {
      // Remove all children from group
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      }
      builder.dispose();
      builderRef.current = null;
    };
  }, [wall, hexSize, invalidate]);

  return <group ref={groupRef} />;
}
