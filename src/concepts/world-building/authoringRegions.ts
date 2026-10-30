import {
  validateRoomWallFinish,
  type RoomWallFinish,
} from './regionFinishTypes';
import { objectShape, rejectUnknownKeys } from './strictShape';
import type { RoomHexCell } from './workspaceGeometry';

/**
 * A REGION'S LOOK, kept beside the scene as props keep `scene.items` beside
 * `room.propDeclarations` (rpg-project#725 G4). Keyed by the region's id under
 * `scene.regionPresentation`; the region itself — id, name, lighting, cells —
 * is gameplay and lives in `room.room.regions`.
 *
 * `construction` is the author's construction (the rectangles or polygons a
 * tool drew), CARRIED VERBATIM AND UNREAD until the studio decides its schema
 * (design O2). When construction and runs disagree the runs win.
 */
export interface RegionPresentation {
  wallFinish?: RoomWallFinish;
  construction?: unknown;
}
export type RegionPresentations = Record<string, RegionPresentation>;

/**
 * Every region resolves to the cells it lists (rpg-project#725): there is no
 * automatic boundary, witness or polygon any more, so a region is resolved
 * exactly when it owns a cell and `empty` when it is declared and unpainted.
 */
export type RegionResolution =
  | {
      id: string;
      status: 'resolved';
      area: { kind: 'hex-union'; cells: RoomHexCell[] };
    }
  | { id: string; status: 'unresolved'; reason: 'empty' };

/** Only the shape; that every key names a listed region is `validateDraft`'s
 * question, where the regions are in hand. `wallFinish` keeps its scene
 * version 6 gate. */
export function validateRegionPresentation(
  value: unknown,
  options: { allowWallFinish: boolean }
): RegionPresentations {
  const source = objectShape(value, 'scene.regionPresentation');
  const out: RegionPresentations = {};
  for (const [id, entry] of Object.entries(source)) {
    const path = `scene.regionPresentation.${id}`;
    const input = objectShape(entry, path);
    rejectUnknownKeys(
      input,
      [...(options.allowWallFinish ? ['wallFinish'] : []), 'construction'],
      path
    );
    const presentation: RegionPresentation = {};
    if (Object.hasOwn(input, 'wallFinish'))
      presentation.wallFinish = validateRoomWallFinish(
        input.wallFinish,
        `${path}.wallFinish`
      );
    if (Object.hasOwn(input, 'construction'))
      presentation.construction = structuredClone(input.construction);
    if (Object.keys(presentation).length === 0)
      throw new Error(`${path}: declares nothing; omit the entry instead.`);
    out[id] = presentation;
  }
  return out;
}
