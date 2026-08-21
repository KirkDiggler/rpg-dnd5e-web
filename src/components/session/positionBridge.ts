/**
 * positionBridge — the axial (q, r) <-> cube (x, y, z) bridge, split out
 * of atlasToScene3D.ts so atlasWallRuns.ts can import it without a
 * circular dependency (atlasToScene3D.ts composes atlasWallRuns.ts's own
 * output into `Scene3D`). See atlasToScene3D.ts's module doc comment for
 * the full "why cube.x IS q, no swap" history; re-exported from there
 * unchanged so every existing caller's import path keeps working.
 */

import { cubeToWorld, type CubeCoord } from '@/components/hex-grid/hexMath';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

export function positionToCube(position: Position): CubeCoord {
  const q = position.x;
  const r = position.y;
  return { x: q, y: -q - r, z: r };
}

export function worldPositionOf(position: Position, hexSize: number) {
  return cubeToWorld(positionToCube(position), hexSize);
}
