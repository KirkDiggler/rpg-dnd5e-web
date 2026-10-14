import { describe, expect, it } from 'vitest';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import {
  adoptCastMember,
  CastMemberInUse,
  castOf,
  removeCastMember,
  renameCastMember,
  saveCastMember,
} from './cast';
import { validateCreaturePalette } from './creaturePalette';
import {
  placeRoomMonster,
  validateRoomDocument,
  type RoomDraftDocument,
} from './roomDraft';

const SOLDIER = 'dnd5e:npcs:kingdom:soldier-male-01';
const GUARD = 'dnd5e:monsters:guard';
let ids = 0;
const idFactory = (): string => `id-${(ids += 1)}`;

/** A document with factions garrison and kitchen and no placements. */
function emptyCast(): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  document.draft.room.monsterDeclarations = [];
  delete document.draft.room.monsterBindings;
  delete document.scope.scenarios;
  document.scope.factions = [{ id: 'garrison' }, { id: 'kitchen' }];
  return validateRoomDocument(document);
}

function place(
  document: RoomDraftDocument,
  id: string,
  ref: string,
  q: number
): RoomDraftDocument {
  return {
    ...document,
    draft: placeRoomMonster(document.draft, {
      id,
      ref,
      appearanceRef: SOLDIER,
      startingCell: { location: { q, r: 0 } },
    }),
  };
}

/** Guard: a template, a recipe on it with faction garrison, two placements. */
function guardCast(): RoomDraftDocument {
  let document = saveCastMember(
    emptyCast(),
    {
      ref: GUARD,
      template: { base: 'dnd5e:monsters:human', name: 'Guard' },
      defaults: { name: 'Guard', modelRef: SOLDIER, faction: 'garrison' },
    },
    idFactory
  );
  document = place(document, 'gate-1', GUARD, 0);
  return place(document, 'gate-2', GUARD, 1);
}

