import { projectRegionWallBoundaries } from './regionBoundaryGeometry';
import {
  validateRoomWallFinish,
  type RegionWallFinishPatch,
} from './regionFinishTypes';
import {
  defaultPatternStart,
  resolvePatternStart,
} from './regionSurfaceBoundary';
import type { RoomDraft } from './roomDraft';

/** A document edit, not a catalog lookup. The UI offers verified refs; unavailable
 * saved refs remain editable and are reported by the presentation projection. */
export function setRegionWallFinish(
  draft: RoomDraft,
  regionId: string,
  patch: RegionWallFinishPatch | null
): RoomDraft {
  const region = draft.scene.authoringRegions?.find(
    (row) => row.id === regionId
  );
  if (!region) throw new Error('Region target no longer exists.');
  let next = { ...region };
  if (patch === null) {
    if (!region.wallFinish) return draft;
    delete next.wallFinish;
  } else {
    const boundary = projectRegionWallBoundaries(draft).find(
      (row) => row.id === regionId
    )!;
    if (boundary.status !== 'resolved')
      throw new Error(`Wall-bound region required: ${boundary.reason}.`);
    const reference = patch.patternStart ?? region.wallFinish?.patternStart;
    const anchor = reference
      ? resolvePatternStart(boundary, reference)
      : defaultPatternStart(boundary);
    if (anchor.status !== 'resolved')
      throw new Error(`Choose a new pattern start: ${anchor.reason}.`);
    const wallFinish = validateRoomWallFinish({
      materialRef: patch.materialRef ?? region.wallFinish?.materialRef,
      patternStart: anchor.reference,
    });
    if (JSON.stringify(wallFinish) === JSON.stringify(region.wallFinish))
      return draft;
    next = { ...region, wallFinish };
  }
  return {
    ...draft,
    scene: {
      ...draft.scene,
      version: draft.scene.version >= 6 ? draft.scene.version : 6,
      authoringRegions: draft.scene.authoringRegions!.map((row) =>
        row.id === regionId ? next : row
      ),
    },
  };
}
