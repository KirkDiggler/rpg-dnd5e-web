/**
 * THE CASTLE FOR S4 (rpg-project#578). The walk seed is the keep's geometry
 * (rooms, walls with doors, the cast placed, the altar and the ledger) with
 * the read-back castle's scope (tables, factions, dispositions, intel). The
 * S4 document adds what the walk authors: two endings, the stash
 * concealment, a locked door it hides, and the postern exit.
 */
import {
  validateRoomDocument,
  type RoomDraftDocument,
  type RoomHexCell,
} from '../../world-building/roomDraft';
import { createCastleKeepDocument } from './castleKeep';
import { CASTLE_SCOPE } from './castleReadBack';

/** The keep with the read-back castle's scope: the S4 walk's seed. */
export function createCastleWalkDocument(): RoomDraftDocument {
  const keep = createCastleKeepDocument();
  return validateRoomDocument({
    draft: keep.draft,
    scope: { ...keep.scope, ...structuredClone(CASTLE_SCOPE) },
  });
}

/** The walk's additions, authored as the walk authors them. */
export function createCastleS4Document(): RoomDraftDocument {
  const document = createCastleWalkDocument();
  const floor = document.draft.room.walkableHexes;
  const at = (index: number): RoomHexCell => ({ ...floor[index]! });
  const door = 'gate-wall-door';
  document.draft.room.doorBindings = {
    ...document.draft.room.doorBindings,
    [door]: { locked: [{ ability: 'dex', dc: 15, tool: 'thieves-tools' }] },
  };
  document.scope = {
    ...document.scope,
    exits: [{ id: 'postern', cell: at(40) }],
    endings: [
      { id: 'king-slain', when: { down: 'captain' } },
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
    ],
    concealments: {
      stash: {
        notice: [{ ability: 'perception', dc: 12 }],
        checks: [{ ability: 'investigation', dc: 14 }],
        cells: [at(100), at(101)],
        props: ['altar', door],
      },
    },
  };
  return validateRoomDocument(document);
}
