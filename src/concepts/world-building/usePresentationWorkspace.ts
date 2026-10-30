import { useMemo } from 'react';
import { contentWorkspace, GRID_WINDOW_STEP } from './contentGrid';
import type { RoomDraft } from './roomDraft';
import type { WorldPoint } from './types';
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
  draft: Pick<RoomDraft, 'room' | 'scene'>,
  around?: WorldPoint
): RoomWorkspace {
  // Content wider than the grid cap is drawn as a window around the view
  // centre; the centre only matters in steps, so it is quantised here and a
  // pan within a step reuses the grid.
  const stepX = around ? Math.round(around.x / GRID_WINDOW_STEP) : undefined;
  const stepZ = around ? Math.round(around.z / GRID_WINDOW_STEP) : undefined;
  const workspace = useMemo(
    () =>
      contentWorkspace(
        draft,
        undefined,
        stepX === undefined || stepZ === undefined
          ? undefined
          : { x: stepX * GRID_WINDOW_STEP, z: stepZ * GRID_WINDOW_STEP }
      ),
    [draft, stepX, stepZ]
  );
  return usePresentationWorkspace(workspace)!;
}
