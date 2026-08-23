/**
 * useSessionEventStream — subscribes to `SessionService.StreamEvents` for a
 * session/member pair, for the component's lifetime, and hands each `Event`
 * to the caller's `onEvent` — now with design rule 6 built in (rpg-project
 * #257 slice 3, rpg-dnd5e-web#779): last-`seq` tracking, reconnect with
 * backoff, and `GetStory` catch-up on any (re)connect or observed gap.
 *
 * Still deliberately dumb about MEANING: this hook does not interpret
 * `Event.kind` or decode `Event.payload` (see `events_pb.ts`'s own doc
 * comment) — it owns the connection's DELIVERY GUARANTEE (every seq, once,
 * in order), not what any beat means. `SessionEncounterView`'s own
 * `MOVED -> refetch GetWhere` policy and `useCombatPanel`'s beat-line
 * formatting still live at the CALL SITE, unchanged by this slice.
 *
 * # Why a stream needs a resync partner at all
 *
 * `StreamEvents`' own doc comment is explicit that delivery is best-effort
 * and the stream carries no replay obligation (design rule 6) — a dropped
 * connection, a server restart, or a plain missed frame all look the same
 * to a subscriber: nothing arrived. `GetStory{from_seq}` is the resync
 * source of truth, and `Event.seq` (monotonic, gapless, never renumbered)
 * is what tells a client it needs one. Before this slice, this hook had
 * "no reconnect behavior... a stream that ends just stops delivering
 * events" — Kirk's slice-2 walk (2026-08-23, issue #779) found exactly
 * this: a skeleton's `struck` beats were in the story log and never
 * narrated, because the toolkit's publish path is proven whole
 * (rpg-toolkit#1203) but nothing on this side noticed the gap.
 *
 * # The three states this hook reports
 *
 * `'live'` — the stream is open and delivering (or nothing has gone wrong
 * yet). `'resyncing'` — a `GetStory` catch-up is in flight, whether from
 * the very first connect (this client holds nothing yet), a reconnect
 * after a drop, a mid-stream gap, or an aged-out resync-from-zero.
 * `'reconnecting'` — the live connection itself is down and a backoff
 * timer is pending before the next attempt. Exposed for #740's debug log
 * header — a raw event feed is the wrong place to bury "by the way, six
 * seconds of this are reconstructed, not lived."
 *
 * # EVERY (re)connect starts with a catch-up, not just a genuine reconnect
 *
 * `lastSeq` starts `null` ("I hold nothing" — `GetStoryRequest.from_seq`'s
 * own doc: "Zero means I hold nothing, send what you have"), so the very
 * first connect also runs `GetStory{from_seq: 0}` before trusting the live
 * stream — a session can already have beats on it the moment this
 * component mounts (a fresh page load mid-session, a character switch),
 * and without this the first paint would silently start from whatever the
 * stream happens to deliver AFTER subscribing, not from the truth. Every
 * later (re)connect resumes from `lastSeq + 1` instead, and a mid-stream
 * gap (`event.seq !== lastSeq + 1`) runs the identical catch-up without
 * tearing down the live connection at all — see `connect`'s inner
 * `runCatchUp` below, called from three places (initial/reconnect, gap,
 * aged-out-retry) for exactly this reason: one rule, three triggers.
 *
 * # Buffering — the live stream and the catch-up call genuinely race
 *
 * The live `StreamEvents` connection and a `GetStory` catch-up run
 * CONCURRENTLY (neither `await`s the other) — deliberately: the
 * connect-web transport can already have frames decoded and queued by the
 * time catch-up resolves, and a gap-triggered catch-up runs while the SAME
 * still-open stream keeps receiving. `buffering` (a plain closure
 * variable, not React state — this is delivery-order bookkeeping, not
 * anything a render should react to) gates the pump loop: while `true`,
 * every live event is pushed to `buffer` instead of reaching `onEvent`.
 * Once catch-up resolves, its entries are delivered first (through the
 * SAME `deliver` path — see below), then the buffer drains in arrival
 * order, de-duped against the seq catch-up already covered, and only then
 * does live delivery resume unbuffered. This is what "feed the returned
 * entries through the SAME onEvent path in order... before resuming live
 * delivery" (issue #779) means operationally.
 *
 * # Catch-up entries are the same `Event` shape as live ones
 *
 * `GetStoryResponse.entries` is `repeated Event` (rpg-api-protos#239/#240,
 * v0.1.135) — the exact message `StreamEvents` projects, kind and typed
 * `body` and all, not a lossier stand-in this hook has to special-case.
 * rpg-api's `GetStory` handler runs each stored beat through the SAME
 * converter the live stream uses (rpg-toolkit session v0.23.0), so a
 * client catching up after a gap sees exactly what it would have received
 * live, seq for seq — no second, lossier projection to reconcile. This
 * hook used to synthesize its own `Event` with `kind: EventKind.UNKNOWN`
 * from the old `StoryEntry`'s untyped `payload` blob (`storyEntryToEvent`,
 * deleted by issue #785, along with the "prefer the buffered live copy
 * over catch-up's synthetic one" precedence special case that used to live
 * in `applyCatchUpEntries` below) — that workaround is gone because the
 * server-side gap it covered for is gone. `EventKind.UNKNOWN` can still
 * arrive on the wire (see its own doc comment), but it is now always a
 * genuine server signal for "a beat this client cannot type," never
 * something this hook manufactures.
 *
 * # Aged-out
 *
 * `session.ErrStoryTrimmed` means the requested resume point has fallen
 * out of the retention window. NOTE: `service.proto`'s own doc comment
 * says this arrives as `NOT_FOUND` — the ACTUAL mapping, per rpg-api's
 * tested `errors.go` translation table (design rule 7, the one place any
 * SDK sentinel maps to a gRPC code), is `OUT_OF_RANGE`. Git wins over
 * prose (this repo's own bootloader rule) — this hook matches the real
 * `errors.go` table, the same "code AND exact sentinel text" discipline
 * `moveErrorMessage.ts`'s `isNotYourTurnError` already uses, not the stale
 * doc comment. On it, this hook resyncs from zero (`from_seq: 0`, always
 * answerable) and calls the caller's `onAgedOut` — issue #779's own "resync
 * from zero + refetch View/Turn/Afford," which only the caller can own
 * (it already owns every other refetch trigger — see
 * `SessionEncounterView`'s own doc comment).
 */
