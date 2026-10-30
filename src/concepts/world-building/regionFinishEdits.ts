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
  if (!draft.room.regions.some((row) => row.id === regionId))
    throw new Error('Region target no longer exists.');
  const region = {
    id: regionId,
    ...draft.scene.regionPresentation?.[regionId],
  };
  let next: typeof region = { ...region };
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
  const { id: _id, ...presentation } = next;
  void _id;
  const regionPresentation = { ...draft.scene.regionPresentation };
  if (Object.keys(presentation).length > 0)
    regionPresentation[regionId] = presentation;
  else delete regionPresentation[regionId];
  const scene: RoomDraft['scene'] = {
    ...draft.scene,
    version: draft.scene.version >= 6 ? draft.scene.version : (6 as const),
    regionPresentation,
  };
  if (Object.keys(regionPresentation).length === 0)
    delete scene.regionPresentation;
  return { ...draft, scene };
}
