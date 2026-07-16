/**
 * FrontierGroundHint - Dim ground hint hexes just beyond revealed walls
 *
 * rpg-dnd5e-web#457: per-viewer reveal is working as designed (a wall
 * enters the revealed set the moment sight reaches it, everything beyond
 * stays black), but the net visual is solid wall blocks standing at the
 * edge of the revealed floor, surrounded by unexplored darkness — they
 * read as blocks floating off-map rather than walls bounding a room.
 *
 * This renders a dim, unlit, low-opacity hex at every hex immediately
 * adjacent to a wall that isn't already revealed floor (computed by
 * `frontierGroundHintHexes`), grounding the wall against something rather
 * than pure black. Deliberately styled to read as "hinted, not real" —
 * flat unlit material, well below ShadedHexFloor's brightness/opacity —
 * so it's never mistaken for actual revealed, walkable floor.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CubeCoord } from './hexMath';
import { cubeToWorld } from './hexMath';

export interface FrontierGroundHintProps {
  hints: CubeCoord[];
  hexSize: number;
}

// A dim, desaturated fraction of FloorColors.dungeonFloor (0x4a4a4a) —
// dark enough to read as "barely visible ground", never mistaken for the
// real, lit floor tiles.
const HINT_COLOR = 0x232323;
const HINT_OPACITY = 0.35;
// Flush with the ground plane — below ShadedHexFloor's extruded top
// (0.05-0.15) so a hint never competes with real floor for the same pixel.
const HINT_Y = 0.02;

/**
 * Build the flat hex shape used for both the geometry and its silhouette.
 * Matches ShadedHexFloor's unscaled hex (hexSize * cos/sin(angle), no
 * scale reduction) so a hint's footprint lines up with a real floor tile's
 * if reveal ever catches up to it.
 */
function createHintGeometry(hexSize: number): THREE.ShapeGeometry {
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

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function FrontierGroundHint({
  hints,
  hexSize,
}: FrontierGroundHintProps) {
  const geometry = useMemo(() => createHintGeometry(hexSize), [hexSize]);

  // Shared geometry is passed by prop to every <mesh> below, not created
  // inline as a JSX child — R3F doesn't auto-dispose prop-supplied
  // geometry (it doesn't own the object's lifecycle), so dispose it
  // ourselves once, matching HexWall.tsx's identical shared-geometry
  // pattern. Disposing here (not per-mesh) also avoids freeing a GPU
  // resource still in use by sibling meshes sharing the same geometry.
  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const positions = useMemo(
    () => hints.map((hex) => cubeToWorld(hex, hexSize)),
    [hints, hexSize]
  );

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos, index) => (
        <mesh
          key={`${hints[index].x},${hints[index].y},${hints[index].z}`}
          position={[pos.x, HINT_Y, pos.z]}
          geometry={geometry}
        >
          <meshBasicMaterial
            color={HINT_COLOR}
            transparent
            opacity={HINT_OPACITY}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
