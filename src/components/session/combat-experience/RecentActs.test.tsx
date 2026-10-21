import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActStory } from './actStory';
import { RecentActs } from './RecentActs';
import { RECENT_DEFAULT, selectRecent } from './recentSelection';

afterEach(cleanup);
const context = { viewerMember: 'alice' };
const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
type Body = MessageInitShape<typeof ActSchema>['body'];
let n = 0;
const at = (family: Family, body: Body, verb = '') =>
  create(ActSchema, { session: 's', id: `id-${++n}`, family, verb, body });
const loot = (who: string) =>
  at(Family.ACT, {
    case: 'loot',
    value: { by: member(who), from: member('chest') },
  });

function storyOf(...acts: ReturnType<typeof at>[]) {
  return buildActStory(
    acts.map((act) => ({
      act,
      index: 0,
      seq: 1n,
      source: 'live' as const,
      visible: true,
    })),
    context
  );
}

describe('recent panel shows newest 10 by filter', () => {
  const story = storyOf(
    at(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_FORMED },
    }),
    at(
      Family.TABLE_ANSWER,
      { case: 'tableAnswer', value: { who: member('gate-1'), word: 'patrol' } },
      'time'
    ),
    at(
      Family.TABLE_ANSWER,
      { case: 'tableAnswer', value: { who: member('gate-1'), word: 'no' } },
      'speak'
    ),
    ...Array.from({ length: 12 }, (_, i) => loot(`looter-${i}`))
  );

  it('the newest ten that pass the default filter, newest first', () => {
    const recent = selectRecent(story, RECENT_DEFAULT);
    expect(recent).toHaveLength(10);
    expect(recent[0]?.headline).toBe('looter-11 loots chest');
    expect(recent[9]?.headline).toBe('looter-2 loots chest');
  });

  it('defaults keep a speak’s answer and the fight, not a table pick', () => {
    const recent = selectRecent(story, RECENT_DEFAULT, 100);
    const headlines = recent.map((r) => r.headline);
    expect(headlines).toContain('gate-1: no');
    expect(headlines).toContain('A fight begins');
    expect(headlines).not.toContain('gate-1: patrol');
  });

  it('moves are off by default; their chip turns them on', () => {
    const walked = storyOf(
      loot('alice'),
      at(Family.ACT, {
        case: 'walk',
        value: { mover: member('keep-2'), path: [{}, {}] },
      })
    );
    expect(selectRecent(walked, RECENT_DEFAULT).map((r) => r.headline)).toEqual(
      ['alice loots chest']
    );
    render(<RecentActs story={walked} onSelect={vi.fn()} />);
    expect(screen.queryByText(/keep-2 moves/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Moves' }));
    expect(screen.getByText(/keep-2 moves/)).toBeTruthy();
  });

  it('a chip turns a family on, and a click selects that row', () => {
    const onSelect = vi.fn();
    render(<RecentActs story={story.slice(0, 3)} onSelect={onSelect} />);
    expect(screen.queryByText('gate-1: patrol')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table picks' }));
    fireEvent.click(screen.getByText('gate-1: patrol'));
    expect(onSelect).toHaveBeenCalledWith(story[1]!.id);
  });
});
