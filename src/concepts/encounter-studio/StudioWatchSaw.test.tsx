/**
 * WATCH A RUN S6 on screen (rpg-project#1016): "What happened this step"
 * says who now sees whom, folding to a count when many creatures' sight
 * changed; the creature section says who it sees and its other roles; the
 * timeline draws a band per other role and a "sees" mark. A record with
 * neither beat shows none of it. Beats in the engine's wire shape
 * (sightedbeat.go, machine.go appendRoleStateBeat).
 */
import type {
  RecordFeedSnapshot,
  RecordRow,
} from '@/components/session/recordFeed';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomDraft } from '../world-building/roomDraft';
import { useRunFold, type WatchedRun } from './runWatch';
import { StudioWatch } from './StudioWatch';
import { StudioWatchTimeline } from './StudioWatchTimeline';

afterEach(cleanup);

const WATCH: WatchedRun = { session: 'run-1', member: 'hero' };
const row = (
  id: string,
  act: string,
  fields: Record<string, unknown>
): RecordRow => ({
  id,
  at: 1n,
  act,
  beat: String(fields.beat),
  fields,
});
const draft = createRoomDraft(
  { version: 1, id: 'scene', name: 'Watch', items: [], groups: [] },
  'room'
);
const names = new Map([
  ['gate-1', 'Guard'],
  ['hero', 'Toolkit Sandbox Bard'],
]);

const rows: RecordRow[] = [
  row('1', 'move:1', {
    beat: 'moved',
    member: 'hero',
    position: { x: 1, y: 0 },
  }),
  row('2', 'move:1', { beat: 'sighted', observer: 'gate-1', gained: ['hero'] }),
  row('3', 'time:1', {
    beat: 'state',
    member: 'gate-1',
    from: '',
    to: 'ready',
    reason: '',
  }),
  row('4', 'time:1', {
    beat: 'role_state',
    member: 'gate-1',
    role: 'investigate',
    recipe: 'example:behaviors:investigate',
    from: 'idle',
    to: 'active',
    reason: '',
  }),
  row('5', 'move:2', {
    beat: 'moved',
    member: 'hero',
    position: { x: 2, y: 0 },
  }),
  row('6', 'move:2', { beat: 'sighted', observer: 'gate-1', lost: ['hero'] }),
];

function Panel({
  shown,
  selected = 'gate-1',
  notice,
}: {
  shown: readonly RecordRow[];
  selected?: string;
  notice?: string;
}): React.JSX.Element {
  const feed: RecordFeedSnapshot = { rows: [...shown], notice };
  const run = useRunFold(WATCH, draft, feed);
  if (run.selected !== selected) run.setSelected(selected);
  return (
    <>
      <StudioWatch
        watch={WATCH}
        run={run}
        readBack={null}
        names={names}
        onStop={vi.fn()}
      />
      <StudioWatchTimeline
        watch={WATCH}
        run={run}
        draft={draft}
        names={names}
      />
    </>
  );
}

const sightLines = () =>
  screen.queryAllByTestId('watch-sight').map((p) => p.textContent);

describe('what each creature saw', () => {
  it('Live: the last step says the guard no longer sees the bard', () => {
    render(<Panel shown={rows} />);
    expect(sightLines()).toEqual([
      'Guard (gate-1) no longer sees Toolkit Sandbox Bard',
    ]);
    expect(screen.getByTestId('watch-sees').textContent).toBe('Sees: no one');
  });

  it('a step back: the guard now sees the bard, and the creature says so', () => {
    render(<Panel shown={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(sightLines()).toEqual([
      'Guard (gate-1) now sees Toolkit Sandbox Bard',
    ]);
    expect(screen.getByTestId('watch-sees').textContent).toBe(
      'Sees: Toolkit Sandbox Bard'
    );
    expect(screen.getByTestId('watch-sight-step').textContent).toBe(
      'This step: now sees Toolkit Sandbox Bard'
    );
  });

  it('many observers in one step fold to a count with the lines inside', () => {
    const many = [
      ...rows.slice(0, 1),
      ...['a', 'b', 'c', 'd'].map((o, i) =>
        row(`s${i}`, 'move:1', {
          beat: 'sighted',
          observer: o,
          gained: ['hero'],
        })
      ),
    ];
    render(<Panel shown={many} />);
    const folded = screen.getByTestId('watch-sight-many');
    expect(folded.querySelector('summary')!.textContent).toBe(
      'Sight changed for 4 creatures'
    );
    expect(sightLines()).toContain('a now sees Toolkit Sandbox Bard');
  });

  it('the count names only observers whose sight came or went', () => {
    const many = [
      ...rows.slice(0, 1),
      ...['a', 'b', 'c', 'd'].map((o, i) =>
        row(`s${i}`, 'move:1', {
          beat: 'sighted',
          observer: o,
          gained: ['hero'],
        })
      ),
      ...['e', 'f'].map((o, i) =>
        row(`c${i}`, 'move:1', {
          beat: 'sighted',
          observer: o,
          changed: ['hero'],
          knowledge_changed: true,
        })
      ),
    ];
    render(<Panel shown={many} />);
    expect(
      screen.getByTestId('watch-sight-many').querySelector('summary')!
        .textContent
    ).toBe('Sight changed for 4 creatures');
  });

  it.each([
    ['a capture window', 'Capture window: earlier history is not implied.'],
    [
      'a saved run missing its start',
      'Capture incomplete: the server no longer held the run’s start.',
    ],
  ])(
    'with %s, Sees says it is from the steps the record holds',
    (_, notice) => {
      render(<Panel shown={rows} notice={notice} />);
      expect(screen.getByTestId('watch-sees').textContent).toBe(
        'Sees, from the steps the record holds: no one'
      );
    }
  );

  it('the timeline marks the observer’s cell “sees”, with the full text', () => {
    render(<Panel shown={rows} />);
    const cell = screen
      .getAllByTestId('timeline-cell')
      .find((c) => c.dataset.member === 'gate-1' && c.dataset.step === '1')!;
    expect(cell.textContent).toContain('sees');
    expect(cell.getAttribute('aria-label')).toContain(
      'sight: now sees Toolkit Sandbox Bard'
    );
  });
});

describe('a second role’s state', () => {
  it('the header and the section say both; the timeline draws a band', () => {
    render(<Panel shown={rows} />);
    expect(screen.getByTestId('watch-state').textContent).toBe(
      'ready · investigate: active'
    );
    expect(screen.getByTestId('watch-role').textContent).toContain(
      'investigate'
    );
    const band = screen.getByTestId('timeline-role-band');
    expect(band.dataset.role).toBe('investigate');
    expect(band.dataset.state).toBe('active');
    expect(band.dataset.edge).toBe('true');
  });
});

describe('a record with neither beat', () => {
  it('shows no sight, no role and no role band', () => {
    const plain = rows.filter(
      (r) => r.beat !== 'sighted' && r.beat !== 'role_state'
    );
    render(<Panel shown={plain} />);
    expect(screen.queryByTestId('watch-sight')).toBeNull();
    expect(screen.queryByTestId('watch-sight-many')).toBeNull();
    expect(screen.queryByTestId('watch-sees')).toBeNull();
    expect(screen.queryByTestId('watch-role')).toBeNull();
    expect(screen.queryByTestId('timeline-role-band')).toBeNull();
    expect(screen.getByTestId('watch-state').textContent).toBe('ready');
    for (const c of screen.getAllByTestId('timeline-cell'))
      expect(c.textContent).not.toContain('sees');
  });
});
