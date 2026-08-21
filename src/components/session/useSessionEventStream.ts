/**
 * useSessionEventStream — subscribes to `SessionService.StreamEvents` for
 * a session/member pair, for the component's lifetime, and hands each
 * `Event` to the caller's `onEvent`.
 *
 * Deliberately dumb: this hook does not interpret `Event.kind` or decode
 * `Event.payload` (opaque passthrough — see `events_pb.ts`'s own doc
 * comment). It exists only to own the connection lifecycle — mirrors
 * `SessionTombConcept.tsx`'s `toggleStream` loop (`for await` over the
 * async iterable, `AbortController` to unsubscribe) but runs automatically
 * for as long as `session`/`member` are non-empty rather than being a
 * user-toggled button, and has no "reconnect" behavior: a stream that ends
 * (server close, network drop) just stops delivering events until this
 * hook's inputs change and the effect re-runs. `SessionEncounterView`'s own
 * `MOVED -> refetch GetWhere` policy lives at the CALL SITE, not here, so a
 * different consumer of the same stream (a future combat-log view, say)
 * can react to different kinds without this hook growing a branch per
 * caller.
 */
import { sessionClient } from '@/api/client';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { useEffect, useRef } from 'react';

export function useSessionEventStream(
  session: string,
  member: string,
  onEvent: (event: Event) => void
): void {
  // Read through a ref so a caller passing an inline closure doesn't
  // re-subscribe the stream on every render — the effect's dependency
  // list tracks session/member (the actual subscription identity), not
  // this callback's.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!session || !member) return;
    const ctrl = new AbortController();

    void (async () => {
      try {
        for await (const event of sessionClient.streamEvents(
          { session, member },
          { signal: ctrl.signal }
        )) {
          onEventRef.current(event);
        }
      } catch {
        // A server-initiated close or a network drop both surface here.
        // Neither is a crash: an aborted-by-us signal is the expected
        // unmount path (silent); anything else just means events stop
        // arriving until the next mount/session change re-subscribes —
        // there is no reconnect loop in this slice.
        if (!ctrl.signal.aborted) {
          // Nothing to do — see module doc comment. Swallowed rather than
          // rethrown so an unhandled rejection doesn't crash the tree.
        }
      }
    })();

    return () => ctrl.abort();
  }, [session, member]);
}
