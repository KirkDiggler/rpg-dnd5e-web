import {
  EventKind,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebugCombatLog } from './DebugCombatLog';

function fakeEvent(seq: bigint, member: string): Event {
  return {
    session: 'enc-1',
    seq,
    at: seq * 10n,
    correlation: '',
    recipient: 'char-1',
    kind: EventKind.MOVED,
    payload: new Uint8Array(),
    body: { case: 'moved', value: { member, to: { x: 0, y: 0 } } },
  } as Event;
}

const names = new Map([['char-1', 'Toolkit Sandbox Fighter']]);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('DebugCombatLog', () => {
  it('renders "No events yet." with an empty buffer, in the default Debug mode', () => {
    render(
      <DebugCombatLog
        events={[]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    expect(
      screen
        .getByTestId('debug-combat-log-mode-debug')
        .getAttribute('aria-pressed')
    ).toBe('true');
    screen.getByText('No events yet.');
  });

  it('lines append in arrival order as the events prop grows', () => {
    const { rerender } = render(
      <DebugCombatLog
        events={[fakeEvent(1n, 'char-1')]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    let lines = screen.getAllByTestId('debug-combat-log-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain('seq=1');

    rerender(
      <DebugCombatLog
        events={[fakeEvent(1n, 'char-1'), fakeEvent(2n, 'char-1')]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    lines = screen.getAllByTestId('debug-combat-log-line');
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('seq=1');
    expect(lines[1].textContent).toContain('seq=2');

    rerender(
      <DebugCombatLog
        events={[
          fakeEvent(1n, 'char-1'),
          fakeEvent(2n, 'char-1'),
          fakeEvent(3n, 'char-1'),
        ]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    lines = screen.getAllByTestId('debug-combat-log-line');
    expect(lines.map((el) => el.textContent?.slice(0, 5))).toEqual([
      'seq=1',
      'seq=2',
      'seq=3',
    ]);
  });

  it('resolves names and puts the raw id on hover via the title attribute', () => {
    render(
      <DebugCombatLog
        events={[fakeEvent(5n, 'char-1')]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    const line = screen.getByTestId('debug-combat-log-line');
    expect(line.textContent).toContain('Toolkit Sandbox Fighter');
    expect(line.textContent).not.toContain('char-1');
    expect(line.getAttribute('title')).toBe('char-1');
  });

  it('shows the PR #779 stream state in the header, styled only when not live', () => {
    const { rerender } = render(
      <DebugCombatLog
        events={[]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    screen.getByText('live');

    rerender(
      <DebugCombatLog
        events={[]}
        streamState="reconnecting"
        names={names}
        storyLine={null}
      />
    );
    screen.getByText('reconnecting…');

    rerender(
      <DebugCombatLog
        events={[]}
        streamState="resyncing"
        names={names}
        storyLine={null}
      />
    );
    screen.getByText('resyncing…');
  });

  it("Debug is the default mode; Story mode shows only today's beat line, not the feed", () => {
    render(
      <DebugCombatLog
        events={[fakeEvent(1n, 'char-1')]}
        streamState="live"
        names={names}
        storyLine="Skeleton hits you — 20 vs AC 14, 8 piercing."
      />
    );
    expect(screen.queryByTestId('debug-combat-log-story')).toBeNull();
    screen.getByTestId('debug-combat-log-feed');

    fireEvent.click(screen.getByTestId('debug-combat-log-mode-story'));

    expect(screen.queryByTestId('debug-combat-log-feed')).toBeNull();
    const story = screen.getByTestId('debug-combat-log-story');
    within(story).getByText('Skeleton hits you — 20 vs AC 14, 8 piercing.');
  });

  it('persists the mode choice across mounts (localStorage)', () => {
    const { unmount } = render(
      <DebugCombatLog
        events={[]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    fireEvent.click(screen.getByTestId('debug-combat-log-mode-story'));
    unmount();

    render(
      <DebugCombatLog
        events={[]}
        streamState="live"
        names={names}
        storyLine={null}
      />
    );
    expect(
      screen
        .getByTestId('debug-combat-log-mode-story')
        .getAttribute('aria-pressed')
    ).toBe('true');
    screen.getByTestId('debug-combat-log-story');
  });
});
