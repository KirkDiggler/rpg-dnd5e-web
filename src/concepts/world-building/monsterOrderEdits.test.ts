import { describe, expect, it } from 'vitest';
import {
  addMonsterAction,
  addMonsterAnswerEntry,
  addMonsterCheck,
  addMonsterHold,
  moveMonsterAction,
  normalizeBinding,
  patchMonsterAnswerEntry,
  patchMonsterCheck,
  removeMonsterAction,
  removeMonsterAnswerEntry,
  removeMonsterCheck,
  removeMonsterHold,
  setMonsterArrives,
  setMonsterTemper,
  withBinding,
} from './monsterOrderEdits';
import {
  createRoomDraft,
  parseRoomDraftJson,
  placeRoomMonster,
  stringifyRoomDraft,
  type RoomMonsterBinding,
} from './roomDraft';
import { createEmptyScene } from './sceneState';

const SHORTBOW = 'dnd5e:weapons:shortbow';
const SCIMITAR = 'dnd5e:weapons:scimitar';
const SWORDSWORD = 'dnd5e:weapons:shortsword';

/** The room the slice's own example needs: two goblins, one of which is an
 * archer and one a warrior. */
function roomWithTwoGoblins() {
  const base = createRoomDraft(createEmptyScene('scene-orders'), 'room-orders');
  return placeRoomMonster(
    placeRoomMonster(base, {
      id: 'goblin-1',
      ref: 'dnd5e:monsters:goblin',
      cell: { q: 1, r: 0 },
    }),
    { id: 'goblin-2', ref: 'dnd5e:monsters:goblin', cell: { q: 2, r: 0 } }
  );
}

describe('normalizeBinding — absence is the only empty representation', () => {
  it('drops an empty action list, an empty table and an empty temper', () => {
    expect(
      normalizeBinding({ actions: [], on: {}, temper: '' })
    ).toBeUndefined();
  });

  it('keeps exactly what is authored', () => {
    expect(
      normalizeBinding({ actions: [SCIMITAR], on: {}, temper: '' })
    ).toEqual({ actions: [SCIMITAR] });
  });

  it('a binding with nothing left is undefined, never {}', () => {
    expect(normalizeBinding({})).toBeUndefined();
  });
});

describe('withBinding — the map level, which the caller owns', () => {
  it('sets one creature without disturbing another', () => {
    const map = withBinding(undefined, 'goblin-1', { temper: 'coward' });
    expect(map).toEqual({ 'goblin-1': { temper: 'coward' } });
    expect(withBinding(map, 'goblin-2', { actions: [SWORDSWORD] })).toEqual({
      'goblin-1': { temper: 'coward' },
      'goblin-2': { actions: [SWORDSWORD] },
    });
  });

  it('deletes the entry when its last order is cleared', () => {
    expect(
      withBinding({ 'goblin-1': { temper: 'coward' } }, 'goblin-1', {})
    ).toBeUndefined();
  });

  it('an emptied map becomes undefined, so the key is omitted rather than written as {}', () => {
    expect(withBinding({}, 'goblin-1', undefined)).toBeUndefined();
  });
});

describe('the weapon list — ORDER IS THE POINT', () => {
  it('appends rather than displacing, so the author keeps control of order', () => {
    const binding = addMonsterAction(
      addMonsterAction(undefined, SHORTBOW),
      SCIMITAR
    );
    expect(binding?.actions).toEqual([SHORTBOW, SCIMITAR]);
  });

  it('moves a weapon — the control that authors "draws the scimitar when cornered"', () => {
    const binding: RoomMonsterBinding = { actions: [SHORTBOW, SCIMITAR] };
    expect(moveMonsterAction(binding, 1, 0)?.actions).toEqual([
      SCIMITAR,
      SHORTBOW,
    ]);
    expect(moveMonsterAction(binding, 0, 1)?.actions).toEqual([
      SCIMITAR,
      SHORTBOW,
    ]);
  });

  it('a refused move returns the binding UNTOUCHED, not an emptied creature', () => {
    const binding: RoomMonsterBinding = { actions: [SHORTBOW, SCIMITAR] };
    expect(moveMonsterAction(binding, 0, 0)).toBe(binding);
    expect(moveMonsterAction(binding, 5, 0)).toBe(binding);
    expect(moveMonsterAction(binding, 0, 9)).toBe(binding);
    expect(moveMonsterAction(binding, -1, 0)).toBe(binding);
  });

  it('removing the last weapon drops the key, and the binding with it', () => {
    expect(removeMonsterAction({ actions: [SHORTBOW] }, 0)).toBeUndefined();
  });

  it('removing one of three keeps the order of the rest', () => {
    const binding: RoomMonsterBinding = {
      actions: [SHORTBOW, SCIMITAR, SWORDSWORD],
    };
    expect(removeMonsterAction(binding, 1)?.actions).toEqual([
      SHORTBOW,
      SWORDSWORD,
    ]);
  });

  it('clearing the weapons keeps a temper that is still authored', () => {
    expect(
      removeMonsterAction({ actions: [SHORTBOW], temper: 'coward' }, 0)
    ).toEqual({ temper: 'coward' });
  });
});

