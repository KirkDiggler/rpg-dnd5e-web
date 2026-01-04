/**
 * InstancedHexTiles - Renders all hex tiles using a single instanced mesh
 *
 * Instead of rendering gridWidth * gridHeight individual meshes (400 draw calls for 20x20),
 * this uses THREE.InstancedMesh to render ALL tiles in a SINGLE draw call.
 *
 * Performance improvement: O(n) draw calls -> O(1) draw call
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

interface InstancedHexTilesProps {
  gridWidth: number;
  gridHeight: number;
  hexSize: number;
  hoveredHex: CubeCoord | null;
  selectedHex: CubeCoord | null;
}

// Visual state colors
const COLORS = {
  default: new THREE.Color('#4a5568'), // gray
  hovered: new THREE.Color('#718096'), // lighter gray
  selected: new THREE.Color('#48bb78'), // green
};

/**
 * Creates a flat hexagon geometry for pointy-top orientation
 */
function createHexagonGeometry(hexSize: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();

  // Generate 6 vertices for pointy-top hex
  for (let i = 0; i < 6; i++) {
    const angleDeg = 30 + 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    const x = hexSize * Math.cos(angleRad);
    const y = hexSize * Math.sin(angleRad);

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Convert grid index to cube coordinates
 */
function indexToCube(x: number, z: number): CubeCoord {
  const y = -x - z;
  return { x, y, z };
}

/**
 * Check if two cube coordinates are equal
 */
function cubesEqual(a: CubeCoord | null, b: CubeCoord): boolean {
  if (!a) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function InstancedHexTiles({
  gridWidth,
  gridHeight,
  hexSize,
  hoveredHex,
  selectedHex,
}: InstancedHexTilesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instanceCount = gridWidth * gridHeight;

  // Create geometry once
  const geometry = useMemo(() => createHexagonGeometry(hexSize), [hexSize]);

  // Create material once
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
      }),
    []
  );

  // Initialize instance matrices and colors
  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Euler(-Math.PI / 2, 0, 0); // Lay flat on XZ plane
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    const scale = new THREE.Vector3(1, 1, 1);

    // Set up instance matrices (positions)
    let instanceIndex = 0;
    for (let z = 0; z < gridHeight; z++) {
      for (let x = 0; x < gridWidth; x++) {
        const cube = indexToCube(x, z);
        const worldPos = cubeToWorld(cube, hexSize);

        matrix.compose(
          new THREE.Vector3(worldPos.x, 0, worldPos.z),
          quaternion,
          scale
        );
        mesh.setMatrixAt(instanceIndex, matrix);
        instanceIndex++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;

    // Cleanup
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [gridWidth, gridHeight, hexSize, geometry, material]);

  // Update instance colors when hover/selected changes
  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;

    // Create or update color attribute
    const colors = new Float32Array(instanceCount * 3);

    let instanceIndex = 0;
    for (let z = 0; z < gridHeight; z++) {
      for (let x = 0; x < gridWidth; x++) {
        const cube = indexToCube(x, z);

        let color: THREE.Color;
        if (cubesEqual(selectedHex, cube)) {
          color = COLORS.selected;
        } else if (cubesEqual(hoveredHex, cube)) {
          color = COLORS.hovered;
        } else {
          color = COLORS.default;
        }

        colors[instanceIndex * 3] = color.r;
        colors[instanceIndex * 3 + 1] = color.g;
        colors[instanceIndex * 3 + 2] = color.b;

        instanceIndex++;
      }
    }

    // Set colors via instance color attribute
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.needsUpdate = true;
  }, [gridWidth, gridHeight, hoveredHex, selectedHex, instanceCount]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instanceCount]}
      frustumCulled={false}
    />
  );
}