describe('the cast', () => {
  it('a template, a recipe on it and two placements are one member', () => {
    const document = guardCast();
    const cast = castOf(document);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toMatchObject({
      ref: GUARD,
      id: 'guard',
      source: 'template',
      name: 'Guard',
      placements: ['gate-1', 'gate-2'],
      defaults: { ref: GUARD, modelRef: SOLDIER, faction: 'garrison' },
      unusedDefaults: [],
      shadowsRulebook: false,
    });
    expect(validateRoomDocument(document)).toEqual(document);
  });

  it('a placement of a rulebook monster with no recipe is a rulebook member with no defaults', () => {
    const document = place(emptyCast(), 'goblin-1', 'dnd5e:monsters:goblin', 0);
    const [goblin] = castOf(document);
    expect(goblin).toMatchObject({
      ref: 'dnd5e:monsters:goblin',
      source: 'rulebook',
      name: 'Goblin',
      placements: ['goblin-1'],
    });
    expect(goblin).not.toHaveProperty('defaults');
    expect(goblin).not.toHaveProperty('template');
  });

  it('two recipes on one ref: the first is the defaults and the second is an unused look', () => {
    const document = emptyCast();
    document.draft.scene = {
      ...document.draft.scene,
      creaturePalette: [
        {
          id: 'a',
          name: 'Goblin',
          ref: 'dnd5e:monsters:goblin',
          modelRef: SOLDIER,
        },
        {
          id: 'b',
          name: 'Goblin too',
          ref: 'dnd5e:monsters:goblin',
          modelRef: SOLDIER,
        },
      ],
    };
    const [goblin] = castOf(document);
    expect(goblin.defaults?.id).toBe('a');
    expect(goblin.unusedDefaults.map((entry) => entry.id)).toEqual(['b']);
  });

  it("a recipe's faction round-trips through validateCreaturePalette", () => {
    const entry = {
      id: 'a',
      name: 'Guard',
      ref: GUARD,
      modelRef: SOLDIER,
      faction: 'garrison',
    };
    expect(validateCreaturePalette([entry])).toEqual([entry]);
    expect(() => validateCreaturePalette([{ ...entry, faction: '' }])).toThrow(
      /faction must be nonblank/
    );
    const document = guardCast();
    expect(
      validateRoomDocument(document).draft.scene.creaturePalette?.[0]?.faction
    ).toBe('garrison');
  });

  it('a default faction naming no faction is refused', () => {
    expect(() =>
      saveCastMember(
        guardCast(),
        {
          ref: GUARD,
          defaults: { name: 'Guard', modelRef: SOLDIER, faction: 'cellar' },
        },
        idFactory
      )
    ).toThrow('Default faction cellar is not a faction in this encounter.');
  });

  it('a template id equal to a rulebook monster id saves and is marked as shadowing', () => {
    const document = saveCastMember(
      emptyCast(),
      {
        ref: 'dnd5e:monsters:goblin',
        template: { base: 'dnd5e:monsters:human' },
      },
      idFactory
    );
    expect(document.scope.templates).toHaveProperty('goblin');
    expect(castOf(document)[0]).toMatchObject({
      source: 'template',
      shadowsRulebook: true,
    });
    expect(validateRoomDocument(document)).toEqual(document);
  });

  it('rename rewrites the template key, both placements and the recipe', () => {
    const document = renameCastMember(guardCast(), GUARD, 'gate-guard');
    expect(Object.keys(document.scope.templates ?? {})).toEqual(['gate-guard']);
    expect(
      document.draft.room.monsterDeclarations.map((monster) => monster.ref)
    ).toEqual(['dnd5e:monsters:gate-guard', 'dnd5e:monsters:gate-guard']);
    expect(
      document.draft.scene.creaturePalette?.map((entry) => entry.ref)
    ).toEqual(['dnd5e:monsters:gate-guard']);
    expect(castOf(document)[0]).toMatchObject({
      id: 'gate-guard',
      placements: ['gate-1', 'gate-2'],
    });
    expect(validateRoomDocument(document)).toEqual(document);
  });

  it('rename refuses an existing template id', () => {
    const document = saveCastMember(
      guardCast(),
      {
        ref: 'dnd5e:monsters:cook',
        template: { base: 'dnd5e:monsters:human' },
      },
      idFactory
    );
    expect(() => renameCastMember(document, GUARD, 'cook')).toThrow(
      'templates.cook: a stat block with this id exists'
    );
    expect(() => renameCastMember(document, GUARD, 'two words')).toThrow(
      'templates.two words: id must be one reference segment'
    );
  });

  it('rename refuses a rulebook member', () => {
    const document = place(emptyCast(), 'goblin-1', 'dnd5e:monsters:goblin', 0);
    expect(() =>
      renameCastMember(document, 'dnd5e:monsters:goblin', 'raider')
    ).toThrow(
      "A rulebook monster's id is its kind. Give it a stat block to rename it."
    );
  });

  it('adopt gives a rulebook member a template and moves its placements', () => {
    let document = place(emptyCast(), 'goblin-1', 'dnd5e:monsters:goblin', 0);
    document = place(document, 'goblin-2', 'dnd5e:monsters:goblin', 1);
    document = adoptCastMember(document, 'dnd5e:monsters:goblin', 'raider');
    expect(document.scope.templates?.raider).toEqual({
      base: 'dnd5e:monsters:goblin',
    });
    expect(
      document.draft.room.monsterDeclarations.map((monster) => monster.ref)
    ).toEqual(['dnd5e:monsters:raider', 'dnd5e:monsters:raider']);
    const cast = castOf(document);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toMatchObject({
      source: 'template',
      placements: ['goblin-1', 'goblin-2'],
    });
    expect(validateRoomDocument(document)).toEqual(document);
  });

  it('remove with placements throws CastMemberInUse naming them', () => {
    const attempt = (): unknown => removeCastMember(guardCast(), GUARD);
    expect(attempt).toThrow(CastMemberInUse);
    expect(attempt).toThrow(
      'Guard has 2 placements: gate-1, gate-2. Remove them from the map or change their cast member first.'
    );
  });

  it('remove without placements deletes the template and its recipes', () => {
    const document = guardCast();
    document.draft.room.monsterDeclarations = [];
    const removed = removeCastMember(document, GUARD);
    expect(removed.scope).not.toHaveProperty('templates');
    expect(removed.draft.scene).not.toHaveProperty('creaturePalette');
    expect(castOf(removed)).toEqual([]);
  });

  it('castOf keeps template key order, then rulebook refs by first mention', () => {
    let document = saveCastMember(
      emptyCast(),
      {
        ref: 'dnd5e:monsters:zeta',
        template: { base: 'dnd5e:monsters:human' },
      },
      idFactory
    );
    document = saveCastMember(
      document,
      {
        ref: 'dnd5e:monsters:alpha',
        template: { base: 'dnd5e:monsters:human' },
      },
      idFactory
    );
    document = place(document, 'bone-1', 'dnd5e:monsters:skeleton', 0);
    document = place(document, 'alpha-1', 'dnd5e:monsters:alpha', 1);
    document = place(document, 'goblin-1', 'dnd5e:monsters:goblin', 2);
    document = place(document, 'bone-2', 'dnd5e:monsters:skeleton', 3);
    expect(castOf(document).map((member) => member.id)).toEqual([
      'zeta',
      'alpha',
      'skeleton',
      'goblin',
    ]);
  });
});
