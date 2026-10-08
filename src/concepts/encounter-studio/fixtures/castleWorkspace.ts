import { createMapLabel } from '../../world-building/mapLabelEdits';
import {
  resizeRoomWorkspace,
  updateWalkableHexes,
  validateRoomDocument,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import { workspaceCells } from '../../world-building/workspaceGeometry';
import { createPopulatedStudioDocument } from './studioDocument';

/** Test/export authority, not a starter map or gameplay-region declaration.
 * Reuse the complete structural/policy fixture and the actual authoring helpers;
 * Kitchen/Courtyard are annotations, never membership or arrangement data. */
export function createCastleWorkspaceDocument(): RoomDraftDocument {
  const document = resizeRoomWorkspace(createPopulatedStudioDocument(), 73, 48);
  let draft = updateWalkableHexes(
    document.draft,
    workspaceCells(document.draft.workspace),
    'paint'
  );
  draft = createMapLabel(draft, 'castle-kitchen', 'Kitchen', { x: -8, z: -6 });
  draft = createMapLabel(draft, 'castle-courtyard', 'Courtyard', {
    x: 8,
    z: 6,
  });
  return validateRoomDocument({ draft, scope: document.scope });
}

/** Capacity is not a promise that all 16384 cells fit the serialization budget.
 * Keep the populated payload and its original sparse floor at maximum bounds. */
export function createSparseMaxWorkspaceDocument(): RoomDraftDocument {
  return resizeRoomWorkspace(createPopulatedStudioDocument(), 128, 128);
}
