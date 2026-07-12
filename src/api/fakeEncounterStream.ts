import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';

/**
 * Test helper: an async iterable that yields events from a controllable queue.
 * Use to simulate a server-streaming gRPC response in tests without real network.
 *
 * Pattern:
 *   const stream = createFakeStream();
 *   stream.push(makeEvent('snapshotDelivered', {}));
 *   stream.push(makeEvent('entityMoved', { ... }));
 *   stream.close();   // signals end-of-stream
 *   stream.error(new Error('boom'));   // simulates transport error
 *   stream.reset();   // drop pending state for next test
 */
export interface FakeStream {
  iterator: AsyncIterable<EncounterEvent>;
  push: (event: EncounterEvent) => void;
  close: () => void;
  error: (err: Error) => void;
  reset: () => void;
}

export function createFakeStream(): FakeStream {
  let queue: EncounterEvent[] = [];
  let closed = false;
  let pendingError: Error | null = null;
  let resolve: ((v: void) => void) | null = null;

  const wakeup = () => {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };

  const iterator: AsyncIterable<EncounterEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<EncounterEvent>> {
          while (queue.length === 0 && !closed && !pendingError) {
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
          if (pendingError) {
            const e = pendingError;
            pendingError = null;
            throw e;
          }
          if (queue.length > 0) {
            return { value: queue.shift()!, done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };

  return {
    iterator,
    push(event) {
      queue.push(event);
      wakeup();
    },
    close() {
      closed = true;
      wakeup();
    },
    error(err) {
      pendingError = err;
      wakeup();
    },
    reset() {
      queue = [];
      closed = false;
      pendingError = null;
      // Don't wake current waiters — they'd see done:true incorrectly.
      // Each test should construct its own stream via vi.hoisted (see hook tests).
    },
  };
}
