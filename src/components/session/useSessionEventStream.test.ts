import { Code, ConnectError } from '@connectrpc/connect';
import {
  EventKind,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECONNECT_CONFIG } from '../../api/streamReconnect';

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
import {
  STORY_RECOVERY_INTERVAL_MS,
  useSessionEventStream,
} from './useSessionEventStream';

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

  it('on the very first connect, catches up from zero before trusting live delivery, then delivers GetStory entries straight through — the same typed Event shape live delivery uses, not a reconstructed stand-in', async () => {
    const catchUpEvent = fakeEvent({ seq: 1n, kind: EventKind.DOWNED });
    hoisted.getStoryFn.mockResolvedValueOnce({
      entries: [catchUpEvent],
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
    // Straight through — the exact object GetStory returned, typed body
    // and all (rpg-api-protos v0.1.135: GetStoryResponse.entries is
    // `repeated Event`, the same message StreamEvents sends), not a
    // synthesized stand-in.
    expect(onEvent.mock.calls[0][0]).toBe(catchUpEvent);
    expect(onEvent.mock.calls[0][1]).toEqual({ source: 'catchup' });
    await waitFor(() => expect(result.current).toBe('live'));

    stream.push(fakeEvent({ seq: 2n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ seq: 2n }),
      { source: 'live' }
    );
  });

  it('gap detection: a mid-stream seq jump triggers GetStory catch-up, buffers concurrent live events, and delivers everything in order, de-duped by seq', async () => {
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
    let resolveCatchUp!: (v: { entries: Event[] }) => void;
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

    // A real GetStory answer has no upper bound, so this covers BOTH the
    // genuine gap (seq 2) and a seq (3) the live stream ALSO already
    // delivered while the RPC was in flight.
    const catchUpSeq2 = fakeEvent({ seq: 2n });
    const catchUpSeq3 = fakeEvent({ seq: 3n });
    resolveCatchUp({ entries: [catchUpSeq2, catchUpSeq3] });

    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current).toBe('live'));

    expect(onEvent.mock.calls.map((call) => (call[0] as Event).seq)).toEqual([
      1n,
      2n,
      3n,
      4n,
    ]);
    expect(onEvent.mock.calls.map((call) => call[1])).toEqual([
      { source: 'live' },
      { source: 'catchup' },
      { source: 'catchup' },
      { source: 'live' },
    ]);
    // Catch-up entries are ordinary typed Events now (rpg-api-protos
    // v0.1.135) — delivered straight through, object identity intact.
    expect(onEvent.mock.calls[1][0]).toBe(catchUpSeq2);
    // seq 3 arrived on BOTH paths. applyCatchUpEntries runs BEFORE
    // drainBuffer, so the catch-up's own copy is delivered first and the
    // buffered live duplicate is then skipped by drainBuffer's identical
    // `seq <= lastSeq` check — there is no synthetic-vs-typed precedence
    // to arbitrate anymore (both are the same Event shape), just this
    // ordering. Asserting identity against the catch-up copy (and NOT the
    // live one) pins down which survives, so a regression that silently
    // drops the gap catch-up's own results doesn't slip by unnoticed.
    expect(onEvent.mock.calls[2][0]).toBe(catchUpSeq3);
    expect(onEvent.mock.calls[2][0]).not.toBe(liveSeq3);

    // Live delivery resumes unbuffered afterward.
    stream.push(fakeEvent({ seq: 5n }));
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(5));
    expect(onEvent).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ seq: 5n }),
      { source: 'live' }
    );
  });

  it('a catch-up that resolves AFTER the stream has already ended must not report live or reset backoff (Copilot review, PR #783)', async () => {
    vi.useFakeTimers();
    const firstStream = manualStream();
    const secondStream = manualStream();
    hoisted.streamEventsFn
      .mockReturnValueOnce(firstStream.iterable)
      .mockReturnValueOnce(secondStream.iterable);

    // The initial connect's own catch-up — deliberately left pending so
    // the test can resolve it AFTER the stream has already ended, the
    // exact race Copilot's review found: `generation` alone doesn't
    // change until the SCHEDULED reconnect's connect() call actually
    // fires, so a stale catch-up resolving in the gap between
    // `scheduleReconnect` arming its timer and that timer firing used to
    // slip past the old `isCurrent()` check.
    let resolveStaleCatchUp!: (v: {
      entries: ReturnType<typeof fakeEvent>[];
    }) => void;
    hoisted.getStoryFn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStaleCatchUp = resolve;
        })
    );

    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );
    await vi.waitFor(() => expect(result.current).toBe('resyncing'));

    // The server closes the connection while that catch-up is STILL
    // in flight — not our own abort.
    firstStream.end();
    await vi.waitFor(() => expect(result.current).toBe('reconnecting'));

    // NOW the stale catch-up resolves, with a real entry it would
    // otherwise have delivered.
    resolveStaleCatchUp({ entries: [fakeEvent({ seq: 5n })] });
    await vi.advanceTimersByTimeAsync(0);

    // Must NOT have flipped back to 'live', and must NOT have delivered
    // the stale entry — both would misrepresent a hook that is genuinely
    // mid-backoff as connected.
    expect(result.current).toBe('reconnecting');
    expect(onEvent).not.toHaveBeenCalled();

    // The scheduled reconnect still runs its OWN fresh catch-up rather
    // than trusting the stale one — and since nothing was ever actually
    // delivered (the stale entry was correctly discarded), it resumes
    // from zero, not from seq 5.
    hoisted.getStoryFn.mockResolvedValueOnce({ entries: [] });
    await vi.advanceTimersByTimeAsync(RECONNECT_CONFIG.initialDelayMs);

    await vi.waitFor(() =>
      expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(2)
    );
    expect(hoisted.getStoryFn).toHaveBeenLastCalledWith(
      { session: 'enc-1', member: 'char-1', fromSeq: 0n },
      expect.anything()
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));

    secondStream.push(fakeEvent({ seq: 1n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
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
      entries: [fakeEvent({ seq: 50n })],
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
    expect(onEvent.mock.calls.map((call) => call[1])).toEqual([
      { source: 'live' },
      { source: 'catchup' },
      { source: 'live' },
    ]);
    expect(onAgedOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current).toBe('live'));
  });

  it('recovers the last dropped event within five seconds without a later stream frame, exactly once', async () => {
    vi.useFakeTimers();
    const stream = manualStream();
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    const dropped = fakeEvent({ seq: 8n });
    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] })
      .mockResolvedValue({ entries: [dropped] });
    const onEvent = vi.fn();

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));

    stream.push(fakeEvent({ seq: 7n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(STORY_RECOVERY_INTERVAL_MS);
    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith(dropped, { source: 'catchup' })
    );

    await vi.advanceTimersByTimeAsync(STORY_RECOVERY_INTERVAL_MS);
    expect(
      onEvent.mock.calls.filter(([value]) => (value as Event).seq === 8n)
    ).toHaveLength(1);
  });

  it('runs an immediate catch-up when the window focuses', async () => {
    vi.useFakeTimers();
    const stream = manualStream();
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    const focusedEntry = fakeEvent({ seq: 2n });
    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] })
      .mockResolvedValueOnce({ entries: [focusedEntry] });
    const onEvent = vi.fn();

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent)
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));
    stream.push(fakeEvent({ seq: 1n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new globalThis.Event('focus'));
    await vi.advanceTimersByTimeAsync(0);

    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith(focusedEntry, {
        source: 'catchup',
      })
    );
    expect(hoisted.getStoryFn).toHaveBeenLastCalledWith(
      { session: 'enc-1', member: 'char-1', fromSeq: 2n },
      expect.anything()
    );
  });

  it('runs an immediate catch-up when the document becomes visible and restores the visibility descriptor', async () => {
    vi.useFakeTimers();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState'
    );
    const setVisibility = (value: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value,
      });
    };

    try {
      setVisibility('hidden');
      const stream = manualStream();
      hoisted.streamEventsFn.mockReturnValue(stream.iterable);
      const visibleEntry = fakeEvent({ seq: 2n });
      hoisted.getStoryFn
        .mockResolvedValueOnce({ entries: [] })
        .mockResolvedValueOnce({ entries: [visibleEntry] });
      const onEvent = vi.fn();

      const { result } = renderHook(() =>
        useSessionEventStream('enc-1', 'char-1', onEvent)
      );
      await vi.waitFor(() => expect(result.current).toBe('live'));
      stream.push(fakeEvent({ seq: 1n }));
      await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

      setVisibility('visible');
      document.dispatchEvent(new globalThis.Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      await vi.waitFor(() =>
        expect(onEvent).toHaveBeenCalledWith(visibleEntry, {
          source: 'catchup',
        })
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
      } else {
        delete (document as unknown as { visibilityState?: string })
          .visibilityState;
      }
    }
  });

  it('serializes interval, focus, and visibility catch-ups while one recovery is active', async () => {
    vi.useFakeTimers();
    const stream = manualStream();
    let resolveRecovery!: (value: { entries: Event[] }) => void;
    const pending = new Promise<{ entries: Event[] }>((resolve) => {
      resolveRecovery = resolve;
    });
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] })
      .mockReturnValueOnce(pending)
      .mockResolvedValue({ entries: [] });

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', () => {})
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));

    await vi.advanceTimersByTimeAsync(STORY_RECOVERY_INTERVAL_MS);
    await vi.waitFor(() => expect(result.current).toBe('resyncing'));
    expect(hoisted.getStoryFn).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new globalThis.Event('focus'));
    document.dispatchEvent(new globalThis.Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(STORY_RECOVERY_INTERVAL_MS);
    expect(hoisted.getStoryFn).toHaveBeenCalledTimes(2);

    resolveRecovery({ entries: [] });
    await vi.waitFor(() => expect(result.current).toBe('live'));

    window.dispatchEvent(new globalThis.Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(hoisted.getStoryFn).toHaveBeenCalledTimes(3));
  });

  it('retries a trimmed interval recovery from zero, marks recovered entries catch-up, then invokes onAgedOut', async () => {
    vi.useFakeTimers();
    const stream = manualStream();
    const recovered = fakeEvent({ seq: 8n });
    hoisted.streamEventsFn.mockReturnValue(stream.iterable);
    hoisted.getStoryFn
      .mockResolvedValueOnce({ entries: [] })
      .mockRejectedValueOnce(storyTrimmedError())
      .mockResolvedValueOnce({ entries: [recovered] });
    const onEvent = vi.fn();
    const onAgedOut = vi.fn();

    const { result } = renderHook(() =>
      useSessionEventStream('enc-1', 'char-1', onEvent, onAgedOut)
    );
    await vi.waitFor(() => expect(result.current).toBe('live'));
    stream.push(fakeEvent({ seq: 7n }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(STORY_RECOVERY_INTERVAL_MS);
    await vi.waitFor(() => expect(onAgedOut).toHaveBeenCalledTimes(1));

    expect(hoisted.getStoryFn).toHaveBeenNthCalledWith(
      2,
      { session: 'enc-1', member: 'char-1', fromSeq: 8n },
      expect.anything()
    );
    expect(hoisted.getStoryFn).toHaveBeenNthCalledWith(
      3,
      { session: 'enc-1', member: 'char-1', fromSeq: 0n },
      expect.anything()
    );
    expect(onEvent).toHaveBeenCalledWith(recovered, { source: 'catchup' });
    expect(onAgedOut.mock.invocationCallOrder[0]).toBeGreaterThan(
      onEvent.mock.invocationCallOrder[1] ?? 0
    );
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
