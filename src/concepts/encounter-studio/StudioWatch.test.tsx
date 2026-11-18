/**
 * WATCH A RUN's panel (rpg-project#1004): selecting a creature draws the
 * machine it runs with the state the record says it is in now marked, and
 * its own record entries; the step control rewinds the mark. The machine
 * is the engine's castle read-back (`gate-1` runs `gate-1-policy`); the
 * beats are hand-built in the toolkit's wire shape.
 */
import type {
  RecordFeedSnapshot,
  RecordRow,
} from '@/components/session/recordFeed';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomDraft } from '../world-building/roomDraft';
import { castleMachinesReadBack } from './fixtures/engineReadBack';
import {
  useRunFold,
  WATCH_DEV_ONLY_SENTENCE,
  watchUnavailableReason,
  type WatchedRun,
} from './runWatch';
import { StudioWatch } from './StudioWatch';

afterEach(cleanup);

const WATCH: WatchedRun = { session: 'run-1', member: 'hero' };
const row = (
  id: string,
  act: string,
  beat: string,
  fields: Record<string, unknown>
): RecordRow => ({ id, at: 1n, act, beat, fields: { beat, ...fields } });

const rows: RecordRow[] = [
  row('1', 'move:1', 'moved', { member: 'hero', position: { x: 2, y: 2 } }),
  row('2', 'move:1', 'state', {
    member: 'gate-1',
    from: 'posted',
    to: 'alert',
    reason: 'heard a step',
  }),
  row('3', 'move:2', 'moved', { member: 'hero', position: { x: 6, y: 2 } }),
  row('4', 'time:3', 'state', {
    member: 'gate-1',
    from: 'alert',
    to: 'challenged',
    reason: 'the stranger came close',
  }),
];
const feed: RecordFeedSnapshot = { rows, notice: undefined };
const draft = createRoomDraft(
  { version: 1, id: 'scene', name: 'Watch', items: [], groups: [] },
  'room'
);

function Harness({
  selected,
  names,
  onPlayInGame = vi.fn(),
}: {
  selected: string;
  names?: ReadonlyMap<string, string>;
  onPlayInGame?: () => void;
}): React.JSX.Element {
  const run = useRunFold(WATCH, draft, feed);
  if (run.selected !== selected) run.setSelected(selected);
  return (
    <StudioWatch
      watch={WATCH}
      run={run}
      readBack={castleMachinesReadBack()}
      names={names}
      onStop={vi.fn()}
      onPlayInGame={onPlayInGame}
    />
  );
}

const liveBox = () =>
  document.querySelector('[data-machine="gate-1-policy"] [data-selected]');

describe('StudioWatch', () => {
  it('selecting a creature marks its live state on its machine and shows its trace', () => {
    render(<Harness selected="gate-1" />);
    expect(screen.getByTestId('watch-state').textContent).toBe('challenged');
    expect(liveBox()?.getAttribute('data-state')).toBe('challenged');
    expect(screen.getByText(/the stranger came close/)).toBeTruthy();
    // Its record: the acts holding its own beats; the party's second walk,
    // which names only the party, is not among them.
    const acts = [...document.querySelectorAll('[data-act-key]')].map((li) =>
      li.getAttribute('data-act-key')
    );
    expect(acts).toContain('time:3');
    expect(acts).not.toContain('move:2');
  });

  it('stepping back moves the mark to the earlier state; Live returns', () => {
    render(<Harness selected="gate-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('watch-step').textContent).toContain('step 1');
    expect(liveBox()?.getAttribute('data-state')).toBe('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('watch-step').textContent).toContain('the start');
    expect(liveBox()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(liveBox()?.getAttribute('data-state')).toBe('challenged');
  });
});

describe('StudioWatch names and the game', () => {
  it('says a creature by its name, its id only when it has none', () => {
    render(
      <Harness selected="gate-1" names={new Map([['gate-1', 'Gate guard']])} />
    );
    expect(
      screen.getByRole('region', { name: 'Creature Gate guard' })
    ).toBeTruthy();
    cleanup();
    render(<Harness selected="gate-1" />);
    expect(
      screen.getByRole('region', { name: 'Creature gate-1' })
    ).toBeTruthy();
  });

  it('Play in the game hands this tab to the game for the watched run', () => {
    const onPlayInGame = vi.fn();
    render(<Harness selected="gate-1" onPlayInGame={onPlayInGame} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play in the game' }));
    expect(onPlayInGame).toHaveBeenCalledOnce();
  });
});

describe('watch availability', () => {
  it('is development only, and says why elsewhere', () => {
    expect(watchUnavailableReason('development')).toBeNull();
    expect(watchUnavailableReason('production')).toBe(WATCH_DEV_ONLY_SENTENCE);
  });
});
