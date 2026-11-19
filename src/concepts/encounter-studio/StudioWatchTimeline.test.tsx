/**
 * WATCH A RUN S4's strip (rpg-project#1011): a cell click shows that step
 * and selects that creature; the current step is marked; the changed-only
 * toggle hides quiet creatures. Beats are hand-built in the wire shape.
 */
import type {
  RecordFeedSnapshot,
  RecordRow,
} from '@/components/session/recordFeed';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoomDraft } from '../world-building/roomDraft';
import { useRunFold, type WatchedRun } from './runWatch';
import { StudioWatchTimeline } from './StudioWatchTimeline';

afterEach(cleanup);

const WATCH: WatchedRun = { session: 'run-1', member: 'hero' };
const row = (
  id: string,
  act: string,
  beat: string,
  fields: Record<string, unknown>
): RecordRow => ({ id, at: 1n, act, beat, fields: { beat, ...fields } });

const rows: RecordRow[] = [
  row('1', 'move:1', 'moved', { member: 'hero', position: { x: 1, y: 0 } }),
  row('2', 'time:1', 'answered', {
    creature: 'west',
    word: 'toward',
    selector: 'path',
    key: 'time',
  }),
  row('3', 'move:2', 'moved', { member: 'hero', position: { x: 2, y: 0 } }),
  row('4', 'move:2', 'state', {
    member: 'gate-1',
    from: 'posted',
    to: 'alert',
    reason: 'heard a step',
  }),
  row('5', 'move:3', 'moved', { member: 'hero', position: { x: 3, y: 0 } }),
  row('6', 'move:3', 'moved', { member: 'quiet', position: { x: 9, y: 0 } }),
  row('7', 'move:4', 'moved', { member: 'hero', position: { x: 4, y: 0 } }),
];
const feed: RecordFeedSnapshot = { rows, notice: undefined };
const draft = createRoomDraft(
  { version: 1, id: 'scene', name: 'Watch', items: [], groups: [] },
  'room'
);

let seen: { step: number | null; selected: string | null } = {
  step: null,
  selected: null,
};

function Harness(): React.JSX.Element {
  const run = useRunFold(WATCH, draft, feed);
  seen = { step: run.step, selected: run.selected };
  return <StudioWatchTimeline watch={WATCH} run={run} draft={draft} />;
}

const cell = (member: string, step: number): HTMLElement =>
  screen
    .getAllByTestId('timeline-cell')
    .find(
      (c) => c.dataset.member === member && c.dataset.step === String(step)
    )!;

describe('StudioWatchTimeline', () => {
  it('a cell click shows that step and selects that creature', () => {
    render(<Harness />);
    fireEvent.click(cell('gate-1', 2));
    expect(seen).toEqual({ step: 2, selected: 'gate-1' });
    expect(screen.getByTestId('timeline-now').dataset.step).toBe('2');
    expect(cell('gate-1', 2).getAttribute('aria-current')).toBe('step');
    expect(cell('gate-1', 2).getAttribute('aria-label')).toContain(
      'state alert (changed)'
    );
  });

  it('the last cell is Live; arrows walk the row', () => {
    render(<Harness />);
    fireEvent.click(cell('west', 1));
    fireEvent.keyDown(cell('west', 1), { key: 'ArrowRight' });
    expect(seen.step).toBe(2);
    const last = Number(
      screen.getAllByTestId('timeline-cell').at(-1)!.dataset.step
    );
    fireEvent.click(cell('west', last));
    expect(seen.step).toBeNull();
    expect(screen.getByTestId('timeline-now').dataset.step).toBe(String(last));
  });

  it('draws the state band and the did mark', () => {
    render(<Harness />);
    expect(
      screen.getAllByTestId('timeline-band').map((b) => b.dataset.state)
    ).toContain('alert');
    expect(cell('west', 1).textContent).toBe('toward');
  });

  it('only creatures that changed hides the quiet ones, keeps the party', () => {
    render(<Harness />);
    const members = () =>
      screen.getAllByTestId('timeline-row').map((r) => r.dataset.member);
    expect(members()).toContain('quiet');
    fireEvent.click(screen.getByTestId('timeline-only-changed'));
    expect(members()).not.toContain('quiet');
    expect(members()).toContain('hero');
    expect(members()).toContain('gate-1');
  });
});
