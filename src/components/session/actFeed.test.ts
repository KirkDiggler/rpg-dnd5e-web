import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import {
  GetStoryResponseSchema,
  StreamEventsResponseSchema,
  type GetStoryResponse,
  type StreamEventsResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/story_service_pb';
import { describe, expect, it, vi } from 'vitest';
import {
  sameIdRuns,
  startActFeed,
  type ActDeliveryMetadata,
  type ActStreamState,
} from './actFeed';

function act(id: string, verb = 'rest'): Act {
  return create(ActSchema, {
    id,
    act: `${verb}:${id}`,
    verb,
    family: Family.ACT,
    session: 'sess-1',
  });
}
function actMsg(id: string): StreamEventsResponse {
  return create(StreamEventsResponseSchema, {
    item: { case: 'act', value: act(id) },
  });
}
function laggedMsg(lastId: string): StreamEventsResponse {
  return create(StreamEventsResponseSchema, {
    item: { case: 'lagged', value: { lastId } },
  });
}
function restartedMsg(): StreamEventsResponse {
  return create(StreamEventsResponseSchema, {
    item: { case: 'restarted', value: {} },
  });
}
function page(
  ids: string[],
  more = false,
  restarted = false
): GetStoryResponse {
  return create(GetStoryResponseSchema, {
    acts: ids.map((id) => act(id)),
    more,
    restarted,
  });
}

function scripted(
  msgs: StreamEventsResponse[],
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

/** Yields `first`, waits one macrotask, yields `then`, then holds open. */
function splitAcrossMacrotasks(
  first: StreamEventsResponse[],
  then: StreamEventsResponse[]
) {
  return async function* (signal: AbortSignal) {
    for (const m of first) yield m;
    await new Promise((r) => setTimeout(r, 5));
    for (const m of then) yield m;
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve())
    );
  };
}

function harness(
  streams: ((signal: AbortSignal) => AsyncIterable<StreamEventsResponse>)[],
  get: (afterId: string) => Promise<GetStoryResponse> = async () => page([])
) {
  const streamCalls: string[] = [];
  const getCalls: string[] = [];
  const runs: {
    ids: string[];
    source: ActDeliveryMetadata['source'];
    startIndex: number;
  }[] = [];
  const states: ActStreamState[] = [];
  const onRestarted = vi.fn();
  const feed = startActFeed({
    stream: (afterId, signal) => {
      streamCalls.push(afterId);
      const next = streams.shift() ?? scripted([], 'hold');
      return next(signal);
    },
    get: (afterId) => {
      getCalls.push(afterId);
      return get(afterId);
    },
    onRun: (run, metadata) =>
      runs.push({
        ids: run.map((a) => a.id),
        source: metadata.source,
        startIndex: metadata.startIndex,
      }),
    onRestarted,
    onState: (s) => states.push(s),
    retryDelayMs: () => 0,
  });
  return {
    feed,
    streamCalls,
    getCalls,
    runs,
    states,
    onRestarted,
    ids: () => runs.flatMap((r) => r.ids),
  };
}

describe('sameIdRuns', () => {
  it('groups consecutive acts sharing an id', () => {
    const runs = sameIdRuns(['A', 'B', 'B', 'C', 'B'].map((id) => act(id)));
    expect(runs.map((r) => r.map((a) => a.id))).toEqual([
      ['A'],
      ['B', 'B'],
      ['C'],
      ['B'],
    ]);
  });
});

