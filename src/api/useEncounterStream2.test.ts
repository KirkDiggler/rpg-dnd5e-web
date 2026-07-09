import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeStream, type FakeStream } from './fakeEncounterStream2';
import { RECONNECT_CONFIG } from './streamReconnect';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

function abortError(message = 'signal is aborted without reason'): Error {
  return Object.assign(new Error(message), { name: 'AbortError' });
}

// vi.hoisted allows the mock factory to use these refs even though hoisting
// runs the factory before regular imports. The wrapper object is mutable so
// beforeEach can swap the underlying stream.
const hoisted = vi.hoisted(() => {
  return {
    fakeRef: { current: null as FakeStream | null },
    // Consumed in FIFO order before falling back to fakeRef.current — lets a
    // test hand distinct streams to successive streamEncounter() calls (e.g.
    // simulating mount-churn where a second connect attempt starts before
    // the first one has torn down).
    streamQueue: [] as FakeStream[],
  };
});

vi.mock('./client', () => {
  return {
    encounterClientV2: {
      streamEncounter: vi.fn(() => {
        if (hoisted.streamQueue.length > 0) {
          return hoisted.streamQueue.shift()!.iterator;
        }
        if (!hoisted.fakeRef.current) {
          throw new Error(
            'fakeRef.current is null — test forgot to set it in beforeEach'
          );
        }
        return hoisted.fakeRef.current.iterator;
      }),
    },
  };
});

// Import the hook AFTER vi.mock so the mock is applied
import { encounterClientV2 } from './client';
import { useEncounterStream2 } from './useEncounterStream2';

let fake: FakeStream;

beforeEach(() => {
  fake = createFakeStream();
  hoisted.fakeRef.current = fake;
  hoisted.streamQueue = [];
  vi.mocked(encounterClientV2.streamEncounter).mockClear();
});

afterEach(() => {
  hoisted.fakeRef.current = null;
  hoisted.streamQueue = [];
  // Defensive: ensure fake timers don't bleed into the next test if the
  // reconnect test fails before reaching its inline vi.useRealTimers() call.
  vi.useRealTimers();
});

