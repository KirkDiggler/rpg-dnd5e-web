import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import { refusalJumps } from '../encounter-studio/refusalJump';
import {
  actionAugmentSentences,
  actionRefRefusal,
  moveRef,
  setMonsterActionAugment,
  weaponNoun,
} from './actionAugments';
import { applyCastEdit, castMemberOf } from './cast';
import { setMonsterTemper, withBinding } from './monsterOrderEdits';
import type { MonsterTemplate } from './monsterTemplates';
import { readBackOf } from './readBack';
import type { RoomDraftDocument } from './roomDraft';

const JAVELIN = 'dnd5e:weapons:javelin';
const LONGSWORD = 'dnd5e:weapons:longsword';
const CAPTAIN = 'dnd5e:monsters:guard-captain';

function castle(): { document: RoomDraftDocument; yaml: string } {
  const yaml = readFileSync(
    'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
    'utf8'
  );
  const read = readDraftYaml(yaml);
  if (!read.ok) throw new Error(read.refusal);
  return { document: { draft: read.draft, scope: read.scope }, yaml };
}

/** The template edit the cast form's Apply makes: the stat block as it is,
 * with the staged list on it. */
function withTemplateAugment(
  document: RoomDraftDocument,
  key: 'addActions' | 'dropActions',
  refs: string[] | undefined
): RoomDraftDocument {
  const template = structuredClone(
    castMemberOf(document, CAPTAIN)!.template!
  ) as MonsterTemplate;
  if (refs) template[key] = refs;
  else delete template[key];
  return applyCastEdit(document, { ref: CAPTAIN, template }, () => 'unused');
}

function withCaptainBinding(
  document: RoomDraftDocument,
  key: 'addActions' | 'dropActions',
  refs: string[]
): RoomDraftDocument {
  const room = document.draft.room;
  return {
    ...document,
    draft: {
      ...document.draft,
      room: {
        ...room,
        monsterBindings: withBinding(
          room.monsterBindings,
          'captain',
          setMonsterActionAugment(room.monsterBindings?.captain, key, refs)
        ),
      },
    },
  };
}

type CastleFile = {
  templates: Record<string, Record<string, unknown>>;
  room: { room: { monsterBindings: Record<string, Record<string, unknown>> } };
};

