/**
 * ShadedHexWall - Visual component for wall segments using WallBuilder
 *
 * Drop-in replacement for HexWall that uses WallBuilder with AdvancedCharacterShader
 * for auto-shaded voxel-style walls instead of plain MeshStandardMaterial pillars.
 *
 * Creates wall meshes between start and end positions using WallBuilder.createWallBetween,
 * converting cube coordinates to world coordinates via hexMath.cubeToWorld.
 */

import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
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

// Color lookup by wall kind. v1alpha2 Wall carries no material field (the
// v1alpha1 room_common Wall this replaced did) — kind is the only semantic
// hook available today. DOOR_* segments here are a fallback only: doors are
// currently rendered through the separate `doors: DoorInfo[]` prop/HexDoor
// pipeline, not through this one.
function getKindColor(kind: WallKind): number {
  switch (kind) {
    case WallKind.DOOR_CLOSED:
    case WallKind.DOOR_OPEN:
      return WallColors.woodMedium;
    case WallKind.WINDOW:
      return WallColors.dungeonGray;
    case WallKind.SOLID:
    case WallKind.UNSPECIFIED:
    default:
      return WallColors.stoneMedium;
  }
}

export function ShadedHexWall({ wall, hexSize }: ShadedHexWallProps) {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const builderRef = useRef<WallBuilder | null>(null);

  useEffect(() => {
    if (!groupRef.current || !wall.from || !wall.to) return;

    const start: CubeCoord = {
      x: wall.from.x,
      y: wall.from.y,
      z: wall.from.z,
    };
    const end: CubeCoord = {
      x: wall.to.x,
      y: wall.to.y,
      z: wall.to.z,
    };

    const color = getKindColor(wall.kind);

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
