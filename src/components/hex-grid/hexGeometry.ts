/**
 * Hex geometry utilities for Three.js rendering
 *
 * Shared geometry creation for hex-based 3D elements (tiles, walls, doors)
 * to ensure visual consistency across the hex grid.
 */

import * as THREE from 'three';

/**
 * Creates a hex shape matching the tile geometry exactly
 *
 * Uses pointy-top orientation with vertices at 30 + 60*i degrees.
 * This matches the vertex calculation in InstancedHexTiles for perfect alignment.
 *
 * @param hexSize - The hex radius (distance from center to vertex)
 * @param scale - Scale factor (default 0.95 for slight gaps between hexes)
 * @returns THREE.Shape for use with ExtrudeGeometry or ShapeGeometry
 */
export function createHexShape(hexSize: number, scale = 0.95): THREE.Shape {
  const shape = new THREE.Shape();

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
 * Creates an extruded hex pillar geometry
 *
 * @param hexSize - The hex radius
 * @param height - The pillar height in world units
 * @param scale - Scale factor for the hex shape
 * @returns THREE.ExtrudeGeometry for the hex pillar
 */
export function createHexPillarGeometry(
  hexSize: number,
  height: number,
  scale = 0.95
): THREE.ExtrudeGeometry {
  const shape = createHexShape(hexSize, scale);
  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
}
