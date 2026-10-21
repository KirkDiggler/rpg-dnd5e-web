import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActStory } from './actStory';
import { StoryLog } from './StoryLog';

afterEach(cleanup);
const props = {
  debug: [],
  mode: 'story' as const,
  streamState: 'live' as const,
  onModeChange: vi.fn(),
};
const context = {
  viewerMember: 'alice',
  memberNames: { alice: 'Alice', 'gate-2': 'Gate Guard' },
};
const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
type Body = MessageInitShape<typeof ActSchema>['body'];
let n = 0;
const at = (family: Family, body: Body) =>
  create(ActSchema, { session: 's', id: `id-${++n}`, family, body });
const walk = (cells: number) =>
  at(Family.ACT, {
    case: 'walk',
    value: {
      mover: member('gate-2'),
      path: Array.from({ length: cells }, () => ({})),
    },
  });
const swing = at(Family.ACT, {
  case: 'attack',
  value: {
    by: member('alice'),
    to: member('gate-2'),
    attack: { name: 'Longsword' },
    outcome: AttackOutcome.HIT,
    roll: { total: 20, against: 13, beaten: true },
  },
});
const story = buildActStory(
  [walk(6), walk(8), swing].map((act) => ({
    act,
    index: 0,
    seq: 1n,
    source: 'live' as const,
    visible: true,
  })),
  context
);

describe('the story log draws log-size forms', () => {
  it('folds the guard’s patrol into one row that expands to its walks', () => {
    render(<StoryLog {...props} story={story} />);
    const fold = screen.getByTestId('story-walk-fold');
    expect(fold.textContent).toContain('Gate Guard walked 14 cells');
    expect(screen.queryAllByText('Gate Guard moves')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /walked 14 cells/ }));
    expect(screen.getAllByText('Gate Guard moves')).toHaveLength(2);
  });

  it('a swing row shows its formula line', () => {
    render(<StoryLog {...props} story={story} />);
    expect(screen.getByText('Longsword 20 vs AC 13 — hit')).toBeTruthy();
  });

  it('the recent panel scrolls the log to the act clicked', () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<StoryLog {...props} story={story} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show recent acts' }));
    const panel = screen.getByTestId('recent-acts');
    fireEvent.click(panel.querySelector(`[data-recent-id="${story[2]!.id}"]`)!);
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(
      document.querySelector(`[data-story-id="${story[2]!.id}"]`)
    );
  });
});
