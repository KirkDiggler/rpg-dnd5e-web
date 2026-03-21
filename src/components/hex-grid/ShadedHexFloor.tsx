/**
 * ShadedHexFloor - Renders hex floor tiles using FloorBuilder's auto-shaded materials
 *
 * Drop-in replacement for InstancedHexTiles that uses the AdvancedCharacterShader
 * for voxel-style shading with auto light/dark variance.
 *
 * Uses the same cube coordinate iteration as InstancedHexTiles to ensure
 * floor tile positions align exactly with entity positions and other grid elements.
 */

import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { AbsoluteFloorTile } from '@/hooks/useDungeonMap';
import { FloorBuilder, FloorColors } from '@/rendering/FloorBuilder';

import { cubeToWorld, type CubeCoord } from './hexMath';

interface ShadedHexFloorProps {
  floorTiles: Map<string, AbsoluteFloorTile>;
  hexSize: number;
  hoveredHex: CubeCoord | null;
  selectedHex: CubeCoord | null;
  /** Door positions to color as door tiles */
  doorPositions?: CubeCoord[];
  /** Wall positions to color as wall tiles */
  wallPositions?: CubeCoord[];
}

// Highlight colors for hover/select/door/wall states
const HIGHLIGHT_COLORS = {
  hovered: new THREE.Color(0x718096),
  selected: new THREE.Color(0x48bb78),
  door: new THREE.Color(0x8b4513),
  wall: new THREE.Color(0x444444),
};

/**
 * Check if two cube coordinates are equal
 */
function cubesEqual(a: CubeCoord | null, b: CubeCoord): boolean {
  if (!a) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Convert cube coordinate to string key for Set lookup
 */
function cubeToKey(coord: CubeCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

/**
 * Convert array of positions to Set for O(1) lookup
 */
function positionsToSet(positions: CubeCoord[]): Set<string> {
  return new Set(positions.map(cubeToKey));
}

export function ShadedHexFloor({
  floorTiles,
  hexSize,
  hoveredHex,
  selectedHex,
  doorPositions = [],
  wallPositions = [],
}: ShadedHexFloorProps) {
  const { invalidate } = useThree();
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const builderRef = useRef<FloorBuilder | null>(null);
  const instanceCount = floorTiles.size;

  // Store base colors for resetting after highlight removal
  const baseColorsRef = useRef<Float32Array | null>(null);

  // Create floor mesh imperatively using FloorBuilder for geometry and materials
  useEffect(() => {
    if (!groupRef.current) return;
    if (instanceCount === 0) return;

    // FloorBuilder needs hexWidth and hexHeight that match cubeToWorld math.
    // cubeToWorld: worldX = hexSize * sqrt(3) * (cube.x + cube.z/2)
    // axialToWorld: x = hexWidth * (sqrt(3) * q + (sqrt(3)/2) * r)
    //
    // For alignment: hexWidth = hexSize AND hexHeight = hexSize
    // (NOT hexWidth * 0.866, which is the default)
    const builder = new FloorBuilder({
      hexWidth: hexSize,
      hexHeight: hexSize,
      tileThickness: 0.1,
      shadingVariance: 0.12,
      colorVariance: 0.05,
    });
    builderRef.current = builder;

    const baseColor = FloorColors.dungeonFloor;
    const material = builder.getMaterial(baseColor);

    // Create hex geometry using FloorBuilder's internal method pattern
    // We use a simple shape geometry matching the hex size
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angleDeg = 30 + 60 * i;
      const angleRad = (Math.PI / 180) * angleDeg;
      const vx = hexSize * Math.cos(angleRad);
      const vy = hexSize * Math.sin(angleRad);
      if (i === 0) {
        shape.moveTo(vx, vy);
      } else {
        shape.lineTo(vx, vy);
      }
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: false,
    });
    // Rotate so it lies flat (Y-up)
    geometry.rotateX(-Math.PI / 2);
    // Center vertically
    geometry.translate(0, 0.05, 0);

    const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);

    // Set up instance matrices from floorTiles map
    const matrix = new THREE.Matrix4();
    const baseColors = new Float32Array(instanceCount * 3);
    const baseColorObj = new THREE.Color(baseColor);

    let instanceIndex = 0;
    for (const [, tile] of floorTiles) {
      const worldPos = cubeToWorld(
        { x: tile.x, y: tile.y, z: tile.z },
        hexSize
      );

      matrix.setPosition(worldPos.x, 0, worldPos.z);
      mesh.setMatrixAt(instanceIndex, matrix);

      // Add slight color variation per tile
      const variation = 1 + (Math.random() - 0.5) * 0.1;
      baseColors[instanceIndex * 3] = baseColorObj.r * variation;
      baseColors[instanceIndex * 3 + 1] = baseColorObj.g * variation;
      baseColors[instanceIndex * 3 + 2] = baseColorObj.b * variation;

      instanceIndex++;
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(baseColors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;

    // Store base colors for later restoration
    baseColorsRef.current = new Float32Array(baseColors);

    meshRef.current = mesh;
    const group = groupRef.current;
    group.add(mesh);
    invalidate();

    return () => {
      group.remove(mesh);
      geometry.dispose();
      builder.dispose();
      builderRef.current = null;
      meshRef.current = null;
      baseColorsRef.current = null;
    };
  }, [floorTiles, hexSize, instanceCount, invalidate]);

  // Update instance colors when hover/selected/door/wall changes
  useEffect(() => {
    const mesh = meshRef.current;
    const baseColors = baseColorsRef.current;
    if (!mesh || !baseColors) return;

    const doorSet = positionsToSet(doorPositions);
    const wallSet = positionsToSet(wallPositions);

    // Start from base colors (with variation)
    const colors = new Float32Array(baseColors);

    let instanceIndex = 0;
    for (const [key, tile] of floorTiles) {
      const cube: CubeCoord = { x: tile.x, y: tile.y, z: tile.z };

      let overrideColor: THREE.Color | null = null;

      if (cubesEqual(selectedHex, cube)) {
        overrideColor = HIGHLIGHT_COLORS.selected;
      } else if (cubesEqual(hoveredHex, cube)) {
        overrideColor = HIGHLIGHT_COLORS.hovered;
      } else if (doorSet.has(key)) {
        overrideColor = HIGHLIGHT_COLORS.door;
      } else if (wallSet.has(key)) {
        overrideColor = HIGHLIGHT_COLORS.wall;
      }

      if (overrideColor) {
        colors[instanceIndex * 3] = overrideColor.r;
        colors[instanceIndex * 3 + 1] = overrideColor.g;
        colors[instanceIndex * 3 + 2] = overrideColor.b;
      }

      instanceIndex++;
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [
    floorTiles,
    hoveredHex,
    selectedHex,
    doorPositions,
    wallPositions,
    invalidate,
  ]);

  return <group ref={groupRef} />;
}

// Re-export the memoized version
export const ShadedHexFloorMemo = ShadedHexFloor;