describe('add action and drop action (rpg-project#721)', () => {
  it('a ref the engine grammar refuses is said in its words', () => {
    expect(actionRefRefusal(JAVELIN)).toBeNull();
    expect(actionRefRefusal('dnd5e:spells:fire-bolt')).toBe(
      '"dnd5e:spells:fire-bolt" is not a weapon: an action names a weapon as dnd5e:weapons:<id>'
    );
    expect(actionRefRefusal('javelin')).toBe('"javelin" is not a ref.');
  });

  it('moves one entry and refuses an out-of-range move', () => {
    const refs = [JAVELIN, LONGSWORD, 'dnd5e:weapons:dagger'];
    expect(moveRef(refs, 2, 0)).toEqual([
      'dnd5e:weapons:dagger',
      JAVELIN,
      LONGSWORD,
    ]);
    expect(moveRef(refs, 0, 3)).toBe(refs);
  });

  it('an emptied list drops the key, and the binding when nothing is left', () => {
    expect(
      setMonsterActionAugment({ addActions: [JAVELIN] }, 'addActions', [])
    ).toBeUndefined();
    expect(
      setMonsterActionAugment(
        { temper: 'brave', addActions: [JAVELIN] },
        'addActions',
        []
      )
    ).toEqual({ temper: 'brave' });
  });

  it('another orders edit keeps both lists in authored order', () => {
    // Before #721 normalizeBinding never copied them: a temper erased both.
    const binding = {
      addActions: [JAVELIN, 'dnd5e:weapons:dagger'],
      dropActions: [LONGSWORD],
    };
    expect(setMonsterTemper(binding, 'brave')).toEqual({
      ...binding,
      temper: 'brave',
    });
  });

  it('names a weapon by its ref id with its article', () => {
    expect(weaponNoun('dnd5e:weapons:light_crossbow')).toBe('a light crossbow');
    expect(weaponNoun('dnd5e:weapons:axe')).toBe('an axe');
  });

  it("the castle opens and saves its own bytes' lists unchanged", () => {
    // The castle authors no add or drop; its captain's javelin is in
    // `actions`. Saving it writes neither key.
    const { document } = castle();
    const file = parse(exportDraftYaml(document, 'the-mad-king')) as CastleFile;
    expect(file.templates['guard-captain'].actions).toEqual([
      LONGSWORD,
      JAVELIN,
    ]);
    for (const block of [
      ...Object.values(file.templates),
      ...Object.values(file.room.room.monsterBindings),
    ]) {
      expect(block).not.toHaveProperty('addActions');
      expect(block).not.toHaveProperty('dropActions');
    }
  });

  it('a stat block add and a placement drop survive export and import, in order, and clearing them writes the original bytes', () => {
    const { document } = castle();
    const before = exportDraftYaml(document, 'the-mad-king');
    let edited = withTemplateAugment(document, 'addActions', [
      JAVELIN,
      'dnd5e:weapons:dagger',
    ]);
    edited = withCaptainBinding(edited, 'dropActions', [
      'dnd5e:weapons:dagger',
      LONGSWORD,
    ]);
    const once = exportDraftYaml(edited, 'the-mad-king');
    const file = parse(once) as CastleFile;
    expect(file.templates['guard-captain'].addActions).toEqual([
      JAVELIN,
      'dnd5e:weapons:dagger',
    ]);
    expect(file.room.room.monsterBindings.captain.dropActions).toEqual([
      'dnd5e:weapons:dagger',
      LONGSWORD,
    ]);
    const again = readDraftYaml(once);
    if (!again.ok) throw new Error(again.refusal);
    expect(
      exportDraftYaml({ draft: again.draft, scope: again.scope }, again.key)
    ).toBe(once);

    let cleared = withTemplateAugment(edited, 'addActions', undefined);
    cleared = withCaptainBinding(cleared, 'dropActions', []);
    expect(exportDraftYaml(cleared, 'the-mad-king')).toBe(before);
  });

  it('the Read back says what the captain carries the kind does not, and what he fights with', () => {
    const { document } = castle();
    const added = withTemplateAugment(document, 'addActions', [JAVELIN]);
    expect(actionAugmentSentences(added, 'captain').map((s) => s.text)).toEqual(
      [
        'It carries a javelin the kind does not, from its stat block.',
        'It fights with a longsword, a javelin and a javelin, in that order.',
      ]
    );
    const dropped = withCaptainBinding(added, 'dropActions', [LONGSWORD]);
    const who = readBackOf(dropped, { kind: 'creature', id: 'captain' })[0];
    expect(who.sentences.map((s) => s.text).slice(-3)).toEqual([
      'It carries a javelin the kind does not, from its stat block.',
      'It does not carry a longsword, by its own orders.',
      'It fights with only a javelin and a javelin, in that order.',
    ]);
  });

  it('a creature with no add or drop reads as it did', () => {
    const { document } = castle();
    const who = readBackOf(document, { kind: 'creature', id: 'captain' })[0];
    expect(
      who.sentences.some((s) => /fights with|carr(y|ies) a/.test(s.text))
    ).toBe(false);
  });

  it('with no actions at any layer it says the kind’s weapons, never a guess', () => {
    const { document } = castle();
    const bare = withTemplateAugment(document, 'dropActions', undefined);
    const template = structuredClone(
      castMemberOf(bare, CAPTAIN)!.template!
    ) as MonsterTemplate;
    delete template.actions;
    template.addActions = [JAVELIN];
    template.dropActions = ['dnd5e:weapons:club'];
    const kindOnly = applyCastEdit(
      bare,
      { ref: CAPTAIN, template },
      () => 'unused'
    );
    expect(
      actionAugmentSentences(kindOnly, 'captain').map((s) => s.text)
    ).toEqual([
      'It carries a javelin the kind does not, from its stat block.',
      'It does not carry a club, from its stat block.',
      'It fights with the kind’s weapons less a club, then a javelin.',
    ]);
  });

  it('a drop the known list does not hold states the launch law', () => {
    const { document } = castle();
    const edited = withCaptainBinding(document, 'dropActions', [
      'dnd5e:weapons:dagger',
    ]);
    const who = readBackOf(edited, { kind: 'creature', id: 'captain' })[0];
    const texts = who.sentences.map((s) => s.text);
    expect(texts).toContain(
      'It drops a dagger by its own orders, but it carries none there.'
    );
    expect(who.sentences.find((s) => s.law === 'dropAbsent')?.text).toBe(
      'A dropped action must be in its list at that layer: the session refuses the run at launch when it is not.'
    );
  });

  it("PutDungeon's refusal of a list entry lands on the stat block or the placement (R17)", () => {
    const { document } = castle();
    const jumps = refusalJumps(
      [
        {
          path: 'templates.guard-captain.addActions[0]',
          message:
            '"dnd5e:spells:fire-bolt" is not a weapon: an action names a weapon as dnd5e:weapons:<id>',
        },
        {
          path: 'room.room.monsterBindings.captain.dropActions[1]',
          message: '"x" is not a ref',
        },
      ],
      document
    );
    expect(jumps.map((jump) => jump.target)).toEqual([
      { kind: 'castMember', ref: CAPTAIN },
      { kind: 'creature', id: 'captain' },
    ]);
  });
});
