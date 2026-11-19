/**
 * Save a run and open it again (rpg-project#1013): the file round-trips
 * through the capture reader, the save reads the whole record page by page,
 * the snapshot draws the machines without the open draft's read-back, and
 * the watch's own feed holds the whole run past the trace panel's ring.
 */
import { parseRecordCapture } from '@/components/session/recordCapture';
import {
  RECORD_MAX_ROWS,
  startRecordFeed,
  type RecordFeedSnapshot,
} from '@/components/session/recordFeed';
import { create } from '@bufbuild/protobuf';
import { RecordEventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import {
  GetRecordResponseSchema,
  type GetRecordResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import { describe, expect, it } from 'vitest';
import { createRoomDraft, type RoomDraft } from '../world-building/roomDraft';
import { castleMachinesReadBack } from './fixtures/engineReadBack';
import { foldRun } from './runView';
import { machinesRunBy } from './runWatch';
import {
  draftDiffersFrom,
  openSavedRun,
  readBackExcerpt,
  readWholeRecord,
  runDraftOfSnapshot,
  SAVE_READ_RETRIES,
  SAVED_RUN_FORMAT,
  savedFromElsewhere,
  savedRunFile,
  savedRunFileName,
  savedRunText,
  snapshotOf,
  type SavedRunHeader,
} from './savedRun';

const encoder = new TextEncoder();
const event = (n: number, beat = 'moved', fields?: Record<string, unknown>) =>
  create(RecordEventSchema, {
    id: String(n).padStart(6, '0'),
    at: BigInt(n),
    act: `move:${n}`,
    beat,
    fieldsJson: encoder.encode(
      JSON.stringify(
        fields ?? { beat, member: 'hero', position: { x: n % 7, y: 1 } }
      )
    ),
  });

function draftWith(cells: Record<string, { q: number; r: number }>): RoomDraft {
  const draft = createRoomDraft(
    { version: 1, id: 'scene', name: 'Gate', items: [], groups: [] },
    'room'
  );
  return {
    ...draft,
    room: {
      ...draft.room,
      monsterDeclarations: Object.entries(cells).map(([id, location]) => ({
        id,
        ref: 'monster:guard',
        startingCell: { location },
      })),
    },
  };
}

const DRAFT = draftWith({ 'gate-1': { q: 4, r: 2 }, 'gate-2': { q: 5, r: 2 } });
const NAMES = new Map([
  ['gate-1', 'North guard'],
  ['gate-2', 'South guard'],
]);

function header(draft = DRAFT): SavedRunHeader {
  return {
    format: SAVED_RUN_FORMAT,
    savedAt: '2026-11-19T14:00:00.000Z',
    session: 'run-1',
    member: 'hero',
    memberName: 'Ana',
    dungeon: { key: 'the-mad-king', name: 'The mad king' },
    snapshot: snapshotOf({
      draft,
      names: NAMES,
      readBack: castleMachinesReadBack(),
    }),
  };
}

/** Pages of `size` over `events`, as GetRecord answers after an id. */
function pager(events: ReturnType<typeof event>[], size: number) {
  const asked: string[] = [];
  const get = async (afterId: string): Promise<GetRecordResponse> => {
    asked.push(afterId);
    const from =
      afterId === '' ? 0 : events.findIndex((e) => e.id === afterId) + 1;
    const page = events.slice(from, from + size);
    return create(GetRecordResponseSchema, {
      events: page,
      more: from + size < events.length,
    });
  };
  return { get, asked };
}

describe('Save this run reads the whole record (rpg-project#1013)', () => {
  it('pages GetRecord from the start until more is false', async () => {
    const events = Array.from({ length: 1203 }, (_, i) => event(i + 1));
    const { get, asked } = pager(events, 500);
    const record = await readWholeRecord(get);
    expect(asked[0]).toBe('');
    expect(asked.slice(1)).toEqual([events[499]!.id, events[999]!.id]);
    expect(record.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(record.complete).toBe(true);
  });

  /** A read after an id that aged out: the server replays from its oldest
   * retained beat, with `more` still true (record_service.proto). */
  const restartedFrom = (events: ReturnType<typeof event>[]) =>
    create(GetRecordResponseSchema, {
      events: events.slice(0, 2),
      more: true,
      restarted: true,
    });

  it('a record that restarts under the read is read again from the start', async () => {
    const events = Array.from({ length: 6 }, (_, i) => event(i + 1));
    const { get: pages } = pager(events, 2);
    let restarts = 1;
    const asked: string[] = [];
    const record = await readWholeRecord(async (afterId) => {
      asked.push(afterId);
      if (afterId !== '' && restarts > 0) {
        restarts -= 1;
        return restartedFrom(events);
      }
      return pages(afterId);
    });
    expect(asked.filter((a) => a === '').length).toBe(2);
    expect(record.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(record.complete).toBe(true);
  });

  it('a record that keeps restarting fails the save, a bounded number of times', async () => {
    const events = Array.from({ length: 6 }, (_, i) => event(i + 1));
    const { get: pages } = pager(events, 2);
    let reads = 0;
    await expect(
      readWholeRecord(async (afterId) => {
        reads += 1;
        if (reads > 100) throw new Error('unbounded');
        return afterId === '' ? pages('') : restartedFrom(events);
      })
    ).rejects.toThrow(/restarted under the read/);
    expect(reads).toBeLessThanOrEqual(2 * (SAVE_READ_RETRIES + 1));
  });

  it('a page that says more but brings nothing is never the end', async () => {
    const events = Array.from({ length: 4 }, (_, i) => event(i + 1));
    const { get: pages } = pager(events, 2);
    let empties = 1;
    const record = await readWholeRecord(async (afterId) => {
      if (afterId !== '' && empties > 0) {
        empties -= 1;
        return create(GetRecordResponseSchema, { events: [], more: true });
      }
      return pages(afterId);
    });
    expect(record.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });

  it('a server that keeps saying more with nothing fails the save', async () => {
    let reads = 0;
    await expect(
      readWholeRecord(async () => {
        reads += 1;
        if (reads > 100) throw new Error('unbounded');
        return create(GetRecordResponseSchema, {
          events: reads === 1 ? [event(1)] : [],
          more: true,
        });
      })
    ).rejects.toThrow(/more of the record follows but sends none/);
  });

  it('names the file by the dungeon key and the UTC time', () => {
    expect(
      savedRunFileName('the-mad-king', new Date('2026-11-19T14:05:09.123Z'))
    ).toBe('the-mad-king-run-20261119T140509Z.jsonl');
  });
});

describe('a saved run file (rpg-project#1013)', () => {
  const events = [
    event(1, 'joined', { beat: 'joined', kind: 'player', member: 'hero' }),
    event(2),
    event(3, 'state', {
      beat: 'state',
      member: 'gate-1',
      from: 'posted',
      to: 'alert',
    }),
  ];
  const text = savedRunText(header(), { events, complete: true });

  it('is a header line, then schema-1 record lines the capture reader reads as the server writes them', () => {
    const lines = text.trim().split('\n');
    const head = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(head).toMatchObject({
      schema: 1,
      kind: 'run',
      format: SAVED_RUN_FORMAT,
      session: 'run-1',
      member: 'hero',
      member_name: 'Ana',
      dungeon: { key: 'the-mad-king', name: 'The mad king' },
    });
    const second = JSON.parse(lines[2]!) as Record<string, unknown>;
    expect(Object.keys(second)).toEqual([
      'schema',
      'kind',
      'capture',
      'logged_at',
      'session',
      'id',
      'at',
      'act',
      'beat',
      'fields',
    ]);
    // The trace panel's Open capture reads it too, with no history warning.
    const parsed = parseRecordCapture(text);
    expect(parsed.session).toBe('run-1');
    expect(parsed.feed.rows.map((r) => r.id)).toEqual(events.map((e) => e.id));
    expect(parsed.feed.rows[2]!.fields).toMatchObject({ to: 'alert' });
    expect(parsed.feed.notice ?? '').not.toContain('history');
  });

  it('opens with its header read back and its snapshot as the starts', () => {
    const opened = openSavedRun('run.jsonl', text);
    expect(opened.header?.memberName).toBe('Ana');
    expect(opened.header?.snapshot.creatures).toContainEqual({
      id: 'gate-1',
      name: 'North guard',
      cell: { q: 4, r: 2 },
      routines: expect.arrayContaining([expect.any(String)]),
    });
    const draft = runDraftOfSnapshot(opened.header!.snapshot);
    expect(draft.room.monsterDeclarations).toContainEqual({
      id: 'gate-2',
      startingCell: { location: { q: 5, r: 2 } },
    });
  });

  it('carries the read-back the machine drawings need, and they draw the same', () => {
    const full = castleMachinesReadBack();
    const opened = openSavedRun('run.jsonl', text);
    const member = {
      id: 'gate-1',
      party: false,
      cell: null,
      state: 'posted',
      roles: {},
    } as unknown as Parameters<typeof machinesRunBy>[1];
    const fromFile = machinesRunBy(opened.header!.snapshot.readBack, member);
    const fromDraft = machinesRunBy(full, member);
    expect(fromFile.length).toBeGreaterThan(0);
    expect(fromFile.map((m) => [m.routine, m.live])).toEqual(
      fromDraft.map((m) => [m.routine, m.live])
    );
    expect(fromFile.map((m) => m.layout.boxes.map((b) => b.state.id))).toEqual(
      fromDraft.map((m) => m.layout.boxes.map((b) => b.state.id))
    );
    // The excerpt is smaller than the read-back it came from.
    expect(JSON.stringify(readBackExcerpt(full)).length).toBeLessThan(
      JSON.stringify(full).length
    );
  });

  it('a file whose header is of another session is refused', () => {
    const other = text.replace(
      '"session":"run-1","member"',
      '"session":"run-9","member"'
    );
    expect(() => openSavedRun('run.jsonl', other)).toThrow(/another session/);
  });

  it('a raw server capture (no header) opens with no snapshot', () => {
    const raw = text.split('\n').slice(1).join('\n');
    const opened = openSavedRun('records.jsonl', raw);
    expect(opened.header).toBeNull();
    expect(opened.capture.feed.rows[0]!.id).toBe(events[0]!.id);
  });
});

describe('the whole run past the trace panel ring (rpg-project#1013)', () => {
  /** The guard steps once, first; then only the hero moves, past the
   * ring. */
  const many = [
    {
      ...event(1, 'moved', {
        beat: 'moved',
        member: 'gate-1',
        position: { x: 3, y: 3 },
      }),
      act: 'time:1',
    },
    ...Array.from({ length: RECORD_MAX_ROWS + 120 }, (_, i) => event(i + 2)),
  ];

  it('a saved run opens with every beat, from the first', () => {
    const text = savedRunText(header(), { events: many, complete: true });
    const opened = openSavedRun('long.jsonl', text);
    expect(opened.capture.feed.rows[0]!.id).toBe(many[0]!.id);
    // The trace panel's own Open capture still keeps only its ring.
    expect(parseRecordCapture(text).feed.rows[0]!.id).not.toBe(many[0]!.id);
  });

  it('the watch feed keeps the first beat; Back reaches step 1 and a creature that has not moved since keeps its cell', async () => {
    let latest: RecordFeedSnapshot = { rows: [], notice: undefined };
    const feed = startRecordFeed({
      stream: async function* () {
        for (const e of many)
          yield { item: { case: 'event' as const, value: e } } as never;
        await new Promise(() => {});
      },
      get: async () => create(GetRecordResponseSchema, {}),
      onChange: (s) => (latest = s),
      retryDelayMs: () => 1000,
      limit: Infinity,
    });
    await new Promise((r) => setTimeout(r, 0));
    feed.stop();
    expect(latest.rows[0]!.id).toBe(many[0]!.id);
    expect(latest.rows[latest.rows.length - 1]!.id).toBe(
      many[many.length - 1]!.id
    );
    const start = {
      creatures: [{ id: 'gate-1', cell: { q: 4, r: 2 } }],
      self: 'hero',
    };
    const steps = foldRun(start, latest.rows, 0).steps;
    // Step 1 is the hero's first move, the second beat of the run.
    expect(steps[1]!.act).toBe(many[1]!.act);
    const afterFirst = foldRun(start, latest.rows, steps[1]!.through);
    const end = foldRun(start, latest.rows);
    expect(afterFirst.members['gate-1']!.cell).not.toEqual({ q: 4, r: 2 });
    expect(end.members['gate-1']!.cell).toEqual(
      afterFirst.members['gate-1']!.cell
    );
  });

  it('the game trace panel feed still keeps its ring', async () => {
    let latest: RecordFeedSnapshot = { rows: [], notice: undefined };
    const feed = startRecordFeed({
      stream: async function* () {
        for (const e of many)
          yield { item: { case: 'event' as const, value: e } } as never;
        await new Promise(() => {});
      },
      get: async () => create(GetRecordResponseSchema, {}),
      onChange: (s) => (latest = s),
      retryDelayMs: () => 1000,
    });
    await new Promise((r) => setTimeout(r, 0));
    feed.stop();
    expect(latest.rows[0]!.id).not.toBe(many[0]!.id);
  });
});

describe('the open draft against a saved run (rpg-project#1013)', () => {
  const readBack = castleMachinesReadBack();
  const snapshot = header().snapshot;

  it('the same draft does not differ', () => {
    expect(draftDiffersFrom(snapshot, DRAFT, readBack)).toEqual([]);
  });

  it('a guard moved says where its creatures start', () => {
    const moved = draftWith({
      'gate-1': { q: 9, r: 9 },
      'gate-2': { q: 5, r: 2 },
    });
    expect(draftDiffersFrom(snapshot, moved, readBack)).toContain(
      'where its creatures start'
    );
  });

  it('a creature removed says its creatures', () => {
    const fewer = draftWith({ 'gate-1': { q: 4, r: 2 } });
    expect(draftDiffersFrom(snapshot, fewer, readBack)).toContain(
      'its creatures'
    );
  });

  it('a creature that now runs a different routine says so', () => {
    const other = {
      ...snapshot,
      creatures: snapshot.creatures.map((c) =>
        c.id === 'gate-1' ? { ...c, routines: ['another-routine'] } : c
      ),
    };
    expect(draftDiffersFrom(other, DRAFT, readBack)).toContain(
      'the routines its creatures run'
    );
  });

  it('a run saved from another encounter is named', () => {
    const h = header();
    expect(
      savedFromElsewhere(h, { key: 'the-mad-king', name: 'x' })
    ).toBeNull();
    expect(savedFromElsewhere(h, { key: 'other-keep', name: 'Other' })).toBe(
      'The mad king'
    );
    expect(savedFromElsewhere(h, { key: '', name: 'Other' })).toBe(
      'The mad king'
    );
  });
});

describe('an incomplete save (rpg-project#1013)', () => {
  it('a beat without fields is left out, and the header and the closing line say the file is incomplete', () => {
    const bare = create(RecordEventSchema, {
      id: '000002',
      at: 2n,
      act: 'move:2',
      beat: 'moved',
    });
    const file = savedRunFile(header(), {
      events: [event(1), bare, event(3)],
      complete: true,
    });
    expect(file.incomplete).toContain('1 beats had no readable fields');
    const opened = openSavedRun('run.jsonl', file.text);
    expect(opened.header?.incomplete).toBe(file.incomplete);
    expect(opened.capture.feed.notice).toContain('Capture incomplete');
  });
});
