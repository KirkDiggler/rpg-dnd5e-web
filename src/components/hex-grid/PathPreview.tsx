/**
 * PathPreview - Visualizes movement path on the hex grid
 *
 * Highlights hexes along the movement path with a subtle overlay.
 * Final destination has stronger highlight.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

interface PathPreviewProps {
  path: CubeCoord[];
  hexSize: number;
  color?: string;
  opacity?: number;
}

const DEFAULT_COLOR = '#3b82f6'; // blue
const DEFAULT_OPACITY = 0.4;
const PATH_Y_OFFSET = 0.03; // Slightly above ground

/**
 * Creates a flat hexagon shape for pointy-top orientation
 */
function createHexagonShape(hexSize: number): THREE.Shape {
  const shape = new THREE.Shape();

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
  return shape;
}

export function PathPreview({
  path,
  hexSize,
  color = DEFAULT_COLOR,
  opacity = DEFAULT_OPACITY,
}: PathPreviewProps) {
  const hexShape = useMemo(() => createHexagonShape(hexSize), [hexSize]);

  if (path.length === 0) return null;

  return (
    <group>
      {path.map((coord, index) => {
        const worldPos = cubeToWorld(coord, hexSize);
        const isDestination = index === path.length - 1;
        const pathOpacity = isDestination ? opacity * 1.5 : opacity;

        return (
          <mesh
            key={`path-${coord.x}-${coord.y}-${coord.z}`}
            position={[worldPos.x, PATH_Y_OFFSET, worldPos.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <shapeGeometry args={[hexShape]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={pathOpacity}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
