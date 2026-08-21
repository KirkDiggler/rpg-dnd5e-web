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

/**
 * The inverse of `positionToCube`: cube.x is the wire's q, cube.z is the
 * wire's r, cube.y is dropped (it's derived, not carried on the wire).
 * Returned as a plain `{x, y}` shape rather than a real `Position` message
 * (no `$typeName`) — every cube coordinate this bridges is one `atlasPath`
 * already validated against `atlas.cells`, so the RPC client's own
 * `MessageInitShape` typing (which accepts bare data for nested message
 * fields, no `create()` call required) is what actually consumes this, not
 * a hand-typed `Position`.
 */
export function cubeToPosition(cube: CubeCoord): { x: number; y: number } {
  return { x: cube.x, y: cube.z };
}