import { sessionClient } from '@/api/client';
import { Code, ConnectError } from '@connectrpc/connect';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { useEffect, useRef, useState } from 'react';
import { RECONNECT_CONFIG } from '../../api/streamReconnect';

/** `live` — delivering (or nothing has gone wrong). `reconnecting` — the
 * connection is down, a backoff timer is pending. `resyncing` — a
 * `GetStory` catch-up is in flight. See module doc comment. */
export type SessionStreamState = 'live' | 'reconnecting' | 'resyncing';

/** `session.ErrStoryTrimmed`'s wire text (rpg-toolkit
 * `rulebooks/dnd5e/session/errors.go`) — see module doc comment on why
 * this checks `OUT_OF_RANGE`, not the `NOT_FOUND` `service.proto` itself
 * documents. */
const STORY_TRIMMED_SENTINEL_TEXT = 'story range trimmed';

function isStoryTrimmedError(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.OutOfRange &&
    connectErr.rawMessage.includes(STORY_TRIMMED_SENTINEL_TEXT)
  );
}

export function useSessionEventStream(
  session: string,
  member: string,
  onEvent: (event: Event) => void,
  /** Fires exactly on the aged-out path, after the from-zero resync has
   * already been applied — the caller's own View/Turn/Afford refetch,
   * issue #779's "resync from zero + refetch View/Turn/Afford." Optional:
   * a caller with nothing else to resync (a test harness, say) may omit
   * it. */
  onAgedOut?: () => void
): SessionStreamState {
  // Read through refs so an inline closure caller doesn't tear down and
  // rebuild the whole connection on every render — same idiom this hook
  // already used for `onEvent` pre-rule-6.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onAgedOutRef = useRef(onAgedOut);
  onAgedOutRef.current = onAgedOut;

  const [state, setState] = useState<SessionStreamState>('live');

  useEffect(() => {
    if (!session || !member) {
      setState('live');
      return;
    }

    // Effect-scoped (not React state, no ref needed) — plain closure
    // variables shared across every connect() attempt for this
    // session/member pair, exactly like `useEncounterStream`'s
    // `retryCountRef`. `lastSeq` is the one thing that must SURVIVE a
    // reconnect (that's the whole point of resuming from `lastSeq + 1`
    // instead of zero); `buffering`/`buffer` are reset fresh at the top of
    // every connect() attempt instead, since a new attempt starts a new
    // race between its own stream and its own initial catch-up.
    //
    // `generation` is the same idea as `useEncounterStream`'s
    // `generationRef`, minus the ref: nothing here needs to survive PAST
    // this effect's own teardown (a session/member change or unmount tears
    // the whole closure down and a fresh effect run gets its own fresh
    // `generation` starting at 0), so a plain closure variable, bumped by
    // BOTH every connect() attempt and the cleanup below, is enough to let
    // a superseded attempt's async continuations recognize they're stale
    // and no-op — without a `useRef` there is nothing for
    // react-hooks/exhaustive-deps to warn about "changing before cleanup
    // runs."
    let lastSeq: bigint | null = null;
    let attempt = 0;
    let buffering = false;
    let buffer: Event[] = [];
    let abortController: AbortController | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    const deliver = (event: Event) => {
      lastSeq = event.seq;
      onEventRef.current(event);
    };

    const connect = () => {
      const myGeneration = ++generation;
      // Set the INSTANT this attempt decides to give up (inside
      // `scheduleReconnect`, below) — not just when a LATER attempt's
      // `connect()` call eventually bumps `generation`. Copilot review
      // (PR #783): `scheduleReconnect` only ARMS a timer; the actual next
      // `connect()` doesn't run, and `generation` doesn't change, until
      // that timer fires. A `runCatchUp` already in flight at the moment
      // the stream drops sits in that window — checking `generation`
      // alone let it resolve successfully afterward and call
      // `setState('live')` / reset `attempt` to 0 while the hook was
      // genuinely mid-backoff, both lying to the caller (a debug log
      // reading 'live' from a stream that IS reconnecting) and silently
      // discarding the backoff schedule (the NEXT failure would then
      // compute its delay from `attempt` 0 again instead of continuing
      // the exponential climb). Folding this into `isCurrent` closes the
      // window: every one of THIS attempt's async continuations —
      // `runCatchUp` included — stops trusting its own results the
      // moment `scheduleReconnect` runs, not only once a new attempt
      // actually starts.
      let superseded = false;
      const isCurrent = () => generation === myGeneration && !superseded;
      const controller = new AbortController();
      abortController = controller;

      const scheduleReconnect = () => {
        if (!isCurrent()) return;
        superseded = true;
        setState('reconnecting');
        if (attempt >= RECONNECT_CONFIG.maxAttempts) {
          // Out of attempts — stay 'reconnecting' rather than inventing a
          // fourth state; a stalled reconnect is still "not live," which
          // is the fact this hook's state exists to carry (issue #779 asks
          // for an honest indicator, not a give-up UI).
          return;
        }
        const delay = Math.min(
          RECONNECT_CONFIG.initialDelayMs *
            RECONNECT_CONFIG.backoffMultiplier ** attempt,
          RECONNECT_CONFIG.maxDelayMs
        );
        attempt++;
        retryTimeout = setTimeout(connect, delay);
      };

      const applyCatchUpEntries = (entries: Event[]) => {
        // GetStoryResponse's entries arrive oldest-first, same order
        // StreamEvents itself delivers — the SAME typed `Event` shape, fed
        // through the SAME `deliver` path live events use, in order,
        // de-duped against what this connection has already seen.
        //
        // `from_seq` has no upper bound, so a catch-up commonly returns
        // entries the live stream ALSO already delivered while the RPC was
        // in flight (that is exactly what got buffered) — those duplicates
        // are caught here by the `seq <= lastSeq` check, and the matching
        // buffered copies are caught by the identical check in
        // `drainBuffer` below once `lastSeq` has advanced past them. No
        // precedence question between the two: catch-up and live are the
        // same typed `Event`, so whichever copy is skipped loses nothing.
        for (const entry of entries) {
          if (lastSeq !== null && entry.seq <= lastSeq) continue;
          deliver(entry);
        }
      };

      const drainBuffer = () => {
        const pending = buffer;
        buffer = [];
        buffering = false;
        for (const event of pending) {
          if (lastSeq !== null && event.seq <= lastSeq) continue;
          deliver(event);
        }
      };

      // Runs one GetStory catch-up, called from three places below:
      // this connect() attempt's own start (initial connect or a genuine
      // reconnect), a mid-stream gap, and — recursively, via the
      // aged-out branch — the mandatory from-zero resync. Only ONE ever
      // runs at a time per attempt: while `buffering` is true, the pump
      // loop below routes every event to `buffer` instead of evaluating
      // gaps, so a second trigger can't fire until this one has drained.
      const runCatchUp = async (fromSeq: bigint) => {
        setState('resyncing');
        let response;
        try {
          response = await sessionClient.getStory(
            { session, member, fromSeq },
            { signal: controller.signal }
          );
        } catch (err) {
          if (!isCurrent()) return;
          if (!isStoryTrimmedError(err)) {
            // A real connection problem, not a resync question — abandon
            // this attempt and fall back to the stream-level
            // reconnect/backoff path exactly as a dropped stream would.
            controller.abort();
            scheduleReconnect();
            return;
          }
          try {
            response = await sessionClient.getStory(
              { session, member, fromSeq: 0n },
              { signal: controller.signal }
            );
          } catch {
            if (!isCurrent()) return;
            // Even the always-answerable from_seq:0 call failed.
            controller.abort();
            scheduleReconnect();
            return;
          }
          if (!isCurrent()) return;
          onAgedOutRef.current?.();
        }
        if (!isCurrent()) return;
        applyCatchUpEntries(response.entries);
        drainBuffer();
        if (!isCurrent()) return;
        attempt = 0; // a successful catch-up IS "we're connected again"
        setState('live');
      };

      buffering = true;
      buffer = [];

      // Not awaited — runs CONCURRENTLY with the initial catch-up call
      // below. See module doc comment "the live stream and the catch-up
      // call genuinely race."
      void (async () => {
        try {
          for await (const event of sessionClient.streamEvents(
            { session, member },
            { signal: controller.signal }
          )) {
            if (!isCurrent()) return;
            if (buffering) {
              buffer.push(event);
              continue;
            }
            if (lastSeq !== null && event.seq !== lastSeq + 1n) {
              buffer.push(event);
              buffering = true;
              void runCatchUp(lastSeq + 1n);
              continue;
            }
            deliver(event);
          }
          if (!isCurrent() || controller.signal.aborted) return;
          // Stream closed by server or network drop, not our own abort.
          scheduleReconnect();
        } catch {
          if (!isCurrent() || controller.signal.aborted) return;
          scheduleReconnect();
        }
      })();

      void runCatchUp(lastSeq === null ? 0n : lastSeq + 1n);
    };

    connect();

    return () => {
      generation++; // invalidate any in-flight attempt
      abortController?.abort();
      clearTimeout(retryTimeout);
    };
  }, [session, member]);

  return state;
}
