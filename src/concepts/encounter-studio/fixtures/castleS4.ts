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
import { createCastleReadBackDocument } from './castleReadBack';

/** The keep with the read-back castle's scope and bindings: the S4 walk's
 * seed. Lists are joined and maps merged, so the keep's own goblins, intel
 * and site nouns stay beside the castle's. The read-back's purse is placed
 * in the kitchen, and the ledger and purse are declared, because their
 * bindings need a footprint. */
export function createCastleWalkDocument(): RoomDraftDocument {
  const keep = createCastleKeepDocument();
  const castle = createCastleReadBackDocument();
  const draft = structuredClone(keep.draft);
  const ledger = draft.scene.items.find((item) => item.id === 'ledger')!;
  draft.scene.items.push({
    ...structuredClone(ledger),
    id: 'purse',
    assetRef: 'dnd5e:props:fantasy-kingdom:bag_explorer_01',
    label: 'Purse',
    transform: { ...ledger.transform, x: ledger.transform.x + 1.5 },
  });
  for (const id of ['ledger', 'purse'])
    draft.room.propDeclarations[id] = structuredClone(
      castle.draft.room.propDeclarations[id]!
    );
  draft.room.monsterBindings = {
    ...draft.room.monsterBindings,
    ...structuredClone(castle.draft.room.monsterBindings),
  };
  draft.room.propBindings = {
    ...draft.room.propBindings,
    ...structuredClone(castle.draft.room.propBindings),
  };
  const a = keep.scope;
  const b = structuredClone(castle.scope);
  return validateRoomDocument({
    draft,
    scope: {
      ...a,
      templates: { ...a.templates, ...b.templates },
      tables: { ...a.tables, ...b.tables },
      factions: [...(a.factions ?? []), ...(b.factions ?? [])],
      dispositions: [...(a.dispositions ?? []), ...(b.dispositions ?? [])],
      intel: [...(a.intel ?? []), ...(b.intel ?? [])],
    },
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
    exits: [...(document.scope.exits ?? []), { id: 'postern', cell: at(40) }],
    endings: [
      ...(document.scope.endings ?? []),
      { id: 'king-slain', when: { down: 'captain' } },
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
    ],
    concealments: {
      ...document.scope.concealments,
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
