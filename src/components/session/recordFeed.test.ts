import { create } from '@bufbuild/protobuf';
import {
  RecordEventSchema,
  type RecordEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import {
  GetRecordResponseSchema,
  StreamRecordResponseSchema,
  type GetRecordResponse,
  type StreamRecordResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import { describe, expect, it, vi } from 'vitest';
import { startRecordFeed, type RecordFeedSnapshot } from './recordFeed';

function beat(id: string, name = 'moved', act = 'move:01HF'): RecordEvent {
  return create(RecordEventSchema, {
    id,
    beat: name,
    act,
    at: 1n,
    fields: { beat: name },
  });
}
function eventMsg(id: string): StreamRecordResponse {
  return create(StreamRecordResponseSchema, {
    item: { case: 'event', value: beat(id) },
  });
}
function laggedMsg(lastId: string): StreamRecordResponse {
  return create(StreamRecordResponseSchema, {
    item: { case: 'lagged', value: { lastId } },
  });
}
function page(
  ids: string[],
  restarted = false,
  more = false
): GetRecordResponse {
  return create(GetRecordResponseSchema, {
    events: ids.map((id) => beat(id)),
    restarted,
    more,
  });
}

// A stream that yields msgs, then either ends, fails, or stays open until
// aborted.
function scripted(
  msgs: StreamRecordResponse[],
  end: 'end' | 'fail' | 'hold' = 'end'
) {
  return async function* (signal: AbortSignal) {
    for (const m of msgs) yield m;
    if (end === 'fail') throw new Error('connection dropped');
    if (end === 'hold') {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve())
      );
    }
  };
}

function harness(
  streams: ((signal: AbortSignal) => AsyncIterable<StreamRecordResponse>)[],
  get: (afterId: string) => Promise<GetRecordResponse> = async () => page([])
) {
  const streamCalls: string[] = [];
  const getCalls: string[] = [];
  let snapshot: RecordFeedSnapshot = { rows: [], notice: undefined };
  const feed = startRecordFeed({
    stream: (afterId, signal) => {
      streamCalls.push(afterId);
      const next = streams.shift() ?? scripted([], 'hold');
      return next(signal);
    },
    get: (afterId) => {
      getCalls.push(afterId);
      return get(afterId);
    },
    onChange: (s) => {
      snapshot = s;
    },
    retryDelayMs: () => 0,
  });
  return {
    feed,
    streamCalls,
    getCalls,
    ids: () => snapshot.rows.map((r) => r.id),
    notice: () => snapshot.notice,
  };
}

describe('recordFeed', () => {
  it('opens from the oldest retained beat', async () => {
    const h = harness([scripted([eventMsg('A1'), eventMsg('A2')], 'hold')]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['A1', 'A2']));
    expect(h.streamCalls).toEqual(['']);
    h.feed.stop();
  });

  it('resumes after last id', async () => {
    const h = harness([
      scripted([eventMsg('A1'), eventMsg('A2')], 'fail'),
      // The reopened stream overlaps by one; the row is not rendered twice.
      scripted([eventMsg('A2'), eventMsg('A3')], 'hold'),
    ]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['A1', 'A2', 'A3']));
    expect(h.streamCalls).toEqual(['', 'A2']);
    h.feed.stop();
  });

  it('lagged re-reads then reopens', async () => {
    // The first page is short and says `more`: a page's length is not the
    // end signal, `more` is.
    const pages: Record<string, GetRecordResponse> = {
      A1: page(['B0000', 'B0001', 'B0002'], false, true),
      B0002: page(['C1']),
    };
    const h = harness(
      [scripted([eventMsg('A1'), laggedMsg('A1')]), scripted([], 'hold')],
      async (after) => pages[after] ?? page([])
    );
    await vi.waitFor(() => expect(h.streamCalls).toHaveLength(2));
    expect(h.getCalls).toEqual(['A1', 'B0002']);
    expect(h.streamCalls).toEqual(['', 'C1']);
    const ids = h.ids();
    expect(ids[ids.length - 1]).toBe('C1');
    expect(ids).toEqual([...ids].sort());
    h.feed.stop();
  });

  it('restarted replaces the buffer and says so once', async () => {
    const h = harness(
      [scripted([eventMsg('A1'), laggedMsg('A1')]), scripted([], 'hold')],
      async () => page(['Z1', 'Z2'], true)
    );
    await vi.waitFor(() => expect(h.ids()).toEqual(['Z1', 'Z2']));
    expect(h.notice()).toBe('Older beats aged out of the record.');
    h.feed.stop();
  });

  it('a stream that opens restarted replaces the buffer', async () => {
    const restarted = create(StreamRecordResponseSchema, {
      item: { case: 'restarted', value: {} },
    });
    const h = harness([
      scripted([eventMsg('A1'), eventMsg('A2')], 'fail'),
      scripted([restarted, eventMsg('Z1'), eventMsg('Z2')], 'hold'),
    ]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['Z1', 'Z2']));
    expect(h.streamCalls).toEqual(['', 'A2']);
    expect(h.notice()).toBe('Older beats aged out of the record.');
    h.feed.stop();
  });

  it('caps the rows it keeps', async () => {
    const many = Array.from({ length: 520 }, (_, i) =>
      eventMsg(`A${String(i).padStart(4, '0')}`)
    );
    const h = harness([scripted(many, 'hold')]);
    await vi.waitFor(() => expect(h.ids()).toHaveLength(500));
    expect(h.ids()[0]).toBe('A0020');
    h.feed.stop();
  });
});
