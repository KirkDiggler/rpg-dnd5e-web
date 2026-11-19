/**
 * Save this run, Stop watching's offer to save, and a saved run opened
 * read-only (rpg-project#1013), on the watch panel and its two hooks.
 */
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import { create } from '@bufbuild/protobuf';
import { ReadBackSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { RecordEventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import { GetRecordResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomDraft, type RoomDraft } from '../world-building/roomDraft';
import { castleMachinesReadBack } from './fixtures/engineReadBack';
import { machinesRunBy, useRunFold, type WatchedRun } from './runWatch';
import {
  openSavedRun,
  SAVED_RUN_FORMAT,
  savedRunText,
  snapshotOf,
} from './savedRun';
import { StudioWatch, type WatchSave } from './StudioWatch';
import {
  NO_SNAPSHOT_NOTE,
  useSavedRunReplay,
  useWatchSave,
} from './useSavedRun';

afterEach(cleanup);

const WATCH: WatchedRun = { session: 'run-1', member: 'hero' };
const encoder = new TextEncoder();
const event = (n: number, beat: string, fields: Record<string, unknown>) =>
  create(RecordEventSchema, {
    id: String(n).padStart(4, '0'),
    at: BigInt(n),
    act: n === 1 ? '' : `move:${n}`,
    beat,
    fieldsJson: encoder.encode(JSON.stringify({ beat, ...fields })),
  });
const EVENTS = [
  event(1, 'joined', { kind: 'player', member: 'hero' }),
  event(2, 'moved', { member: 'hero', position: { x: 2, y: 2 } }),
];

function draftWith(cell: { q: number; r: number }): RoomDraft {
  const draft = createRoomDraft(
    { version: 1, id: 'scene', name: 'Gate', items: [], groups: [] },
    'room'
  );
  return {
    ...draft,
    room: {
      ...draft.room,
      monsterDeclarations: [
        {
          id: 'gate-1',
          ref: 'monster:guard',
          startingCell: { location: cell },
        },
      ],
    },
  };
}
const SAVED_DRAFT = draftWith({ q: 4, r: 2 });
const NAMES = new Map([['gate-1', 'North guard']]);
const SAVED_TEXT = savedRunText(
  {
    format: SAVED_RUN_FORMAT,
    savedAt: '2026-11-19T14:00:00.000Z',
    session: 'run-1',
    member: 'hero',
    memberName: 'Ana',
    dungeon: { key: 'the-mad-king', name: 'The mad king' },
    snapshot: snapshotOf({
      draft: SAVED_DRAFT,
      names: NAMES,
      readBack: castleMachinesReadBack(),
    }),
  },
  { events: EVENTS, complete: true }
);
/** A beat the server sent with no raw fields. */
const BARE = create(RecordEventSchema, {
  id: '0003',
  at: 3n,
  act: 'move:3',
  beat: 'moved',
});
const RAW_TEXT = SAVED_TEXT.split('\n').slice(1).join('\n');

const feed: RecordFeedSnapshot = {
  rows: openSavedRun('f', SAVED_TEXT).capture.feed.rows,
  notice: undefined,
};

function Panel({
  save,
  onStop,
}: {
  save: WatchSave;
  onStop: () => void;
}): React.JSX.Element {
  const run = useRunFold(WATCH, SAVED_DRAFT, feed);
  return (
    <StudioWatch
      watch={WATCH}
      run={run}
      readBack={null}
      onStop={onStop}
      save={save}
    />
  );
}

const button = (name: string) => screen.getByRole('button', { name });

describe('Stop watching offers to save first (rpg-project#1013)', () => {
  const save = (over: Partial<WatchSave> = {}): WatchSave => ({
    onSave: vi.fn(async () => true),
    saving: false,
    error: null,
    unsaved: true,
    ...over,
  });

  it('an unsaved run asks before it stops; Stop without saving stops without saving', () => {
    const s = save();
    const onStop = vi.fn();
    render(<Panel save={s} onStop={onStop} />);
    fireEvent.click(button('Stop watching'));
    expect(onStop).not.toHaveBeenCalled();
    screen.getByTestId('watch-stop-choice');
    fireEvent.click(button('Stop without saving'));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(s.onSave).not.toHaveBeenCalled();
  });

  it('Cancel neither saves nor stops', () => {
    const s = save();
    const onStop = vi.fn();
    render(<Panel save={s} onStop={onStop} />);
    fireEvent.click(button('Stop watching'));
    fireEvent.click(button('Cancel'));
    expect(onStop).not.toHaveBeenCalled();
    expect(s.onSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('watch-stop-choice')).toBeNull();
  });

  it('Save and stop saves, then stops', async () => {
    const order: string[] = [];
    const s = save({
      onSave: vi.fn(async () => {
        order.push('save');
        return true;
      }),
    });
    render(<Panel save={s} onStop={() => order.push('stop')} />);
    fireEvent.click(button('Stop watching'));
    fireEvent.click(button('Save and stop'));
    await waitFor(() => expect(order).toEqual(['save', 'stop']));
  });

  it('a save that fails does not stop', async () => {
    const s = save({ onSave: vi.fn(async () => false) });
    const onStop = vi.fn();
    render(<Panel save={s} onStop={onStop} />);
    fireEvent.click(button('Stop watching'));
    fireEvent.click(button('Save and stop'));
    await waitFor(() => expect(s.onSave).toHaveBeenCalled());
    expect(onStop).not.toHaveBeenCalled();
  });

  it('a run saved since its last beat stops at once', () => {
    const onStop = vi.fn();
    render(<Panel save={save({ unsaved: false })} onStop={onStop} />);
    fireEvent.click(button('Stop watching'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('Save this run (rpg-project#1013)', () => {
  it('reads every page, downloads one file the reader opens, and is saved until a newer beat', async () => {
    const download = vi.fn();
    const asked: string[] = [];
    const getPage = vi.fn(async (_run: WatchedRun, afterId: string) => {
      asked.push(afterId);
      return afterId === ''
        ? create(GetRecordResponseSchema, { events: [EVENTS[0]!], more: true })
        : create(GetRecordResponseSchema, {
            events: [EVENTS[1]!],
            more: false,
          });
    });
    const { result, rerender } = renderHook(
      ({ lastBeat }: { lastBeat: string }) =>
        useWatchSave({
          watch: WATCH,
          lastBeat,
          seatName: 'Ana',
          draft: SAVED_DRAFT,
          names: NAMES,
          readBack: castleMachinesReadBack(),
          dungeonKey: 'the-mad-king',
          getPage,
          download,
          now: () => new Date('2026-11-19T14:05:09Z'),
        }),
      { initialProps: { lastBeat: EVENTS[1]!.id } }
    );
    expect(result.current?.unsaved).toBe(true);
    await act(async () => {
      expect(await result.current!.onSave()).toBe(true);
    });
    expect(asked).toEqual(['', EVENTS[0]!.id]);
    const [name, text] = download.mock.calls[0] as [string, string];
    expect(name).toBe('the-mad-king-run-20261119T140509Z.jsonl');
    const opened = openSavedRun(name, text);
    expect(opened.header?.memberName).toBe('Ana');
    expect(opened.capture.feed.rows.map((r) => r.id)).toEqual(
      EVENTS.map((e) => e.id)
    );
    expect(result.current?.unsaved).toBe(false);
    rerender({ lastBeat: '9999' });
    expect(result.current?.unsaved).toBe(true);
  });

  it('a refused read says so and downloads nothing', async () => {
    const download = vi.fn();
    const { result } = renderHook(() =>
      useWatchSave({
        watch: WATCH,
        lastBeat: '0002',
        draft: SAVED_DRAFT,
        names: NAMES,
        readBack: null,
        dungeonKey: 'k',
        getPage: async () => {
          throw new Error('not seated');
        },
        download,
      })
    );
    await act(async () => {
      expect(await result.current!.onSave()).toBe(false);
    });
    expect(result.current?.error).toContain('not seated');
    expect(download).not.toHaveBeenCalled();
  });
});

describe('Open a saved run (rpg-project#1013)', () => {
  const MOVED = draftWith({ q: 9, r: 9 });

  it('drives the fold from the snapshot, not the open draft, and says the draft changed', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({
        dungeonKey: 'the-mad-king',
        draft: MOVED,
        names: new Map(),
        readBack: castleMachinesReadBack(),
      })
    );
    act(() => {
      expect(result.current.openText('run.jsonl', SAVED_TEXT)).toBe(true);
    });
    expect(result.current.run.view.members['gate-1']?.cell).toEqual({
      q: 4,
      r: 2,
    });
    expect(result.current.names.get('hero')).toBe('Ana');
    expect(result.current.panel?.notes.join(' ')).toContain(
      'changed since this run was saved'
    );
  });

  it('the same draft opens with one line: no encounter identity, and the snapshot matches (rpg-project#1017)', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({
        dungeonKey: 'the-mad-king',
        draft: SAVED_DRAFT,
        names: new Map(),
        readBack: castleMachinesReadBack(),
      })
    );
    act(() => void result.current.openText('run.jsonl', SAVED_TEXT));
    expect(result.current.panel?.notes).toEqual([
      'This run carries no encounter identity (it was recorded before runs named their encounter). By its snapshot, the encounter looks the same.',
    ]);
  });

  it('a raw capture opens against the open draft, with the note', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({
        draft: MOVED,
        names: new Map(),
        readBack: null,
      })
    );
    act(() => void result.current.openText('records.jsonl', RAW_TEXT));
    expect(result.current.watch?.member).toBe('hero');
    expect(result.current.run.view.members['gate-1']?.cell).toEqual({
      q: 9,
      r: 9,
    });
    expect(result.current.panel?.notes).toEqual([NO_SNAPSHOT_NOTE]);
  });

  it('a file the reader refuses is said, and nothing opens', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({ draft: MOVED, names: new Map(), readBack: null })
    );
    act(() => void result.current.openText('bad.jsonl', 'not json'));
    expect(result.current.opened).toBeNull();
    expect(result.current.error).toContain('Could not open bad.jsonl');
  });

  it('the panel is marked a saved run, read-only: Close, Back, no Live, no Stop, no Save', () => {
    function Replay(): React.JSX.Element {
      const replay = useSavedRunReplay({
        draft: SAVED_DRAFT,
        names: new Map(),
        readBack: null,
      });
      const once = useRef(false);
      if (!once.current) {
        once.current = true;
        replay.openText('run.jsonl', SAVED_TEXT);
      }
      if (!replay.watch || !replay.panel) return <p>closed</p>;
      return (
        <StudioWatch
          watch={replay.watch}
          run={replay.run}
          readBack={replay.readBack}
          names={replay.names}
          onStop={replay.close}
          replay={replay.panel}
        />
      );
    }
    render(<Replay />);
    expect(screen.getByTestId('watch-replay').textContent).toContain(
      'Saved run · run.jsonl · saved'
    );
    expect(screen.queryByRole('button', { name: 'Live' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop watching' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save this run' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Play in the game' })
    ).toBeNull();
    fireEvent.click(button('Back'));
    expect(screen.getByTestId('watch-step').textContent).toBe('the start');
    fireEvent.click(button('Close'));
    screen.getByText('closed');
  });

  it('draws the machines from the file, never the open draft’s read-back', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({
        draft: SAVED_DRAFT,
        names: new Map(),
        readBack: create(ReadBackSchema, {}),
      })
    );
    act(() => void result.current.openText('run.jsonl', SAVED_TEXT));
    const member = {
      id: 'gate-1',
      roles: {},
    } as unknown as Parameters<typeof machinesRunBy>[1];
    expect(
      machinesRunBy(result.current.readBack, member).map((m) => m.routine)
    ).toEqual(
      machinesRunBy(castleMachinesReadBack(), member).map((m) => m.routine)
    );
    expect(machinesRunBy(result.current.readBack, member)).not.toEqual([]);
  });

  it('a run saved from another encounter says so by name', () => {
    const { result } = renderHook(() =>
      useSavedRunReplay({
        draft: SAVED_DRAFT,
        dungeonKey: 'the-other-keep',
        names: new Map(),
        readBack: castleMachinesReadBack(),
      })
    );
    act(() => void result.current.openText('run.jsonl', SAVED_TEXT));
    expect(result.current.panel?.notes.join(' ')).toContain(
      'this run was saved from The mad king'
    );
  });

  it('an incomplete saved run says so', () => {
    const text = savedRunText(
      {
        format: SAVED_RUN_FORMAT,
        savedAt: '2026-11-19T14:00:00.000Z',
        session: 'run-1',
        member: 'hero',
        dungeon: { key: 'the-mad-king', name: 'Gate' },
        snapshot: snapshotOf({
          draft: SAVED_DRAFT,
          names: NAMES,
          readBack: null,
        }),
      },
      { events: [...EVENTS, BARE], complete: true }
    );
    const { result } = renderHook(() =>
      useSavedRunReplay({
        draft: SAVED_DRAFT,
        names: new Map(),
        readBack: null,
      })
    );
    act(() => void result.current.openText('run.jsonl', text));
    expect(result.current.panel?.notes.join(' ')).toContain(
      'This saved run is incomplete'
    );
  });
});

describe('the operator hears how a save went (rpg-project#1013)', () => {
  it('a save that wrote an incomplete file says so', async () => {
    const { result } = renderHook(() =>
      useWatchSave({
        watch: WATCH,
        lastBeat: '0002',
        draft: SAVED_DRAFT,
        names: NAMES,
        readBack: null,
        dungeonKey: 'k',
        getPage: async () =>
          create(GetRecordResponseSchema, {
            events: [...EVENTS, BARE],
            more: false,
          }),
        download: vi.fn(),
      })
    );
    await act(async () => void (await result.current!.onSave()));
    expect(result.current?.notice).toContain('this run is incomplete');
  });

  it('the panel shows a failed save and an incomplete one', () => {
    render(
      <Panel
        save={{
          onSave: vi.fn(async () => false),
          saving: false,
          error: 'Could not save the run: not seated',
          notice: 'Saved, but this run is incomplete: 1 beats.',
          unsaved: true,
        }}
        onStop={vi.fn()}
      />
    );
    expect(screen.getByTestId('watch-save-error').textContent).toContain(
      'not seated'
    );
    expect(screen.getByTestId('watch-save-notice').textContent).toContain(
      'incomplete'
    );
  });
});
