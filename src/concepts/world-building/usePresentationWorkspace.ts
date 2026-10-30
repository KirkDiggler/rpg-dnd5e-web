import { useMemo } from 'react';
import { contentWorkspace } from './contentGrid';
import type { RoomDraft } from './roomDraft';
import { rectangleOf, type RoomWorkspace } from './workspaceGeometry';

/** Value-stable presentation input, not a document cache. Owner normalization
 * may replace the workspace object during unrelated commits; geometry/camera
 * resources belong to its dimensions, not that object's identity. */
export function usePresentationWorkspace(
  workspace?: RoomWorkspace
): RoomWorkspace | undefined {
  const hexRadius = workspace?.hexRadius;
  const horizontalLimit = workspace?.horizontalLimit;
  const kind = workspace?.kind;
  const rect = workspace ? rectangleOf(workspace) : null;
  const widthHexes = rect?.widthHexes;
  const heightHexes = rect?.heightHexes;
  const minCol = rect?.minCol;
  const minRow = rect?.minRow;
  return useMemo((): RoomWorkspace | undefined => {
    if (hexRadius === undefined || horizontalLimit === undefined)
      return undefined;
    if (
      widthHexes === undefined ||
      heightHexes === undefined ||
      minCol === undefined ||
      minRow === undefined
    )
      return { hexRadius, horizontalLimit };
    return kind === 'odd-r-rect'
      ? {
          kind,
          minCol,
          minRow,
          widthHexes,
          heightHexes,
          hexRadius,
          horizontalLimit,
        }
      : {
          kind: 'centered-odd-r',
          widthHexes,
          heightHexes,
          hexRadius,
          horizontalLimit,
        };
  }, [
    kind,
    hexRadius,
    horizontalLimit,
    widthHexes,
    heightHexes,
    minCol,
    minRow,
  ]);
}

/** The derived grid for a draft (rpg-project#725 R3), value-stable by its
 * dimensions so geometry and camera resources survive unrelated commits. */
export function useContentWorkspace(
  draft: Pick<RoomDraft, 'room' | 'scene'>
): RoomWorkspace {
  const workspace = useMemo(() => contentWorkspace(draft), [draft]);
  return usePresentationWorkspace(workspace)!;
}