describe('actFeed', () => {
  it('catches up from GetStory, then opens the stream after the newest id', async () => {
    const h = harness([scripted([actMsg('C')], 'hold')], async (afterId) =>
      afterId === '' ? page(['A', 'B']) : page([])
    );
    await vi.waitFor(() => expect(h.ids()).toEqual(['A', 'B', 'C']));
    expect(h.getCalls).toEqual(['']);
    expect(h.streamCalls).toEqual(['B']);
    expect(h.runs.map((r) => r.source)).toEqual(['catchup', 'catchup', 'live']);
    expect(h.states).toContain('live');
    h.feed.stop();
  });

  it('act stream resumes after last id', async () => {
    const h = harness(
      [
        scripted([actMsg('A'), actMsg('B')], 'fail'),
        scripted([actMsg('C')], 'hold'),
      ],
      async () => page([])
    );
    await vi.waitFor(() => expect(h.ids()).toEqual(['A', 'B', 'C']));
    // Each reconnection catches up after the last id held, then reopens there.
    expect(h.getCalls).toEqual(['', 'B']);
    expect(h.streamCalls).toEqual(['', 'B']);
    expect(h.states).toContain('reconnecting');
    h.feed.stop();
  });

  it('lagged pages GetStory then reopens', async () => {
    // The stream delivers A, then lags. The catch-up reads two pages after
    // A: the first runs one past its limit to finish B's run and says
    // `more`; the second holds C. A replay of B on the reopened stream is not
    // delivered twice, and B's three acts arrive as one run.
    const pages: Record<string, GetStoryResponse> = {
      '': page([]),
      A: page(['B', 'B', 'B'], true),
      B: page(['C']),
      C: page([]),
    };
    const h = harness(
      [
        scripted([actMsg('A'), laggedMsg('A')], 'end'),
        scripted([actMsg('B'), actMsg('C'), actMsg('D')], 'hold'),
      ],
      async (afterId) => pages[afterId] ?? page([])
    );
    await vi.waitFor(() =>
      expect(h.ids()).toEqual(['A', 'B', 'B', 'B', 'C', 'D'])
    );
    expect(h.runs.map((r) => r.ids)).toEqual([
      ['A'],
      ['B', 'B', 'B'],
      ['C'],
      ['D'],
    ]);
    expect(h.getCalls).toEqual(['', 'A', 'B']);
    expect(h.streamCalls).toEqual(['', 'C']);
    h.feed.stop();
  });

  it('delivers a live same-id run as one run', async () => {
    const h = harness([
      scripted([actMsg('A'), actMsg('B'), actMsg('B'), actMsg('C')], 'hold'),
    ]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['A', 'B', 'B', 'C']));
    expect(h.runs.map((r) => r.ids)).toEqual([['A'], ['B', 'B'], ['C']]);
    h.feed.stop();
  });

  it('restarted triggers aged-out refresh', async () => {
    const h = harness([scripted([], 'hold')], async () =>
      page(['K', 'L'], false, true)
    );
    await vi.waitFor(() => expect(h.ids()).toEqual(['K', 'L']));
    expect(h.onRestarted).toHaveBeenCalledTimes(1);
    h.feed.stop();
  });

  it('stop ends the feed without reconnecting', async () => {
    const h = harness([scripted([actMsg('A')], 'hold')]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['A']));
    h.feed.stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.streamCalls).toEqual(['']);
  });

  it('delivers a same-id run split across macrotasks whole: the tail continues it', async () => {
    // The reviewer's probe: a rest, then its concentration-ended act one
    // macrotask later. The first is delivered at once (the table may be
    // waiting on it); the second continues the same run, never dropped.
    const h = harness([
      splitAcrossMacrotasks([actMsg('R')], [actMsg('R'), actMsg('S')]),
    ]);
    await vi.waitFor(() => expect(h.ids()).toEqual(['R', 'R', 'S']));
    expect(h.runs).toEqual([
      { ids: ['R'], source: 'live', startIndex: 0 },
      { ids: ['R'], source: 'live', startIndex: 1 },
      { ids: ['S'], source: 'live', startIndex: 0 },
    ]);
    h.feed.stop();
  });

  it('never continues a run from a page: a page’s copy of a held id is skipped', async () => {
    const pages: Record<string, GetStoryResponse> = {
      '': page(['A']),
      A: page(['A', 'B']),
    };
    const h = harness(
      [scripted([], 'end'), scripted([], 'hold')],
      async (id) => pages[id] ?? page([])
    );
    await vi.waitFor(() => expect(h.getCalls.length).toBeGreaterThanOrEqual(2));
    await vi.waitFor(() => expect(h.ids()).toEqual(['A', 'B']));
    h.feed.stop();
  });

  it('refresh drops the stream, catches up after the last id and reopens', async () => {
    const h = harness(
      [scripted([actMsg('A')], 'hold'), scripted([], 'hold')],
      async (id) => (id === 'A' ? page(['B']) : page([]))
    );
    await vi.waitFor(() => expect(h.ids()).toEqual(['A']));
    h.feed.refresh();
    await vi.waitFor(() => expect(h.streamCalls).toEqual(['', 'B']));
    expect(h.getCalls).toEqual(['', 'A']);
    expect(h.runs.at(-1)).toEqual({
      ids: ['B'],
      source: 'catchup',
      startIndex: 0,
    });
    expect(h.states).not.toContain('reconnecting');
    h.feed.stop();
  });

  it('a stream restarted re-reads retained history as catch-up, not live', async () => {
    // The first read holds Z; the stream then says the resume point aged out,
    // and the retained history (K) is re-read through GetStory from the start.
    let calls = 0;
    const h = harness(
      [scripted([restartedMsg(), actMsg('K')], 'hold'), scripted([], 'hold')],
      async () => {
        calls += 1;
        return calls === 1 ? page(['Z']) : page(['K']);
      }
    );
    await vi.waitFor(() => expect(h.onRestarted).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(h.ids()).toEqual(['Z', 'K']));
    expect(h.runs.find((r) => r.ids[0] === 'K')?.source).toBe('catchup');
    expect(h.getCalls).toEqual(['', '']);
    h.feed.stop();
  });
});
