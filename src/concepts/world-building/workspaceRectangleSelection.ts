import {
  cubeToWorld,
  HEX_SIZE,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import {
  workspaceCells,
  type RoomHexCell,
  type RoomWorkspace,
} from './workspaceGeometry';

/** Renderer-local, immutable presentation derivation. Build once per workspace;
 * samples filter precomputed centers, never allocate an enclosing-radius disk. */
export function createWorkspaceRectangleSelection(
  workspace: RoomWorkspace | number
): (start: WorldPos, end: WorldPos) => RoomHexCell[] {
  const centers = workspaceCells(workspace)
    .map((cell) => ({
      cell,
      point: cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      ),
    }))
    .sort((a, b) => a.point.z - b.point.z || a.point.x - b.point.x);
  return (start, end) => {
    if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) return [];
    // Absorb only screen/world roundtrip error at inclusive center boundaries.
    const epsilon =
      16 *
      Number.EPSILON *
      Math.max(
        1,
        Math.abs(start.x),
        Math.abs(start.z),
        Math.abs(end.x),
        Math.abs(end.z)
      );
    const minX = Math.min(start.x, end.x) - epsilon,
      maxX = Math.max(start.x, end.x) + epsilon;
    const minZ = Math.min(start.z, end.z) - epsilon,
      maxZ = Math.max(start.z, end.z) + epsilon;
    return centers
      .filter(
        ({ point }) =>
          point.x >= minX &&
          point.x <= maxX &&
          point.z >= minZ &&
          point.z <= maxZ
      )
      .map(({ cell }) => cell);
  };
}
