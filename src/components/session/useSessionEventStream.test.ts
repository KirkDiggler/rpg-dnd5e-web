import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  streamEventsFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    streamEvents: hoisted.streamEventsFn,
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
    ...overrides,
  } as Event;
}

/** An async-iterable stream that yields the given events then ends, like
 * a server-closed StreamEvents call — mirrors how the real connect-web
 * client's async generator behaves. */
function fakeStream(events: Event[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
  };
}

beforeEach(() => {
  hoisted.streamEventsFn.mockReset();
});

describe('useSessionEventStream', () => {
  it('does not subscribe while session or member is empty', () => {
    renderHook(() => useSessionEventStream('', 'char-1', () => {}));
    renderHook(() => useSessionEventStream('enc-1', '', () => {}));
    expect(hoisted.streamEventsFn).not.toHaveBeenCalled();
  });

  it('subscribes with the given session/member and delivers each event to onEvent', async () => {
    const events = [fakeEvent({ seq: 1n }), fakeEvent({ seq: 2n })];
    hoisted.streamEventsFn.mockReturnValue(fakeStream(events));
    const onEvent = vi.fn();

    renderHook(() => useSessionEventStream('enc-1', 'char-1', onEvent));

    expect(hoisted.streamEventsFn).toHaveBeenCalledWith(
      { session: 'enc-1', member: 'char-1' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent).toHaveBeenNthCalledWith(1, events[0]);
    expect(onEvent).toHaveBeenNthCalledWith(2, events[1]);
  });

  it('aborts the stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    hoisted.streamEventsFn.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) => {
        capturedSignal = opts.signal;
        return fakeStream([]);
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

  it('does not throw when the stream rejects after abort (unmount race)', async () => {
    hoisted.streamEventsFn.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) => ({
        // A plain async-iterator object (not a generator function) — this
        // iterator never yields, only eventually rejects, and a generator
        // with no `yield` at all trips eslint's require-yield rule.
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
    // Nothing to assert beyond "this didn't crash the test run" — an
    // unhandled rejection here would fail the suite.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('re-subscribes when session/member changes', async () => {
    hoisted.streamEventsFn.mockReturnValue(fakeStream([]));
    const { rerender } = renderHook(
      ({ session, member }) => useSessionEventStream(session, member, () => {}),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );
    expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(1);

    rerender({ session: 'enc-2', member: 'char-1' });
    expect(hoisted.streamEventsFn).toHaveBeenCalledTimes(2);
    expect(hoisted.streamEventsFn).toHaveBeenLastCalledWith(
      { session: 'enc-2', member: 'char-1' },
      expect.anything()
    );
  });
});
