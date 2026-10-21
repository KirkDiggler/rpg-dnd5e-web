import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildActAttackOutcome, buildActStory } from './actStory';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import { StoryLog } from './StoryLog';

const context = { viewerMember: 'aldric', memberNames: { aldric: 'Aldric' } };
const props = {
  debug: [],
  mode: 'story' as const,
  streamState: 'live' as const,
  onModeChange: vi.fn(),
};

describe('roll breakdown from Roll', () => {
  it.each([true, false])(
    'shows the act’s own dice and named modifiers in the result card and the row, hit=%s',
    (hit) => {
      const { act } = createAttackAuthorityFixture({
        hit,
        roll: 16,
        total: 22,
      });
      if (act.body.case !== 'attack') throw Error('expected attack');
      act.body.value.roll!.modifiers = [
        {
          $typeName: 'dnd5e.api.session.v1alpha2.RollModifier',
          source: 'Mace',
          value: 4,
        },
        {
          $typeName: 'dnd5e.api.session.v1alpha2.RollModifier',
          source: 'Bless',
          value: 2,
        },
      ];
      const fact = {
        act,
        index: 0,
        seq: 1n,
        source: 'live' as const,
        visible: true,
      };
      const breakdown = `[16] + 4 Mace + 2 Bless = 22 vs 13 · ${hit ? 'beaten' : 'not beaten'}`;
      const story = buildActStory([fact], context);
      const result = buildActAttackOutcome(fact, context);
      const { rerender } = render(
        <StoryLog {...props} story={story} result={result} />
      );
      expect(
        screen.getByText(`${breakdown} · ${hit ? 'Hit' : 'Miss'}`)
      ).toBeTruthy();
      // The latest result replaces its matching story row, without duplicating it.
      expect(screen.getByRole('log').querySelectorAll('article')).toHaveLength(
        1
      );
      rerender(<StoryLog {...props} story={story} result={undefined} />);
      expect(screen.getByTestId('story-roll-breakdown').textContent).toBe(
        breakdown
      );
    }
  );

  it('shows the total alone when the act carries no faces', () => {
    const { act } = createAttackAuthorityFixture({ roll: 10, total: 18 });
    if (act.body.case !== 'attack') throw Error('expected attack');
    act.body.value.roll!.dice = [];
    act.body.value.roll!.against = undefined;
    act.body.value.roll!.beaten = undefined;
    render(
      <StoryLog
        {...props}
        story={[]}
        result={buildActAttackOutcome({ act, index: 0, seq: 1n }, context)}
      />
    );
    expect(screen.getByText('18 · Hit')).toBeTruthy();
  });
});

describe('rows group by act id', () => {
  const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
  const row = (id: string, tag: string, family: Family, body: never) => ({
    act: create(ActSchema, { session: 's', id, act: tag, family, body }),
    index: 0,
    seq: 1n,
    source: 'live' as const,
    visible: true,
  });

  it('failed line answer groups under speak', () => {
    const story = buildActStory(
      [
        row('id-1', 'speak:id-1', Family.ACT, {
          case: 'speak',
          value: {
            by: member('aldric'),
            to: member('gate'),
            line: 'Stand aside.',
          },
        } as never),
        {
          ...row('id-1', 'speak:id-1', Family.TABLE_ANSWER, {
            case: 'tableAnswer',
            value: { who: member('gate'), word: 'refuse', say: 'No.' },
          } as never),
          index: 1,
        },
      ],
      context
    );
    expect(story.map((e) => [e.headline, e.nested])).toEqual([
      ['Aldric to gate: "Stand aside."', false],
      ['gate: "No."', true],
    ]);
    render(<StoryLog {...props} story={story} />);
    expect(
      screen.getByText('gate: "No."').closest('article')?.dataset.nested
    ).toBe('true');
  });

  it('rest state entries group under rest', () => {
    const story = buildActStory(
      [
        row('id-5', 'rest:id-5', Family.ACT, {
          case: 'rest',
          value: {
            by: member('aldric'),
            kind: 'short',
            hitPointsRestored: 4,
            hitPoints: 10,
            hitDiceSpent: 1,
          },
        } as never),
        {
          ...row('id-5', 'rest:id-5', Family.STATE, {
            case: 'state',
            value: {
              party: member('aldric'),
              change: StateKind.CONCENTRATION_ENDED,
              concentration: { spell: { name: 'Bless' }, reason: 'rest' },
            },
          } as never),
          index: 1,
        },
        row('id-6', 'move:id-6', Family.ACT, {
          case: 'walk',
          value: { mover: member('aldric'), path: [] },
        } as never),
      ],
      context
    );
    expect(story.map((e) => e.nested)).toEqual([false, true, false]);
    expect(story[1]?.headline).toBe('Aldric stops concentrating on Bless');
  });
});
