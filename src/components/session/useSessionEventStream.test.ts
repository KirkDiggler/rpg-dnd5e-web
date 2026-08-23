import { Code, ConnectError } from '@connectrpc/connect';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { StoryEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  streamEventsFn: vi.fn(),
  getStoryFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    streamEvents: hoisted.streamEventsFn,
    getStory: hoisted.getStoryFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionEventStream } from './useSessionEventStream';

function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    session: 'enc-1',
    seq: 1n,
    at: 0n,
    correlation: '',
    recipient: 'char-1',
    kind: 1,
    payload: new Uint8Array(),
    body: { case: undefined },
    ...overrides,
  } as Event;
}

function fakeEntry(overrides: Partial<StoryEntry> = {}): StoryEntry {
  return {
    seq: 1n,
    at: 0n,
    correlation: '',
    tags: {},
    payload: new Uint8Array(),
    ...overrides,
  } as StoryEntry;
}

/** A push-driven async-iterable "stream" a test can feed events into (or
 * end/error) at whatever pace it likes — unlike the static-array
 * `fakeStream` the pre-rule-6 test file used, this lets a test prove
 * ordering/buffering behavior that depends on WHEN an event arrives
 * relative to an in-flight GetStory call, not just what arrives. */
function manualStream() {
  const queue: Event[] = [];
  let pending: {
    resolve: (r: IteratorResult<Event>) => void;
    reject: (e: unknown) => void;
  } | null = null;
  let closed = false;

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<Event>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            if (closed) {
              return Promise.resolve({
                value: undefined,
                done: true,
              } as IteratorResult<Event>);
            }
            return new Promise<IteratorResult<Event>>((resolve, reject) => {
              pending = { resolve, reject };
            });
          },
        };
      },
    },
    push(event: Event) {
      if (pending) {
        const p = pending;
        pending = null;
        p.resolve({ value: event, done: false });
      } else {
        queue.push(event);
      }
    },
    end() {
      closed = true;
      if (pending) {
        const p = pending;
        pending = null;
        p.resolve({ value: undefined, done: true } as IteratorResult<Event>);
      }
    },
    error(err: unknown) {
      if (pending) {
        const p = pending;
        pending = null;
        p.reject(err);
      } else {
        closed = true;
      }
    },
  };
}

const storyTrimmedError = () =>
  new ConnectError('story range trimmed', Code.OutOfRange);

