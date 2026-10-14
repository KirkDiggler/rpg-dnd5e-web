import { saveCastMember } from '../../world-building/cast';
import {
  placeRoomMonster,
  validateRoomDocument,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import { createPopulatedStudioDocument } from './studioDocument';

export const SOLDIER = 'dnd5e:npcs:kingdom:soldier-male-01';
export const GUARD = 'dnd5e:monsters:guard';

/** Factions garrison and kitchen, no placements and no cast. */
export function createEmptyCastDocument(): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  document.draft.room.monsterDeclarations = [];
  delete document.draft.room.monsterBindings;
  delete document.scope.scenarios;
  document.scope.factions = [{ id: 'garrison' }, { id: 'kitchen' }];
  return validateRoomDocument(document);
}

export function placeCastMember(
  document: RoomDraftDocument,
  id: string,
  ref: string,
  q: number,
  appearanceRef = SOLDIER
): RoomDraftDocument {
  return {
    ...document,
    draft: placeRoomMonster(document.draft, {
      id,
      ref,
      appearanceRef,
      startingCell: { location: { q, r: 0 } },
    }),
  };
}

/** Guard: a stat block, a recipe with look soldier and faction garrison,
 * and two placements, gate-1 and gate-2. */
export function createGuardCastDocument(): RoomDraftDocument {
  let document = saveCastMember(
    createEmptyCastDocument(),
    {
      ref: GUARD,
      template: { base: 'dnd5e:monsters:human', name: 'Guard' },
      defaults: { name: 'Guard', modelRef: SOLDIER, faction: 'garrison' },
    },
    () => 'guard-recipe'
  );
  document = placeCastMember(document, 'gate-1', GUARD, 0);
  return placeCastMember(document, 'gate-2', GUARD, 1);
}