describe('temper — ONE word, never a mix', () => {
  it('sets one word and clears back to absence', () => {
    expect(setMonsterTemper(undefined, 'coward')).toEqual({ temper: 'coward' });
    expect(setMonsterTemper({ temper: 'coward' }, undefined)).toBeUndefined();
  });

  it('clearing the temper keeps a weapon list that is still authored', () => {
    expect(
      setMonsterTemper({ actions: [SHORTBOW], temper: 'coward' }, undefined)
    ).toEqual({ actions: [SHORTBOW] });
  });
});

describe("the creature's own table", () => {
  it('adds an entry defaulted from the one vocabulary declaration', () => {
    const binding = addMonsterAnswerEntry(undefined, 'time');
    expect(binding?.on?.time).toHaveLength(1);
  });

  it('drops a trigger when its last entry goes — an empty entry list is never valid', () => {
    expect(
      removeMonsterAnswerEntry({ on: { time: [{ hold: {} }] } }, 'time', 0)
    ).toBeUndefined();
  });

  it('keeps the other triggers when one is emptied', () => {
    const next = removeMonsterAnswerEntry(
      { on: { time: [{ hold: {} }], sunrise: [{ flee: {} }] } },
      'time',
      0
    );
    expect(next?.on?.time).toBeUndefined();
    expect(next?.on?.sunrise).toHaveLength(1);
  });

  it('patches one entry by index, and refuses an out-of-range index', () => {
    const binding: RoomMonsterBinding = {
      on: { time: [{ hold: {} }, { flee: {} }] },
    };
    expect(
      patchMonsterAnswerEntry(binding, 'time', 1, { attack: 'enemy' })?.on
        ?.time?.[1]
    ).toEqual({ attack: 'enemy' });
    expect(patchMonsterAnswerEntry(binding, 'time', 7, {})).toBe(binding);
  });
});

// ---------------------------------------------------------------------------
// The proof that matters: what the editor produces, the encoder ACCEPTS.
// ---------------------------------------------------------------------------

describe('what the panel produces, the encoder accepts', () => {
  it('the state the panel must never write is one the encoder REFUSES', () => {
    // This is why `normalizeBinding` exists rather than being tidiness: an
    // author who empties a weapon list would otherwise publish this and be
    // refused by name.
    const draft = roomWithTwoGoblins();
    (draft.room as unknown as Record<string, unknown>).monsterBindings = {
      'goblin-1': { actions: [] },
    };
    expect(() => stringifyRoomDraft(draft)).toThrow(/actions is empty/);
  });

  it('an authored creature round-trips with its WEAPON ORDER intact', () => {
    const draft = roomWithTwoGoblins();
    let archer: RoomMonsterBinding | undefined;
    archer = addMonsterAction(archer, SHORTBOW);
    archer = addMonsterAction(archer, SCIMITAR);
    archer = setMonsterTemper(archer, 'coward');
    archer = addMonsterAnswerEntry(archer, 'time');
    draft.room.monsterBindings = withBinding(undefined, 'goblin-1', archer);

    const json = stringifyRoomDraft(draft);
    const roundTrip = parseRoomDraftJson(json);
    // The archer's order survives verbatim — it is what the driver reads.
    expect(roundTrip.room.monsterBindings?.['goblin-1'].actions).toEqual([
      SHORTBOW,
      SCIMITAR,
    ]);
    expect(roundTrip.room.monsterBindings?.['goblin-1'].temper).toBe('coward');
    // The warrior overrides nothing, so it has NO entry at all.
    expect(Object.keys(roundTrip.room.monsterBindings ?? {})).toEqual([
      'goblin-1',
    ]);
  });

  it('a creature emptied back to nothing publishes, and leaves no key behind', () => {
    const draft = roomWithTwoGoblins();
    let binding: RoomMonsterBinding | undefined = addMonsterAction(
      undefined,
      SHORTBOW
    );
    draft.room.monsterBindings = withBinding(undefined, 'goblin-1', binding);
    expect(draft.room.monsterBindings).toBeDefined();

    // Remove the only weapon: nothing is authored for this creature any more.
    binding = removeMonsterAction(binding, 0);
    const emptied = withBinding(
      draft.room.monsterBindings,
      'goblin-1',
      binding
    );
    expect(emptied).toBeUndefined();
    if (emptied === undefined) delete draft.room.monsterBindings;
    else draft.room.monsterBindings = emptied;

    const json = stringifyRoomDraft(draft);
    expect(json).not.toContain('monsterBindings');
    expect(() => parseRoomDraftJson(json)).not.toThrow();
  });
});