beforeEach(() => {
  hoisted.streamEventsFn.mockReset();
  hoisted.getStoryFn.mockReset();
  // Default: nothing to catch up — most tests override per-call as needed.
  hoisted.getStoryFn.mockResolvedValue({ entries: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSessionEventStream', () => {
  it('does not subscribe or fetch while session or member is empty', () => {
    renderHook(() => useSessionEventStream('', 'char-1', () => {}));
    renderHook(() => useSessionEventStream('enc-1', '', () => {}));
    expect(hoisted.streamEventsFn).not.toHaveBeenCalled();
    expect(hoisted.getStoryFn).not.toHaveBeenCalled();
  });

  it('aborts the stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    hoisted.streamEventsFn.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) => {
        capturedSignal = opts.signal;
        return manualStream().iterable;
      }
    );

    const { unmount } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', () => {})
    );
    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);

    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('re-subscribes when session/member changes', async () => {
    hoisted.streamEventsFn.mockReturnValue(manualStream().iterable);
    const { rerender } = renderHook(
      ({ session, member }) => useSessionEventStream(session, member, () => {}),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );
    await waitFor(() =>
      expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(1)
    );

    rerender({ session: 'enc-2', member: 'char-1' });
    await waitFor(() =>
      expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(2)
    );
    expect(hoisted.streamEventsFn).toHaveBeenLastCalledWith(
      { session: 'enc-2', member: 'char-1' },
      expect.anything()
    );
  });

  it('on the very first connect, catches up from zero before trusting live delivery, then delivers live events in order', async () => {
    hoisted.getStoryFn.mockResolvedValueOnce({
      entries: [fakeEntry({ seq: 1n })],
    });
    const stream = manualStream();
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    const onEvent = vi.fn();

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );

    await waitFor(() =>
      expect(hoisted.getStoryFn).toHaveBeenCalledWith(
        { session: 'enc-1', member: 'char-1', fromSeq: 0n },
        expect.anything()
      )
    );
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    // The catch-up entry, synthesized — no typed body (see module doc
    // comment: StoryEntry carries none).
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      seq: 1n,
      kind: expect.anything(),
      body: { case: undefined },
    });
    await waitFor(() => expect(result.current).toBe('live'));

    stream.push(fakeEvent({ seq: 2n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ seq: 2n })
    );
  });

  it('gap detection: a mid-stream seq jump triggers GetStory catch-up, buffers concurrent live events, and delivers everything in order, de-duped in favor of the buffered (typed) copy', async () => {
    const stream = manualStream();
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    const onEvent = vi.fn();

    // Call 1: initial connect, from_seq 0 — nothing held yet.
    hoisted.getStoryFn.mockResolvedValueOnce({ entries: [] });

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );
    await waitFor(() => expect(result.current).toBe('live'));

    stream.push(fakeEvent({ seq: 1n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    // Call 2: the gap catch-up, from_seq 2 — resolves seq 2 AND seq 3 (a
    // real GetStory answer has no upper bound), racing against seq 3 and
    // seq 4 already having arrived live in the meantime.
    let resolveCatchUp!: (v: { entries: StoryEntry[] }) => void;
    hoisted.getStoryFn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCatchUp = resolve;
        })
    );

    const liveSeq3 = fakeEvent({ seq: 3n });
    stream.push(liveSeq3); // the gap: 1 -> 3, expected 2
    await waitFor(() => expect(result.current).toBe('resyncing'));
    stream.push(fakeEvent({ seq: 4n })); // arrives WHILE catch-up is in flight

    resolveCatchUp({
      entries: [fakeEntry({ seq: 2n }), fakeEntry({ seq: 3n })],
    });

    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current).toBe('live'));

    expect(onEvent.mock.calls.map((call) => (call[0] as Event).seq)).toEqual([
      1n,
      2n,
      3n,
      4n,
    ]);
    // seq 2 only ever existed via catch-up — synthetic, no typed body.
    expect(onEvent.mock.calls[1][0]).toMatchObject({
      body: { case: undefined },
    });
    // seq 3 arrived on BOTH paths — the buffered LIVE copy must win, not
    // catch-up's synthetic duplicate. Asserting object IDENTITY (not just
    // equal fields) proves it's the exact instance pushed onto the live
    // stream, not a re-synthesized stand-in that merely looks the same.
    expect(onEvent.mock.calls[2][0]).toBe(liveSeq3);

    // Live delivery resumes unbuffered afterward.
    stream.push(fakeEvent({ seq: 5n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(5));
    expect(onEvent).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ seq: 5n })
    );
  });

  it('reconnects with backoff when the stream ends for a reason other than our own abort, then resumes catch-up from last+1', async () => {
    vi.useFakeTimers();
    const firstStream = manualStream();
    const secondStream = manualStream();
    hoisted.streamEventsFn
      .mockReturnValueOnce(firstStream.iterable)
      .mockReturnValueOnce(secondStream.iterable);
    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] }) // initial connect
      .mockResolvedValueOnce({ entries: [] }); // post-reconnect catch-up
    const onEvent = vi.fn();

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));

    firstStream.push(fakeEvent({ seq: 1n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    // Server closes the connection — not our own abort.
    firstStream.end();
    await vi.waitFor(() => expect(result.current).toBe('reconnecting'));
    expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000); // RECONNECT_CONFIG.initialDelayMs

    await vi.waitFor(() =>
      expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(2)
    );
    await vi.waitFor(() =>
      expect(hoisted.getStoryFn).toHaveBeenLastCalledWith(
        { session: 'enc-1', member: 'char-1', fromSeq: 2n }, // last(1) + 1
        expect.anything()
      )
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));

    secondStream.push(fakeEvent({ seq: 2n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
  });

  it('aged-out: a trimmed resume point resyncs from zero and calls onAgedOut', async () => {
    const stream = manualStream();
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    const onEvent = vi.fn();
    const onAgedOut = vi.fn();

    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] }) // initial connect
      .mockRejectedValueOnce(storyTrimmedError()); // the gap catch-up: aged out
    hoisted.getStoryFn.mockResolvedValueOnce({
      entries: [fakeEntry({ seq: 50n })],
    }); // the automatic from_seq:0 retry

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent, onAgedOut)
    );
    await waitFor(() => expect(result.current).toBe('live'));

    stream.push(fakeEvent({ seq: 1n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    stream.push(fakeEvent({ seq: 100n })); // gap far beyond retention
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(3));

    expect(hoisted.getStoryFn).toHaveBeenNthCalledWith(
      2,
      { session: 'enc-1', member: 'char-1', fromSeq: 2n },
      expect.anything()
    );
    expect(hoisted.getStoryFn).toHaveBeenNthCalledWith(
      3,
      { session: 'enc-1', member: 'char-1', fromSeq: 0n },
      expect.anything()
    );
    expect(onEvent.mock.calls.map((call) => (call[0] as Event).seq)).toEqual([
      1n,
      50n,
      100n,
    ]);
    expect(onAgedOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current).toBe('live'));
  });

  it('does not throw when the stream rejects after abort (unmount race)', async () => {
    hoisted.streamEventsFn.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) => ({
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<never>((_resolve, reject) => {
              opts.signal.addEventListener('abort', () =>
                reject(new Error('aborted'))
              );
            }),
        }),
      })
    );

    const { unmount } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', () => {})
    );
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
