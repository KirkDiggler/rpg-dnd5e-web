import { RECENT_IDENTITY_SAMPLES } from '@/concepts/desktop-hotbar/recentStoryFixtures';
import { clone, create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  Family,
  Loudness,
  PartyKind,
  Sense,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryNoticeContent } from './StoryNoticeContent';
import { StoryNotices } from './StoryNotices';
const hit = () => ({
  ...RECENT_IDENTITY_SAMPLES[3]!,
  act: clone(ActSchema, RECENT_IDENTITY_SAMPLES[3]!.act!),
});
afterEach(cleanup);
describe('damage-first toast', () => {
  it('puts applied damage ahead of separate accuracy and bonus details', () => {
    const entry = hit();
    if (entry.act?.body.case === 'attack') {
      entry.act.body.value.damageComponents[1]!.roll!.modifiers[0]!.source =
        'Ability';
      entry.act.body.value.damageComponents[1]!.roll!.modifiers[0]!.sourceRef =
        'dnd5e:abilities:str';
    }
    render(<StoryNoticeContent entry={entry} />);
    expect(screen.getByRole('heading', { name: '9 Damage' })).toBeVisible();
    expect(screen.getByText(/piercing · Critical hit/)).toBeVisible();
    expect(
      screen.getByRole('group', { name: 'Attack roll' })
    ).toHaveTextContent('24');
    expect(
      screen.getByRole('group', { name: 'Damage bonus · STR' })
    ).toHaveTextContent('+2');
  });
  it.each([0, 12])(
    'renders authoritative applied damage %i without summing rolls',
    (amount) => {
      const entry = hit();
      if (entry.act.body.case === 'attack')
        entry.act.body.value.damage = amount;
      render(<StoryNoticeContent entry={entry} />);
      expect(
        screen.getByRole('heading', { name: `${amount} Damage` })
      ).toBeVisible();
    }
  );
  it('does not invent damage on a miss', () => {
    const entry = hit();
    if (entry.act.body.case === 'attack') {
      entry.act.body.value.outcome = AttackOutcome.MISS;
      entry.act.body.value.critical = false;
      entry.act.body.value.damageComponents = [];
    }
    render(<StoryNoticeContent entry={entry} />);
    expect(screen.getByRole('heading', { name: 'Miss' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Damage/ })).toBeNull();
  });
  it('does not present refused attack data as a hit', () => {
    const entry = hit();
    entry.act.refused = true;
    render(<StoryNoticeContent entry={entry} />);
    expect(screen.queryByRole('heading', { name: '9 Damage' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Attack roll' })).toBeNull();
  });
  it('uses the existing incoming tone and keeps the newest notice first', () => {
    const outgoing = hit();
    const incoming = RECENT_IDENTITY_SAMPLES[4]!;
    const notice = { held: true, durationMs: 5000 };
    const { container } = render(
      <StoryNotices
        entries={[
          { ...outgoing, notice },
          { ...incoming, notice },
        ]}
      />
    );
    const heading = screen.getByRole('heading', { name: '3 Damage' });
    expect(heading.closest('article')).toHaveAttribute('data-tone', 'danger');
    expect(container.querySelector('article')).toContainElement(heading);
    expect(heading.closest('article')).toHaveAttribute(
      'data-priority',
      'primary'
    );
  });
  it('labels a ward without inventing a source or attack roll', () => {
    const entry = hit();
    if (entry.act.body.case === 'attack') {
      entry.act.body.value.outcome = AttackOutcome.WARDED;
      entry.act.body.value.damageComponents = [];
      entry.act.body.value.roll = undefined;
    }
    render(<StoryNoticeContent entry={entry} />);
    expect(screen.getByRole('heading', { name: 'Warded' })).toBeVisible();
    expect(screen.getByText('Ward source: Not supplied')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Attack roll' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Ward save' })).toHaveTextContent(
      'Not supplied'
    );
  });
  it('keeps missing breakdown explicit', () => {
    const entry = hit();
    if (entry.act.body.case === 'attack')
      entry.act.body.value.damageComponents = [];
    render(<StoryNoticeContent entry={entry} />);
    expect(
      screen.getByRole('group', { name: 'Damage roll' })
    ).toHaveTextContent('Not supplied');
  });
  it('shows an individual supplied healing amount including zero', () => {
    const entry = {
      ...hit(),
      act: create(ActSchema, {
        family: Family.ACT,
        body: {
          case: 'activate',
          value: {
            by: { kind: PartyKind.MEMBER, id: 'aldric' },
            ability: { name: 'Healing' },
            results: [
              {
                kind: 'healed',
                amount: 0,
                target: { kind: PartyKind.MEMBER, id: 'aldric' },
              },
            ],
          },
        },
      }),
    };
    render(<StoryNoticeContent entry={entry} />);
    expect(screen.getByRole('heading', { name: '0 Healing' })).toBeVisible();
  });
});

describe('a notice’s Details are never empty (rpg-dnd5e-web#1416)', () => {
  const context = { viewerMember: 'barb', memberNames: { bard: 'Bree' } };
  const row = (act: ReturnType<typeof create<typeof ActSchema>>) => ({
    id: 'n1',
    eyebrow: '',
    headline: '',
    detail: '',
    tone: 'neutral' as const,
    act,
    describeContext: context,
  });

  it('a voice heard through a wall says what was and was not perceived', () => {
    const voice = create(ActSchema, {
      session: 's',
      id: 'r1',
      family: Family.ACT,
      perceived: { senses: [Sense.HEARING] },
      body: {
        case: 'speech',
        value: {
          utterance: 'u957',
          loudness: Loudness.SPEAK,
          hops: 1,
          place: { x: 0, y: 14 },
        },
      },
    });
    render(<StoryNoticeContent entry={row(voice)} showDescription={false} />);
    const facts = screen.getByTestId('speech-facts');
    expect(facts).toHaveTextContent('PerceivedHeard, not seen');
    expect(facts).toHaveTextContent('SpeakerNot seen');
    expect(facts).toHaveTextContent('Said toNot named');
    expect(facts).toHaveTextContent('WordsNot caught');
    expect(facts).toHaveTextContent('LoudnessSpoken');
    expect(facts).toHaveTextContent('From1 room away');
  });

  it('a shout caught keeps its words in Details', () => {
    const shout = create(ActSchema, {
      session: 's',
      id: 'r2',
      family: Family.ACT,
      perceived: { senses: [Sense.HEARING] },
      body: {
        case: 'speech',
        value: {
          utterance: 'u952',
          words: 'Oi! Pedlar!',
          loudness: Loudness.SHOUT,
          hops: 1,
          place: { x: -2, y: 14 },
        },
      },
    });
    render(<StoryNoticeContent entry={row(shout)} showDescription={false} />);
    expect(screen.getByTestId('speech-facts')).toHaveTextContent(
      'Words“Oi! Pedlar!”'
    );
  });

  it('an act with no amount and no roll shows its own line rather than nothing', () => {
    const heard = create(ActSchema, {
      session: 's',
      id: 'r3',
      family: Family.PERCEPTION,
      body: {
        case: 'perception',
        value: {
          observer: { kind: PartyKind.MEMBER, id: 'barb' },
          sense: Sense.HEARING,
          heard: { kind: 'voice', hops: 1 },
        },
      },
    });
    const { container } = render(
      <StoryNoticeContent entry={row(heard)} showDescription={false} />
    );
    expect(container.textContent).toContain('1 room away');
    expect(container.textContent).not.toContain('cell');
  });
});
