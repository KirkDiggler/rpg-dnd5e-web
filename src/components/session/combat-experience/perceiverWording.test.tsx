/**
 * Who perceived it, said one way (rpg-project#935, the operator: "character
 * name hears … and if i am that player then it would read 'you hear …'").
 * One function (`perceiverSays`) decides the subject and the verb's person;
 * the log row, the toast and the notice agree because they read the same
 * describer line.
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  Loudness,
  PartyKind,
  PartySchema,
  PerceivedSchema,
  Sense,
  type Act,
  type Party,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { perceiverSays, type PerceptionVerb } from '../sharedVia';
import { buildActStory } from './actStory';
import { speechAtSpeakers } from './speechAtSpeakers';
import { StoryNotices } from './StoryNotices';

afterEach(cleanup);

const viewer = 'tam';
const names = { tam: 'Tam', bea: 'Bea', rin: 'Rin', 'gate-1': 'Gate guard' };
const context = { viewerMember: viewer, memberNames: names };
const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });

function perception(
  observer: string,
  value: Record<string, unknown>,
  via: Party[] = []
): Act {
  return create(ActSchema, {
    session: 's',
    id: `id-${observer}-${Object.keys(value).join('-')}`,
    family: Family.PERCEPTION,
    perceived: via.length ? create(PerceivedSchema, { via }) : undefined,
    body: {
      case: 'perception',
      value: { observer: member(observer), ...value },
    },
  } as never);
}

const headline = (act: Act) =>
  buildActStory(
    [{ act, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  )[0]?.headline;

describe('perceiverSays: each verb in both persons', () => {
  const own = perception(viewer, { sense: Sense.HEARING });
  const beas = perception('bea', { sense: Sense.HEARING }, [member('bea')]);
  const both = perception(viewer, { sense: Sense.HEARING }, [
    member('bea'),
    member('rin'),
  ]);
  const unnamed = perception('stranger', { sense: Sense.HEARING });
  it.each([
    [
      'hear',
      'You hear',
      'Bea hears',
      'Bea and Rin hear',
      'A party member hears',
    ],
    ['see', 'You see', 'Bea sees', 'Bea and Rin see', 'A party member sees'],
    [
      'lose sight of',
      'You lose sight of',
      'Bea loses sight of',
      'Bea and Rin lose sight of',
      'A party member loses sight of',
    ],
    [
      'find',
      'You find',
      'Bea finds',
      'Bea and Rin find',
      'A party member finds',
    ],
    [
      'search',
      'You search',
      'Bea searches',
      'Bea and Rin search',
      'A party member searches',
    ],
  ] as const)('%s', (verb, you, friend, friends, stranger) => {
    const v = verb as PerceptionVerb;
    expect(perceiverSays(own, viewer, names, v)).toBe(you);
    expect(perceiverSays(beas, viewer, names, v)).toBe(friend);
    expect(perceiverSays(both, viewer, names, v)).toBe(friends);
    expect(perceiverSays(unnamed, viewer, names, v)).toBe(stranger);
  });
});

describe('every perception line names who perceived it', () => {
  it('the viewer’s own reads "You …"', () => {
    expect(
      headline(
        perception(viewer, {
          sense: Sense.HEARING,
          heard: { kind: 'clang', hops: 1 },
        })
      )
    ).toBe('You hear metal clanging');
    expect(
      headline(
        perception(viewer, {
          sense: Sense.REVEAL,
          revealed: { concealment: 'hidden-door' },
        })
      )
    ).toBe('You find hidden door');
    expect(headline(perception(viewer, { sense: Sense.DISCOVERY }))).toBe(
      'You search'
    );
  });

  it('a friend’s reads with the friend’s name, without a redundant mark', () => {
    const sighted = perception(
      'bea',
      { sense: Sense.SIGHT, sighted: { gained: ['gate-1'] } },
      [member('bea')]
    );
    const rows = buildActStory(
      [{ act: sighted, index: 0, seq: 1n, source: 'live', visible: true }],
      context
    );
    expect(rows[0]!.headline).toBe('Bea sees Gate guard');
    expect(rows[0]!.detail).toBe('');
    const lost = perception(
      'bea',
      { sense: Sense.SIGHT, sighted: { lost: ['gate-1'] } },
      [member('bea')]
    );
    expect(headline(lost)).toBe('Bea loses sight of Gate guard');
  });
});

describe('the log, the toast and the notice agree', () => {
  it('for the viewer’s own sound', () => {
    const act = perception(viewer, {
      sense: Sense.HEARING,
      heard: { kind: 'clang', hops: 2 },
    });
    const [row] = buildActStory(
      [{ act, index: 0, seq: 1n, source: 'live', visible: true }],
      context
    );
    expect(row!.headline).toBe('You hear metal clanging');
    expect(row!.toastText).toBe('You hear metal clanging — 2 rooms away');
    render(
      <StoryNotices
        entries={[
          {
            ...row!,
            notice: { durationMs: 6000, held: false },
          },
        ]}
      />
    );
    // The notice's headline and its Details headline say the same words.
    expect(screen.getAllByText('You hear metal clanging')).toHaveLength(2);
    expect(
      screen.getAllByText('You hear metal clanging')[1]!.closest('details')
    ).not.toBeNull();
  });
});

describe('spoken lines follow the same rule', () => {
  function line(
    value: Record<string, unknown>,
    senses = [Sense.SIGHT, Sense.HEARING]
  ) {
    return create(ActSchema, {
      session: 's',
      id: `line-${JSON.stringify(value).length}-${Math.random()}`,
      act: 'speak:1',
      verb: 'speak',
      family: Family.ACT,
      perceived: create(PerceivedSchema, { senses }),
      body: {
        case: 'speech',
        value: { place: { x: 0, y: 0 }, ...value },
      },
    } as never);
  }
  const rowOf = (act: Act) =>
    buildActStory([{ act, index: 0, seq: 1n, source: 'live', visible: true }], {
      ...context,
      memberNames: { ...names, aldric: 'Aldric' },
    })[0]!;

  it.each([
    [Loudness.WHISPER, 'You whisper', 'Aldric whispers'],
    [Loudness.SPEAK, 'You say', 'Aldric says'],
    [Loudness.SHOUT, 'You shout', 'Aldric shouts'],
    [Loudness.SCREAM, 'You scream', 'Aldric screams'],
  ] as const)('loudness %s in both persons', (loudness, you, him) => {
    expect(
      rowOf(line({ speaker: member(viewer), words: 'Evening.', loudness }))
        .headline
    ).toBe(`${you}: “Evening.”`);
    expect(
      rowOf(line({ speaker: member('aldric'), words: 'Evening.', loudness }))
        .headline
    ).toBe(`${him}: “Evening.”`);
  });

  it('said to the viewer, to someone else, and to nobody named', () => {
    expect(
      rowOf(
        line({
          speaker: member('aldric'),
          spokenTo: member(viewer),
          words: 'Evening.',
          loudness: Loudness.SPEAK,
        })
      ).headline
    ).toBe('Aldric says to you: “Evening.”');
    expect(
      rowOf(
        line({
          speaker: member('gate-1'),
          spokenTo: member(viewer),
          words: 'Halt!',
          loudness: Loudness.SHOUT,
        })
      ).headline
    ).toBe('Gate guard shouts to you: “Halt!”');
    expect(
      rowOf(
        line({
          speaker: member(viewer),
          spokenTo: member('gate-1'),
          words: 'Evening.',
          loudness: Loudness.SPEAK,
        })
      ).headline
    ).toBe('You say to Gate guard: “Evening.”');
    expect(
      rowOf(
        line({
          speaker: member('aldric'),
          words: 'Hm.',
          loudness: Loudness.SPEAK,
        })
      ).headline
    ).toBe('Aldric says: “Hm.”');
  });

  it('a watched whisper, and "Someone" unchanged', () => {
    expect(
      rowOf(
        line(
          {
            speaker: member(viewer),
            spokenTo: member('gate-1'),
            loudness: Loudness.WHISPER,
          },
          [Sense.SIGHT]
        )
      ).headline
    ).toBe('You whisper to Gate guard');
    expect(
      rowOf(
        line(
          {
            speaker: member('aldric'),
            spokenTo: member(viewer),
            loudness: Loudness.WHISPER,
          },
          [Sense.SIGHT]
        )
      ).headline
    ).toBe('Aldric whispers to you');
    expect(
      rowOf(
        line({ words: 'To arms!', loudness: Loudness.SHOUT, hops: 1 }, [
          Sense.HEARING,
        ])
      ).headline
    ).toBe('Someone shouts: “To arms!”');
  });

  it('the viewer’s own line with a roll; log, toast and Details agree; the bubble keeps only the words', () => {
    const own = line({
      speaker: member(viewer),
      spokenTo: member('gate-1'),
      words: 'We’re the troupe.',
      loudness: Loudness.SPEAK,
      roll: { total: 15, against: 12, beaten: true, expression: '1d20+3' },
      skill: 'performance',
    });
    const row = rowOf(own);
    expect(row.headline).toBe('You say to Gate guard: “We’re the troupe.”');
    expect(row.detail).toBe('performance check, 1d20+3 = 15 vs 12');
    expect(row.toastText).toBe('You say to Gate guard: “We’re the troupe.”');
    render(
      <StoryNotices
        entries={[{ ...row, notice: { durationMs: 6000, held: false } }]}
      />
    );
    expect(
      screen.getByText('You say to Gate guard: “We’re the troupe.”')
    ).toBeInTheDocument();
    expect(speechAtSpeakers([row]).get(viewer)).toBe('We’re the troupe.');
  });
});
