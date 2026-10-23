import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildActStory } from './actStory';
import { JustHappenedPreview } from './JustHappenedPreview';
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps the row to what/who, shows weapon/outcome on focus and sends the original row id to history', async () => {
  const attack = create(ActSchema, {
    session: 's',
    id: 'attack-1',
    family: Family.ACT,
    verb: 'attack',
    body: {
      case: 'attack',
      value: {
        by: { kind: PartyKind.MEMBER, id: 'guard' },
        to: { kind: PartyKind.MEMBER, id: 'player' },
        attack: { name: 'Longsword', ref: 'dnd5e:weapons:longsword' },
        outcome: AttackOutcome.MISS,
      },
    },
  });
  const story = buildActStory(
    [{ act: attack, index: 0, seq: 1n, source: 'live', visible: true }],
    {
      viewerMember: 'player',
      memberNames: { guard: 'Skeleton guard', player: 'Aldric' },
    }
  );
  const select = vi.fn();
  render(<JustHappenedPreview story={story} onSelect={select} />);
  const row = within(
    screen.getByRole('region', { name: 'Recent outcomes' })
  ).getByRole('button');
  expect(within(row).getByRole('img', { name: 'Miss' })).toBeInTheDocument();
  expect(row).toHaveTextContent(/^Skeleton guard$/);
  expect(row).not.toHaveTextContent('Longsword');
  act(() => row.focus());
  const summary = await screen.findByRole('tooltip');
  expect(summary).toHaveTextContent('Longsword');
  expect(summary).toHaveTextContent('Aldric');
  expect(summary).toHaveTextContent('miss');
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(row);
  expect(select).toHaveBeenCalledWith(story[0]!.id);
});
