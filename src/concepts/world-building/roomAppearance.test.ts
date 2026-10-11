import { describe, expect, it } from 'vitest';
import {
  arrangeFields,
  arrangeIntent,
} from '../encounter-studio/StudioArrangeFields';
import {
  createRoomDraft,
  parseRoomDraftJson,
  placeRoomMonster,
  setRoomMonsterAppearance,
  setRoomPartyStart,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { applyStudioActorArrange, projectStudioArrange } from './studioArrange';

const LOOK = 'dnd5e:npcs:kingdom:merchant-01';
function fixture(): RoomDraft {
  return setRoomPartyStart(
    placeRoomMonster(createRoomDraft(createEmptyScene('scene'), 'room'), {
      id: 'merchant',
      ref: 'dnd5e:monsters:bandit',
      startingCell: { location: { q: 1, r: 0 }, facing: 'ne' },
    }),
    { q: 0, r: 0 }
  );
}

describe('authored actor appearance', () => {
  it('changes only appearance and clears the optional key without manufacturing an override', () => {
    const draft = fixture();
    draft.room.monsterBindings = { merchant: { faction: 'townsfolk' } };
    expect(setRoomMonsterAppearance(draft, 'merchant', undefined)).toBe(draft);
    const selected = setRoomMonsterAppearance(draft, 'merchant', LOOK);
    expect(selected.room.monsterDeclarations[0]).toEqual({
      ...draft.room.monsterDeclarations[0],
      appearanceRef: LOOK,
    });
    expect(selected.room.monsterBindings).toBe(draft.room.monsterBindings);
    expect(setRoomMonsterAppearance(selected, 'merchant', LOOK)).toBe(selected);
    const cleared = setRoomMonsterAppearance(selected, 'merchant', undefined);
    expect(cleared).toEqual(draft);
    expect(cleared.room.monsterDeclarations[0]).not.toHaveProperty(
      'appearanceRef'
    );
    expect(() => setRoomMonsterAppearance(draft, 'missing', LOOK)).toThrow(
      /target/
    );
  });

  it('preserves exact known and unknown valid refs through local JSON and authored YAML', () => {
    for (const ref of [LOOK, 'another:npcs:future:body']) {
      const draft = setRoomMonsterAppearance(fixture(), 'merchant', ref);
      expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
      const source = encodeSingleRoomDungeon({ key: 'appearance-test', draft });
      const decoded = decodeSingleRoomDungeon(source);
      expect(decoded.draft.room.monsterDeclarations[0].appearanceRef).toBe(ref);
      expect(decoded.draft.room.monsterDeclarations[0].ref).toBe(
        'dnd5e:monsters:bandit'
      );
    }
  });

  it('refuses malformed explicit choices instead of treating them as absence', () => {
    for (const invalid of [
      '',
      'not-a-ref',
      'dnd5e:npcs:kingdom:',
      ' dnd5e:npcs:kingdom:merchant-01',
    ]) {
      expect(() =>
        setRoomMonsterAppearance(fixture(), 'merchant', invalid)
      ).toThrow(/appearanceRef/);
    }
    for (const invalid of [null, 42, '']) {
      const draft = fixture();
      Object.assign(draft.room.monsterDeclarations[0], {
        appearanceRef: invalid,
      });
      expect(() => parseRoomDraftJson(stringifyRoomDraft(draft))).toThrow(
        /appearanceRef/
      );
    }
  });

  it('stages appearance in the same atomic Arrange edit as location and facing', () => {
    const draft = fixture();
    const selection = projectStudioArrange({
      draft,
      target: { kind: 'actor', id: 'merchant' },
      selectionRevision: 1,
    })!;
    expect(
      arrangeFields(selection, ['n', 'ne'])
        .find((field) => field.key === 'appearanceRef')
        ?.choices?.some((choice) => choice.value === LOOK)
    ).toBe(true);
    const intent = arrangeIntent(selection, {
      appearanceRef: LOOK,
      q: '2',
      facing: 'n',
    })!;
    expect(intent.kind).toBe('actor-start');
    if (intent.kind !== 'actor-start') throw new Error('wrong intent');
    const result = applyStudioActorArrange(draft, intent);
    expect(result.room.monsterDeclarations[0]).toEqual({
      id: 'merchant',
      ref: 'dnd5e:monsters:bandit',
      appearanceRef: LOOK,
      startingCell: { location: { q: 2, r: 0 }, facing: 'n' },
    });
    expect(draft.room.monsterDeclarations[0]).not.toHaveProperty(
      'appearanceRef'
    );
    expect(applyStudioActorArrange(result, intent)).toBe(result);
  });
});
