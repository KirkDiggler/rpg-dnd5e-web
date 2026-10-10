import { useMemo } from 'react';
import type { RoomWorkspace } from './workspaceGeometry';

/** Value-stable presentation input, not a document cache. Owner normalization
 * may replace the workspace object during unrelated commits; geometry/camera
 * resources belong to its dimensions, not that object's identity. */
export function usePresentationWorkspace(
  workspace?: RoomWorkspace
): RoomWorkspace | undefined {
  const hexRadius = workspace?.hexRadius;
  const horizontalLimit = workspace?.horizontalLimit;
  const widthHexes =
    workspace?.kind === 'centered-odd-r' ? workspace.widthHexes : undefined;
  const heightHexes =
    workspace?.kind === 'centered-odd-r' ? workspace.heightHexes : undefined;
  return useMemo(() => {
    if (hexRadius === undefined || horizontalLimit === undefined)
      return undefined;
    return widthHexes === undefined || heightHexes === undefined
      ? { hexRadius, horizontalLimit }
      : {
          kind: 'centered-odd-r',
          widthHexes,
          heightHexes,
          hexRadius,
          horizontalLimit,
        };
  }, [hexRadius, horizontalLimit, widthHexes, heightHexes]);
}
