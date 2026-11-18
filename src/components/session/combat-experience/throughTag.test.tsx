/**
 * The through-mark lives in the notice's corner tag (rpg-project#935): the
 * operator's two toasts, where the friend is named in the sentence, still
 * say the viewer's own character did not perceive them.
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
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildActStory } from './actStory';
import { StoryNotices } from './StoryNotices';

afterEach(cleanup);

const viewer = 'bard';
const names = {
  bard: 'Bard',
  barbarian: 'Barbarian',
  rin: 'Rin',
  commoner: 'Commoner',
};
const context = { viewerMember: viewer, memberNames: names };
const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });

function act(
  body: Record<string, unknown>,
  via: string[],
  family = Family.ACT
): Act {
  return create(ActSchema, {
    session: 's',
    id: `id-${Math.random()}`,
    act: 'speak:1',
    verb: 'speak',
    family,
    perceived: create(PerceivedSchema, {
      senses: [Sense.SIGHT, Sense.HEARING],
      via: via.map(member),
    }),
    body,
  } as never);
}

/** The notice as it renders: its corner tag, its sentence and its outcome. */
function notice(a: Act) {
  const [row] = buildActStory(
    [{ act: a, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  );
  const { container } = render(
    <StoryNotices
      entries={[{ ...row!, notice: { durationMs: 6000, held: false } }]}
    />
  );
  const article = container.querySelector('article')!;
  return {
    tag: article.querySelector('header [data-part="tag"]')!.textContent,
    sentence: article.querySelector('header + p')!.textContent,
    text: article.textContent ?? '',
  };
}

const speech = (value: Record<string, unknown>) => ({
  case: 'speech',
  value: { loudness: Loudness.SPEAK, place: { x: 0, y: 0 }, ...value },
});

describe('the corner tag carries the through-mark', () => {
  it('the friend is the speaker', () => {
    const shown = notice(
      act(
        speech({
          speaker: member('barbarian'),
          spokenTo: member('commoner'),
          words: 'Oi! Pedlar!',
          loudness: Loudness.SHOUT,
        }),
        ['barbarian']
      )
    );
    expect(shown.tag).toBe('Speech · through Barbarian');
    expect(shown.sentence).toBe('Barbarian shouts to Commoner: “Oi! Pedlar!”');
    expect(shown.text).not.toMatch(/— through/);
  });

  it('the friend is the one spoken to', () => {
    const shown = notice(
      act(
        speech({
          speaker: member('commoner'),
          spokenTo: member('barbarian'),
          words: 'Nothing for you.',
        }),
        ['barbarian']
      )
    );
    expect(shown.tag).toBe('Speech · through Barbarian');
    expect(shown.sentence).toBe(
      'Commoner says to Barbarian: “Nothing for you.”'
    );
  });

  it('"Someone shouts" through two friends: the tag, and no tail', () => {
    const shown = notice(
      act(speech({ words: 'To arms!', loudness: Loudness.SHOUT, hops: 1 }), [
        'barbarian',
        'rin',
      ])
    );
    expect(shown.tag).toBe('Speech · through Barbarian and Rin');
    expect(shown.sentence).toBe('Someone shouts: “To arms!”');
    expect(shown.text).not.toMatch(/— through/);
  });

  it('the viewer’s own has the plain tag', () => {
    const shown = notice(
      act(speech({ speaker: member('commoner'), words: 'Evening.' }), [])
    );
    expect(shown.tag).toBe('Speech');
  });

  it('a friend’s perception notice shows it too', () => {
    const shown = notice(
      act(
        {
          case: 'perception',
          value: {
            observer: member('barbarian'),
            sense: Sense.HEARING,
            heard: { kind: 'clang', hops: 1 },
          },
        },
        ['barbarian'],
        Family.PERCEPTION
      )
    );
    expect(shown.tag).toMatch(/ · through Barbarian$/);
    expect(shown.sentence).toBe('Barbarian hears metal clanging');
  });
});
