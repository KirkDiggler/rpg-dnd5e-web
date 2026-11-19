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
  shownFeed = feed,
}: {
  shownFeed?: RecordFeedSnapshot;
  selected: string;
  names?: ReadonlyMap<string, string>;
  onPlayInGame?: () => void;
}): React.JSX.Element {
  const run = useRunFold(WATCH, draft, shownFeed);
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

describe('StudioWatch steps as the record ages', () => {
  it('a chosen step stays the same verb when older rows leave the feed', () => {
    // An earlier party walk the feed will drop.
    const older: RecordFeedSnapshot = {
      ...feed,
      rows: [
        row('0', 'move:0', 'moved', {
          member: 'hero',
          position: { x: 1, y: 2 },
        }),
        ...rows,
      ],
    };
    const { rerender } = render(
      <Harness selected="gate-1" shownFeed={older} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    // Chosen: the walk `move:1`, gate-1 alert.
    expect(liveBox()?.getAttribute('data-state')).toBe('alert');
    // The feed drops its oldest row; held by index, the same number would
    // now name the later walk (`challenged`).
    rerender(<Harness selected="gate-1" shownFeed={feed} />);
    expect(liveBox()?.getAttribute('data-state')).toBe('alert');
    expect(screen.queryByTestId('watch-aged-out')).toBeNull();
  });

  it('a chosen step that aged out falls back to the earliest held, and says so', () => {
    const { rerender } = render(<Harness selected="gate-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    rerender(
      <Harness selected="gate-1" shownFeed={{ ...feed, rows: rows.slice(2) }} />
    );
    expect(screen.getByTestId('watch-aged-out').textContent).toContain(
      'no longer in the record'
    );
    expect(screen.getByTestId('watch-step').textContent).toContain('the start');
  });
});

describe('StudioWatch names and the game', () => {
  it('says a creature by its name, its id only when it has none', () => {
    render(
      <Harness selected="gate-1" names={new Map([['gate-1', 'Gate guard']])} />
    );
    expect(
      screen.getByRole('group', { name: 'Creature Gate guard' })
    ).toBeTruthy();
    cleanup();
    render(<Harness selected="gate-1" />);
    expect(screen.getByRole('group', { name: 'Creature gate-1' })).toBeTruthy();
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

describe('StudioWatch: one step from the Layout (rpg-project#1006)', () => {
  function Stepped({
    stepping,
  }: {
    stepping: { busy: boolean; refusal: string | null; fight: boolean };
  }): React.JSX.Element {
    const run = useRunFold(WATCH, draft, feed);
    return (
      <StudioWatch
        watch={WATCH}
        run={run}
        stepping={stepping}
        readBack={null}
        onStop={vi.fn()}
        onPlayInGame={vi.fn()}
      />
    );
  }

  it('a refused step shows the engine’s sentence; no fight line', () => {
    render(
      <Stepped
        stepping={{
          busy: false,
          refusal: 'move destination: cell is not walkable',
          fight: false,
        }}
      />
    );
    expect(screen.getByTestId('watch-step-refusal').textContent).toContain(
      'move destination: cell is not walkable'
    );
    expect(screen.queryByTestId('watch-step-fight')).toBeNull();
  });

  it('a Live refusal is not shown while stepped back in history', () => {
    render(
      <Stepped stepping={{ busy: false, refusal: 'Blocked.', fight: true }} />
    );
    expect(screen.getByTestId('watch-step-refusal')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('watch-step-refusal')).toBeNull();
    expect(screen.queryByTestId('watch-step-fight')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByTestId('watch-step-refusal')).toBeTruthy();
  });

  it('a fight says moves in a fight are made in the game, beside Play in the game', () => {
    render(
      <Stepped
        stepping={{
          busy: false,
          refusal: 'Not your turn — movement is locked.',
          fight: true,
        }}
      />
    );
    expect(screen.getByTestId('watch-step-fight').textContent).toContain(
      'Moves in a fight are made in the game.'
    );
    expect(
      screen.getByRole('button', { name: 'Play in the game' })
    ).toBeTruthy();
  });
});

describe('StudioWatch: what was said and who held the way (rpg-project#1006)', () => {
  const said: RecordRow[] = [
    row('1', 'move:1', 'moved', { member: 'hero', position: { x: 2, y: 2 } }),
    row('2', 'move:1', 'speech', {
      utterance: 'u1',
      speaker: 'gate-1',
      to: 'hero',
      words: 'Easy there, friend.',
      loudness: 'speak',
    }),
    row('3', 'move:2', 'barred', {
      mover: 'hero',
      barrier: 'gate-1',
      door: 'gate',
      verb: 'open',
    }),
    row('4', 'move:2', 'speech', {
      utterance: 'u2',
      speaker: 'gate-2',
      words: 'Halt!',
      loudness: 'shout',
    }),
  ];
  const names = new Map([['gate-1', 'Guard']]);
  function Said(): React.JSX.Element {
    const run = useRunFold(WATCH, draft, { rows: said, notice: undefined });
    return (
      <StudioWatch
        watch={WATCH}
        run={run}
        readBack={null}
        names={names}
        onStop={vi.fn()}
      />
    );
  }
  const lines = () =>
    [...screen.getByTestId('watch-said').querySelectorAll('li')].map(
      (li) => li.textContent
    );

  it('lists every speaker’s lines, newest last, with nothing selected', () => {
    render(<Said />);
    expect(lines()).toEqual([
      'Guard says to hero: “Easy there, friend.”',
      'Gate-2 shouts: “Halt!”',
    ]);
    expect(screen.getByTestId('watch-barred').textContent).toBe(
      'Guard (gate-1) holds this door (open)'
    );
  });

  it('at a past step, only what had been said by then, and that step’s bumps', () => {
    render(<Said />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(lines()).toEqual(['Guard says to hero: “Easy there, friend.”']);
    expect(screen.queryByTestId('watch-barred')).toBeNull();
  });
});

describe('StudioWatch layout (rpg-project#1006)', () => {
  function Panel({
    onResize = vi.fn(),
  }: {
    onResize?: (width: number | null) => void;
  }): React.JSX.Element {
    const run = useRunFold(WATCH, draft, feed);
    if (run.selected !== 'gate-1') run.setSelected('gate-1');
    return (
      <StudioWatch
        watch={WATCH}
        run={run}
        readBack={null}
        names={new Map([['hero', 'Aldric']])}
        onStop={vi.fn()}
        width={600}
        onResize={onResize}
      />
    );
  }

  it('says whose run it is; the run and seat ids wait behind Run details', () => {
    render(<Panel />);
    expect(
      screen.getByRole('heading', { name: 'Watching a run · Aldric' })
    ).toBeTruthy();
    const details = screen.getByTestId(
      'watch-run-details'
    ) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('run-1');
    for (const id of ['watch-said', 'watch-creature', 'watch-trace'])
      expect((screen.getByTestId(id) as HTMLDetailsElement).open).toBe(true);
  });

  it('the panel’s edge resizes it from the keyboard, and a double-click resets it', () => {
    const onResize = vi.fn<(width: number | null) => void>();
    render(<Panel onResize={onResize} />);
    const edge = screen.getByRole('separator', {
      name: 'Resize the watch panel',
    });
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(616);
    fireEvent.doubleClick(edge);
    expect(onResize).toHaveBeenLastCalledWith(null);
  });
});