describe('useEncounterStream2', () => {
  it('transitions to connected after the first SnapshotDelivered', async () => {
    const onSnapshotDelivered = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onSnapshotDelivered })
    );

    expect(result.current.connectionState).toBe('connecting');

    act(() => {
      fake.push(makeEvent('snapshotDelivered', { encounter: undefined }));
    });

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });
    expect(onSnapshotDelivered).toHaveBeenCalledTimes(1);
  });

  it('dispatches subsequent events through their typed callbacks', async () => {
    const onEntityMoved = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onEntityMoved })
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
    });
    await waitFor(() =>
      expect(result.current.connectionState).toBe('connected')
    );

    act(() => {
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'alice',
          actualPath: [{ x: 0, y: 0, z: 0 }],
        })
      );
    });
    await waitFor(() => {
      expect(onEntityMoved).toHaveBeenCalledTimes(1);
    });
  });

  it('does not transition to connected before SnapshotDelivered arrives', async () => {
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.connectionState).toBe('connecting');
  });

  it('logs and continues on unknown event cases (no tear-down)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onEntityMoved = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onEntityMoved })
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
      fake.push(makeEvent('totallyUnknownCase', {}));
      fake.push(makeEvent('entityMoved', { entityId: 'a', actualPath: [] }));
    });

    await waitFor(() => {
      expect(onEntityMoved).toHaveBeenCalledTimes(1);
      expect(result.current.connectionState).toBe('connected');
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('aborts cleanly on unmount', () => {
    const { unmount, result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    expect(result.current.connectionState).toBe('connecting');
    unmount();
  });

  it('handles encounterId === null by staying idle', () => {
    const { result } = renderHook(() => useEncounterStream2(null, 'alice', {}));
    expect(result.current.connectionState).toBe('idle');
  });

  it('reconnects with exponential backoff on stream error', async () => {
    // Known: act() warnings appear here because fake.error() and
    // vi.advanceTimersByTime() wake microtasks that scheduleReconnect/connect
    // run on. The async setConnectionState calls escape the synchronous act()
    // boundary; vi.waitFor compensates. This is a known rough edge in the
    // React Testing Library + Vitest fake-timers combination, not a test bug.
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('connected')
    );

    act(() => {
      fake.error(new Error('connection lost'));
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('disconnected')
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('connecting')
    );

    vi.useRealTimers();
  });

  // #442 regression coverage: an abort landing before the consumer has
  // intentionally torn the hook down must be a reconnect case, not a
  // terminal one — and the reverse (a real unmount) must never reconnect.

  it('schedules a reconnect when the stream aborts before the first snapshot arrives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    expect(result.current.connectionState).toBe('connecting');

    // The transport aborts (AbortError/[canceled] shape from the issue)
    // without us ever having called AbortController.abort() ourselves — the
    // hook is still mounted and still wants this encounter.
    await act(async () => {
      fake.error(abortError());
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('disconnected')
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_CONFIG.initialDelayMs);
    });
    await vi.waitFor(() => {
      expect(result.current.connectionState).toBe('connecting');
    });
    expect(
      vi.mocked(encounterClientV2.streamEncounter).mock.calls
    ).toHaveLength(2);

    vi.useRealTimers();
  });

  it('does not schedule a reconnect when unmounted before the first snapshot arrives', async () => {
    vi.useFakeTimers();
    const { unmount, result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    expect(result.current.connectionState).toBe('connecting');

    unmount();

    // The transport notices our own teardown abort() and rejects — this
    // must resolve as "nobody wants this anymore," not a reconnect.
    await act(async () => {
      fake.error(abortError());
      await vi.advanceTimersByTimeAsync(RECONNECT_CONFIG.maxDelayMs + 1000);
    });

    expect(
      vi.mocked(encounterClientV2.streamEncounter).mock.calls
    ).toHaveLength(1);

    vi.useRealTimers();
  });

  it('a superseded connection from mount-churn never re-arms its own reconnect and does not disrupt the live one', async () => {
    // Models the actual #442 race on the same hook instance (shared refs):
    // an effect re-run tears the first connect() attempt down and starts a
    // second one immediately — the same shape React StrictMode's dev
    // double-invoke produces on mount. The first attempt's underlying
    // transport notices the abort and rejects *after* the second attempt is
    // already live, so any handler reading the shared abortControllerRef at
    // that point sees the second attempt's controller, not its own.
    vi.useFakeTimers();
    const first = createFakeStream();
    const second = createFakeStream();
    hoisted.streamQueue = [first, second];

    const { result, rerender } = renderHook(
      ({ playerId }: { playerId: string }) =>
        useEncounterStream2('enc-1', playerId, {}),
      { initialProps: { playerId: 'alice' } }
    );
    rerender({ playerId: 'bob' });

    // Both connect() attempts fired synchronously (churn), and only the
    // second is still live.
    expect(hoisted.streamQueue).toHaveLength(0);
    expect(
      vi.mocked(encounterClientV2.streamEncounter).mock.calls
    ).toHaveLength(2);

    // The stale first attempt's belated rejection must not touch state or
    // arm a zombie reconnect that would clobber the live (second) stream.
    await act(async () => {
      first.error(abortError());
      await vi.advanceTimersByTimeAsync(RECONNECT_CONFIG.maxDelayMs + 1000);
    });
    expect(
      vi.mocked(encounterClientV2.streamEncounter).mock.calls
    ).toHaveLength(2); // no 3rd, zombie call from the stale attempt

    // The live (second) attempt is unaffected and still reaches 'connected'.
    act(() => {
      second.push(makeEvent('snapshotDelivered', {}));
    });
    await vi.waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    vi.useRealTimers();
  });
});
