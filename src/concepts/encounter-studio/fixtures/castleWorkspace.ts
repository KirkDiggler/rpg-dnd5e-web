import { createMapLabel } from '../../world-building/mapLabelEdits';
import {
  paintCells,
  validateRoomDocument,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import {
  centeredRoomWorkspace,
  workspaceCells,
} from '../../world-building/workspaceGeometry';
import { createPopulatedStudioDocument } from './studioDocument';

/** The 73 × 48 castle rectangle's cells, centred on the origin: the floor the
 * old castle workspace held, now painted into the implicit region (the canvas
 * is unbounded and no workspace is stored, rpg-project#725 R3). */
export function castleRectangleCells() {
  return workspaceCells(centeredRoomWorkspace(73, 48));
}

/** Test/export authority, not a starter map or gameplay-region declaration.
 * Reuse the complete structural/policy fixture and the actual authoring helpers;
 * Kitchen/Courtyard are notes, never membership or arrangement data. */
export function createCastleWorkspaceDocument(): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  let draft = paintCells(document.draft, castleRectangleCells());
  draft = createMapLabel(draft, 'castle-kitchen', 'Kitchen', { x: -8, z: -6 });
  draft = createMapLabel(draft, 'castle-courtyard', 'Courtyard', {
    x: 8,
    z: 6,
  });
  return validateRoomDocument({ draft, scope: document.scope });
}
