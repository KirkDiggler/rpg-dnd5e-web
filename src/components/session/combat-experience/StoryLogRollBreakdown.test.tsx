import { create } from '@bufbuild/protobuf';
import { RollCalculationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import { buildCombatAttackOutcome, buildCombatStory } from './story';
import { StoryLog } from './StoryLog';

const context = { viewerMember: 'aldric', memberNames: { aldric: 'Aldric' } };

describe('combat log attack calculation', () => {
  it.each([true, false])(
    'preserves sourced dice in latest and historical cards, hit=%s',
    (hit) => {
      const { event } = createAttackAuthorityFixture({
        hit,
        roll: 16,
        total: 22,
      });
      if (event.body.case !== 'struck' && event.body.case !== 'missed')
        throw Error('expected attack');
      event.body.value.calculation = create(RollCalculationSchema, {
        total: 22,
        components: [
          {
            source: { name: 'Mace' },
            dice: { notation: '1d20', finalRolls: [16] },
          },
          { source: { name: 'Mace' }, modifier: 4 },
          {
            source: { name: 'Bless', sourceId: 'aldric' },
            dice: { notation: '1d4', finalRolls: [3] },
          },
          {
            source: { name: 'Bane' },
            subtractDice: true,
            dice: { notation: '1d4', finalRolls: [1] },
          },
        ],
      });
      const story = buildCombatStory(
        [{ event, source: 'live', visible: true }],
        context
      );
      const result = buildCombatAttackOutcome(event, context);
      const props = {
        story,
        result,
        debug: [],
        mode: 'story' as const,
        streamState: 'live' as const,
        onModeChange: vi.fn(),
      };
      const { rerender } = render(<StoryLog {...props} />);
      const arithmetic =
        '1d20 [16] Mace + 4 Mace + 1d4 [3] Bless (Aldric) - 1d4 [1] Bane = 22';
      expect(
        screen.getByText(`${arithmetic} · ${hit ? 'Hit' : 'Miss'}`)
      ).toBeTruthy();
      expect(screen.queryByText(/d20 16 \+ 6/)).toBeNull();
      // The latest result replaces its matching Story entry, without duplicating it.
      expect(screen.getByRole('log').querySelectorAll('article')).toHaveLength(
        1
      );
      // Also cover the live result arriving before the Story entry.
      rerender(<StoryLog {...props} story={[]} />);
      expect(
        screen.getByText(`${arithmetic} · ${hit ? 'Hit' : 'Miss'}`)
      ).toBeTruthy();
      rerender(
        <StoryLog
          {...props}
          result={undefined}
          story={buildCombatStory(
            [{ event, source: 'catchup', visible: true }],
            context
          )}
        />
      );
      expect(
        screen.getByText(`${arithmetic} · ${hit ? 'Hit' : 'Miss'}`, {
          exact: false,
        })
      ).toBeTruthy();
    }
  );

  it.each(['absent', 'empty'] as const)(
    'retains legacy totals for %s calculations',
    (kind) => {
      const { event } = createAttackAuthorityFixture({ roll: 10, total: 18 });
      if (event.body.case !== 'struck') throw Error('expected hit');
      if (kind === 'empty')
        event.body.value.calculation = create(RollCalculationSchema, {
          total: 18,
        });
      render(
        <StoryLog
          story={[]}
          result={buildCombatAttackOutcome(event, context)}
          debug={[]}
          mode="story"
          streamState="live"
          onModeChange={vi.fn()}
        />
      );
      expect(screen.getByText('d20 10 + 8 = 18 · Hit')).toBeTruthy();
    }
  );
});
