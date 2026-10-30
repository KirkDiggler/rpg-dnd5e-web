import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  parseRoomDraftJson,
  placeRoomMonster,
  setRoomMonsterDefaultActivity,
  setRoomPartyStart,
  stringifyRoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

const THOUGHTFUL = 'dnd5e:activities:thoughtful';
function fixture() {
  const draft = setRoomPartyStart(
    placeRoomMonster(createRoomDraft(createEmptyScene('scene'), 'room'), {
      id: 'prisoner',
      ref: 'dnd5e:monsters:commoner',
      appearanceRef: 'dnd5e:npcs:prisoner-01',
      startingCell: { location: { q: 1, r: 0 }, facing: 'ne' },
    }),
    { q: 0, r: 0 }
  );
  draft.room.monsterBindings = { prisoner: { faction: 'townsfolk' } };
  return draft;
}

describe('authored default activity', () => {
  it('changes only the optional default and clears it without changing appearance, rules or orders', () => {
    const draft = fixture();
    expect(setRoomMonsterDefaultActivity(draft, 'prisoner', undefined)).toBe(
      draft
    );
    const selected = setRoomMonsterDefaultActivity(
      draft,
      'prisoner',
      THOUGHTFUL
    );
    expect(selected.room.monsterDeclarations[0]).toEqual({
      ...draft.room.monsterDeclarations[0],
      defaultActivityRef: THOUGHTFUL,
    });
    expect(selected.room.monsterBindings).toBe(draft.room.monsterBindings);
    expect(draft.room.monsterDeclarations[0]).not.toHaveProperty(
      'defaultActivityRef'
    );
    expect(
      setRoomMonsterDefaultActivity(selected, 'prisoner', THOUGHTFUL)
    ).toBe(selected);
    const cleared = setRoomMonsterDefaultActivity(
      selected,
      'prisoner',
      undefined
    );
    expect(cleared).toEqual(draft);
    expect(cleared.room.monsterDeclarations[0]).not.toHaveProperty(
      'defaultActivityRef'
    );
    expect(() =>
      setRoomMonsterDefaultActivity(draft, 'missing', THOUGHTFUL)
    ).toThrow(/target/);
  });

  it.each([THOUGHTFUL, 'other:activities:unpublished'])(
    'preserves %s through JSON and v5 YAML without catalog substitution',
    (ref) => {
      const draft = setRoomMonsterDefaultActivity(fixture(), 'prisoner', ref);
      expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
      const source = encodeSingleRoomDungeon({ key: 'activity-test', draft });
      const decoded = decodeSingleRoomDungeon(source);
      expect(decoded.draft.room.monsterDeclarations).toEqual(
        draft.room.monsterDeclarations
      );
      expect(decoded.draft.room.monsterBindings).toEqual(
        draft.room.monsterBindings
      );
    }
  );

  it.each([null, 42, '', 'not-a-ref', ' dnd5e:activities:thoughtful'])(
    'refuses malformed explicit value %s instead of replacing it with absence',
    (invalid) => {
      const draft = fixture();
      Object.assign(draft.room.monsterDeclarations[0], {
        defaultActivityRef: invalid,
      });
      expect(() => parseRoomDraftJson(stringifyRoomDraft(draft))).toThrow(
        /defaultActivityRef/
      );
      if (typeof invalid === 'string') {
        expect(() =>
          setRoomMonsterDefaultActivity(fixture(), 'prisoner', invalid)
        ).toThrow(/defaultActivityRef/);
      }
    }
  );
});