describe('a creature’s interaction and reserve facts (web#1176)', () => {
  it('adds, patches and removes check routes, and drops the key when the last goes', () => {
    let binding: RoomMonsterBinding | undefined = addMonsterCheck(
      undefined,
      'intimidate',
      { ability: 'intimidation', dc: 12 }
    );
    binding = addMonsterCheck(binding, 'persuade', {
      ability: 'persuasion',
      dc: 10,
    });
    expect(binding).toEqual({
      intimidate: [{ ability: 'intimidation', dc: 12 }],
      persuade: [{ ability: 'persuasion', dc: 10 }],
    });

    // A route carries an optional tool; patching replaces the row whole.
    binding = patchMonsterCheck(binding, 'intimidate', 0, {
      ability: 'strength',
      dc: 15,
      tool: 'dnd5e:items:crowbar',
    });
    expect(binding?.intimidate).toEqual([
      { ability: 'strength', dc: 15, tool: 'dnd5e:items:crowbar' },
    ]);

    // Removing the last intimidate row DELETES the key rather than writing [].
    binding = removeMonsterCheck(binding, 'intimidate', 0);
    expect(binding?.intimidate).toBeUndefined();
    expect(binding?.persuade).toEqual([{ ability: 'persuasion', dc: 10 }]);
    // An out-of-range patch/remove never empties the creature.
    expect(
      patchMonsterCheck(binding, 'persuade', 5, { ability: 'x', dc: 1 })
    ).toBe(binding);
  });

  it('adds and removes held records without duplicating one', () => {
    let binding: RoomMonsterBinding | undefined = addMonsterHold(
      undefined,
      'cellar-lie'
    );
    binding = addMonsterHold(binding, 'vault-map');
    expect(binding?.holds).toEqual(['cellar-lie', 'vault-map']);
    // Holding the same record twice means nothing the second time.
    expect(addMonsterHold(binding, 'cellar-lie')).toBe(binding);
    binding = removeMonsterHold(binding, 'cellar-lie');
    expect(binding?.holds).toEqual(['vault-map']);
    // The last one goes: the key is deleted, not written as an empty list.
    expect(removeMonsterHold(binding, 'vault-map')).toBeUndefined();
  });

  it('sets and clears the reserve predicate that holds a creature out of the run', () => {
    const binding: RoomMonsterBinding | undefined = setMonsterArrives(
      undefined,
      {
        fact: 'cellar-is-clear',
      }
    );
    expect(binding?.arrives).toEqual({ fact: 'cellar-is-clear' });
    // Clearing it returns the creature to the first frame — and with nothing
    // else authored, that is the authored state "none", not an empty block.
    expect(setMonsterArrives(binding, undefined)).toBeUndefined();
    // A reserve on a creature that already has orders keeps them.
    const withOrders = addMonsterAction(undefined, SHORTBOW);
    expect(setMonsterArrives(withOrders, { round: 6 })).toEqual({
      actions: [SHORTBOW],
      arrives: { round: 6 },
    });
  });

  it('a creature emptied back to nothing still publishes, with the new fields too', () => {
    const draft = roomWithTwoGoblins();
    let binding: RoomMonsterBinding | undefined = addMonsterCheck(
      undefined,
      'persuade',
      { ability: 'persuasion', dc: 10 }
    );
    binding = addMonsterHold(binding, 'cellar-lie');
    binding = setMonsterArrives(binding, { fact: 'cellar-is-clear' });
    draft.room.monsterBindings = withBinding(undefined, 'goblin-1', binding);

    // Remove every authored fact, one at a time.
    binding = removeMonsterCheck(binding, 'persuade', 0);
    binding = removeMonsterHold(binding, 'cellar-lie');
    binding = setMonsterArrives(binding, undefined);
    const emptied = withBinding(
      draft.room.monsterBindings,
      'goblin-1',
      binding
    );
    expect(emptied).toBeUndefined();
    if (emptied === undefined) delete draft.room.monsterBindings;
    else draft.room.monsterBindings = emptied;

    const json = stringifyRoomDraft(draft);
    expect(json).not.toContain('monsterBindings');
    expect(() => parseRoomDraftJson(json)).not.toThrow();
  });
});
