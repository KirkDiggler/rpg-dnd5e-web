/**
 * HexTile - Visual component for a single hex on the grid
 *
 * Renders a flat hexagon at the specified cube coordinate position.
 * Supports three visual states: default (gray), hovered (lighter gray), and selected (green).
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

interface HexTileProps {
  position: CubeCoord;
  hexSize: number;
  isHovered?: boolean;
  isSelected?: boolean;
}

// Visual state colors
const COLORS = {
  default: '#4a5568', // gray
  hovered: '#718096', // lighter gray
  selected: '#48bb78', // green
};

/**
 * Creates a flat hexagon shape for pointy-top orientation
 *
 * Vertices at angles: 30°, 90°, 150°, 210°, 270°, 330°
 * (measured counter-clockwise from the positive X-axis, standard math convention)
 *
 * Starting at 30° places the first vertex at top-right, creating pointy-top orientation.
 *
 * @param hexSize - The hex radius (distance from center to vertex)
 * @returns A THREE.Shape representing a hexagon
 */
function createHexagonShape(hexSize: number): THREE.Shape {
  const shape = new THREE.Shape();

  // Generate 6 vertices for pointy-top hex
  // Starting at 30° (top vertex) and going counter-clockwise
  for (let i = 0; i < 6; i++) {
    const angleDeg = 30 + 60 * i; // Start at 30° for pointy-top
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

export function HexTile({
  position,
  hexSize,
  isHovered = false,
  isSelected = false,
}: HexTileProps) {
  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create the hexagon geometry
  const geometry = useMemo(() => {
    const shape = createHexagonShape(hexSize);
    // Use ShapeGeometry for a flat 2D shape (no extrusion)
    return new THREE.ShapeGeometry(shape);
  }, [hexSize]);

  // Determine color based on state (selected takes priority over hovered)
  const color = isSelected
    ? COLORS.selected
    : isHovered
      ? COLORS.hovered
      : COLORS.default;

  return (
    <mesh
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[-Math.PI / 2, 0, 0]} // Rotate to lay flat on XZ plane (facing up)
      geometry={geometry}
    >
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
