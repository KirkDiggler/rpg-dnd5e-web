/**
 * A THING DONE TO A PROP (rpg-project#959): each viewer's version, worded
 * from content; the corner tag for a friend's eyes; the narration of a
 * prop's answer; and the refresh each version asks for.
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
  PartySchema,
  PerceivedSchema,
  Sense,
  TableAnswerSchema,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { refreshKeysForAct } from '../actRefreshKeys';
import { buildActStory } from './actStory';
import { formatRollFormula } from './describeAct';

const viewer = 'bard';
const names = { bard: 'Bard', bea: 'Bea', vex: 'Vex' };
const context = { viewerMember: viewer, memberNames: names };
const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });
const grate = create(PartySchema, { kind: PartyKind.PROP, id: 'grate' });

function interact(
  value: Record<string, unknown>,
  { via = [] as string[] } = {}
): Act {
  return create(ActSchema, {
    session: 's',
    id: 'i1',
    act: 'interact:1',
    verb: 'interact',
    family: Family.ACT,
    perceived: via.length
      ? create(PerceivedSchema, { via: via.map(member) })
      : undefined,
    body: { case: 'interact', value },
  } as never);
}

const row = (a: Act) =>
  buildActStory(
    [{ act: a, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  )[0]!;
/** Everything a row says, in any of its parts. */
const said = (a: Act) => {
  const r = row(a);
  return `${r.eyebrow} ${r.headline} ${r.detail} ${r.toastText ?? ''}`;
};

describe('the doer reads their own words', () => {
  it('keyed on the actor being the viewer, never on the words', () => {
    const own = interact({
      actor: member(viewer),
      prop: grate,
      option: 'to-chapel',
      words: 'You lift the grate and take the way up.',
      beaten: true,
    });
    expect(row(own).headline).toBe('You lift the grate and take the way up.');
    // No words authored: the doer still reads their own deed, not a witness's.
    expect(
      row(interact({ actor: member(viewer), prop: grate, option: 'x' }))
        .headline
    ).toBe('You use the grate');
  });

  it('a checked thing carries its roll to the doer', () => {
    const checked = interact({
      actor: member(viewer),
      prop: grate,
      option: 'force',
      words: 'You heave at the grate.',
      skill: 'dnd5e:skills:athletics',
      beaten: false,
      roll: { total: 9, against: 15, beaten: false, dice: [4] },
    });
    const r = row(checked);
    expect(r.headline).toBe('You heave at the grate.');
    expect(r.eyebrow).toContain('Athletics');
    expect(formatRollFormula(checked, context)).toContain('Athletics');
  });
});

describe('a witness reads what they saw', () => {
  it('shown the thing: the actor and the seen words', () => {
    expect(
      row(
        interact({
          actor: member('bea'),
          prop: grate,
          words: 'lifts the grate and climbs in.',
        })
      ).headline
    ).toBe('Bea: lifts the grate and climbs in.');
  });

  it('shown the thing, no words authored: the generic', () => {
    expect(row(interact({ actor: member('bea'), prop: grate })).headline).toBe(
      'Bea uses the grate'
    );
  });

  it('not shown the thing (`place`, no `prop`): never names it', () => {
    const placeOnly = interact({
      actor: member('bea'),
      place: { x: 3, y: 4 },
    });
    expect(row(placeOnly).headline).toBe('Bea does something over there');
    // The thing's id is nowhere in what the row says, toast included.
    expect(said(placeOnly).toLowerCase()).not.toContain('grate');
    // A producer bug that leaked the option to a witness still names nothing.
    const leaked = interact({
      actor: member('bea'),
      place: { x: 3, y: 4 },
      option: 'grate-to-chapel',
      words: '',
    });
    expect(said(leaked).toLowerCase()).not.toContain('grate');
  });

  it('through a friend’s eyes at shared view: the corner tag says so, and the line is third person', () => {
    const seen = interact(
      { actor: member('bea'), prop: grate, words: 'lifts the grate.' },
      { via: ['vex'] }
    );
    expect(row(seen).eyebrow).toBe('Done · through Vex');
    expect(row(seen).headline).toBe('Bea uses the grate');
  });

  it('the doer’s own version shown through the doer (shared view): never their second person as this viewer’s line', () => {
    // What the api sends every friend (rpg-api#1243): the doer's version,
    // `option` and `beaten` set, `perceived.via` = the doer.
    const doers = interact(
      {
        actor: member('bea'),
        prop: grate,
        option: 'to-chapel',
        words: 'You lift the grate and take the way up.',
        beaten: true,
      },
      { via: ['bea'] }
    );
    const r = row(doers);
    expect(r.headline).toBe('Bea uses the grate');
    expect(r.eyebrow).toBe('Done · through Bea');
    expect(said(doers)).not.toContain('You lift');
    // The same version without the mark (a producer that dropped `via`):
    // `option` alone says it is the doer's, so still third person.
    expect(
      row(
        interact({
          actor: member('bea'),
          prop: grate,
          option: 'to-chapel',
          words: 'You lift the grate and take the way up.',
        })
      ).headline
    ).toBe('Bea uses the grate');
  });
});

describe('a prop’s answer is narrated', () => {
  it('as the author wrote it, with no speaker', () => {
    const answer = create(ActSchema, {
      session: 's',
      id: 'n1',
      family: Family.TABLE_ANSWER,
      body: {
        case: 'tableAnswer',
        value: create(TableAnswerSchema, {
          who: grate,
          narration: 'The grate grinds aside.',
        }),
      },
    } as never);
    const r = row(answer);
    expect(r.eyebrow).toBe('Narration');
    expect(r.headline).toBe('The grate grinds aside.');
    expect(said(answer)).not.toContain('the grate:');
  });
});

describe('the refresh each version asks for', () => {
  it('a deed shown through a friend re-reads the atlas: the watcher who came to know the thing sees it drawn', () => {
    expect(
      refreshKeysForAct(
        interact(
          {
            actor: member('bea'),
            prop: grate,
            option: 'to-chapel',
            words: 'You lift the grate and take the way up.',
          },
          { via: ['bea'] }
        ),
        viewer
      )
    ).toEqual(['atlas']);
  });

  it('the doer re-reads their sheet and offers; a witness, offers and sight', () => {
    expect(
      refreshKeysForAct(
        interact({ actor: member(viewer), prop: grate, option: 'x' }),
        viewer
      )
    ).toEqual(['characterData', 'afford']);
    expect(
      refreshKeysForAct(interact({ actor: member('bea'), prop: grate }), viewer)
    ).toEqual(['afford', 'view']);
  });

  it('if you saw it, you know it: the reveal re-reads the atlas (the thing drawn, clickable), the seen deed the offer (its menu)', () => {
    const revealed = create(ActSchema, {
      session: 's',
      id: 'r1',
      family: Family.PERCEPTION,
      body: {
        case: 'perception',
        value: { sense: Sense.REVEAL, observer: member(viewer) },
      },
    } as never);
    const seen = interact({ actor: member('bea'), prop: grate });
    const keys = new Set([
      ...refreshKeysForAct(revealed, viewer),
      ...refreshKeysForAct(seen, viewer),
    ]);
    expect(keys).toEqual(new Set(['atlas', 'doors', 'afford', 'view']));
  });
});
