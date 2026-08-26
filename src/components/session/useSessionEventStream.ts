/**
 * One delivery sequencer for SessionService.StreamEvents and GetStory.
 *
 * Stream frames and recovery entries share the same monotonic, gap-aware
 * sequencer. Initial, reconnect, observed-gap, interval, focus, and visibility
 * recovery all enter one serialized catch-up lane. Live frames arriving while
 * that lane is active are buffered and retain live provenance when drained.
 * The hook interprets no event payload and calculates no game rules.
 */
import { sessionClient } from '@/api/client';
import { Code, ConnectError } from '@connectrpc/connect';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { useEffect, useRef, useState } from 'react';
import { RECONNECT_CONFIG } from '../../api/streamReconnect';

export const STORY_RECOVERY_INTERVAL_MS = 5000;
/**
 * How long a reconnect gives an aborted GetStory transport to release the
 * physical recovery lane before allowing the newer generation to proceed.
 */
export const STORY_RECOVERY_ABORT_GRACE_MS = 250;

export type SessionStreamState = 'live' | 'reconnecting' | 'resyncing';

export interface SessionEventDeliveryMetadata {
  source: 'live' | 'catchup';
}

const LIVE_DELIVERY: SessionEventDeliveryMetadata = Object.freeze({
  source: 'live',
});
const CATCHUP_DELIVERY: SessionEventDeliveryMetadata = Object.freeze({
  source: 'catchup',
});

/** `session.ErrStoryTrimmed`'s tested wire mapping and sentinel text. */
const STORY_TRIMMED_SENTINEL_TEXT = 'story range trimmed';

function isStoryTrimmedError(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.OutOfRange &&
    connectErr.rawMessage.includes(STORY_TRIMMED_SENTINEL_TEXT)
  );
}

interface BufferedDelivery {
  event: Event;
  metadata: SessionEventDeliveryMetadata;
}

interface StreamAttempt {
  generation: number;
  controller: AbortController;
  superseded: boolean;
  buffering: boolean;
  buffer: BufferedDelivery[];
  recovery: Promise<void> | null;
  trailingRecovery: boolean;
  requestRecovery: () => Promise<void>;
}

interface RecoveryLock {
  attempt: StreamAttempt;
  operation: Promise<void>;
}

interface AbortGraceWait {
  timeout: ReturnType<typeof setTimeout>;
  release: () => void;
}

type DeliveryResult = 'delivered' | 'duplicate' | 'gap';

export function useSessionEventStream(
  session: string,
  member: string,
  onEvent: (event: Event, metadata: SessionEventDeliveryMetadata) => void,
  /** Called after an ErrStoryTrimmed recovery has been successfully applied. */
  onAgedOut?: () => void
): SessionStreamState {
  // Callback identity must not tear down a session/member connection.
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

    let disposed = false;
    let generation = 0;
    let lastSeq: bigint | null = null;
    let reconnectAttempt = 0;
    let activeAttempt: StreamAttempt | null = null;
    let recoveryLock: RecoveryLock | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    const abortGraceWaits = new Set<AbortGraceWait>();

    const isCurrent = (attempt: StreamAttempt) =>
      !disposed &&
      activeAttempt === attempt &&
      attempt.generation === generation &&
      !attempt.superseded;

    /** The single gap-aware seq deduper used by both delivery sources. */
    const deliver = (
      event: Event,
      metadata: SessionEventDeliveryMetadata
    ): DeliveryResult => {
      if (lastSeq !== null) {
        if (event.seq <= lastSeq) return 'duplicate';
        if (event.seq !== lastSeq + 1n) return 'gap';
      }
      lastSeq = event.seq;
      onEventRef.current(event, metadata);
      return 'delivered';
    };

    const releaseAbortGraceWait = (wait: AbortGraceWait) => {
      clearTimeout(wait.timeout);
      abortGraceWaits.delete(wait);
      wait.release();
    };

    const waitForRecoveryPredecessor = async (
      predecessor: RecoveryLock | null,
      successor: StreamAttempt
    ) => {
      if (!predecessor || predecessor.attempt === successor) return;

      let release!: () => void;
      const grace = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wait: AbortGraceWait = {
        timeout: setTimeout(release, STORY_RECOVERY_ABORT_GRACE_MS),
        release,
      };
      abortGraceWaits.add(wait);
      try {
        // A compliant Connect transport settles promptly when its predecessor
        // is aborted. If it violates abort, bounded grace permits physical RPC
        // overlap as a fail-safe so reconnect cannot hang forever. Generation
        // fencing below still keeps logical application strictly serialized:
        // the superseded predecessor can never publish its late result.
        await Promise.race([predecessor.operation, grace]);
      } finally {
        releaseAbortGraceWait(wait);
      }
    };

    const connect = () => {
      if (disposed) return;
      const attempt: StreamAttempt = {
        generation: ++generation,
        controller: new AbortController(),
        superseded: false,
        buffering: true,
        buffer: [],
        recovery: null,
        trailingRecovery: false,
        requestRecovery: () => Promise.resolve(),
      };
      activeAttempt = attempt;

      const scheduleReconnect = () => {
        if (!isCurrent(attempt)) return;
        // Invalidate every continuation immediately, not only when the
        // backoff timer eventually creates its successor.
        attempt.superseded = true;
        attempt.controller.abort();
        setState('reconnecting');

        if (reconnectAttempt >= RECONNECT_CONFIG.maxAttempts) return;
        const delay = Math.min(
          RECONNECT_CONFIG.initialDelayMs *
            RECONNECT_CONFIG.backoffMultiplier ** reconnectAttempt,
          RECONNECT_CONFIG.maxDelayMs
        );
        reconnectAttempt += 1;
        retryTimeout = setTimeout(connect, delay);
      };

      const compareBufferedDeliveries = (
        left: BufferedDelivery,
        right: BufferedDelivery
      ) => {
        if (left.event.seq < right.event.seq) return -1;
        if (left.event.seq > right.event.seq) return 1;
        // Recovery is the authoritative copy for a sequence represented on
        // both paths. Stable ordering preserves arrival order within a source.
        if (
          left.metadata.source === 'catchup' &&
          right.metadata.source === 'live'
        ) {
          return -1;
        }
        if (
          left.metadata.source === 'live' &&
          right.metadata.source === 'catchup'
        ) {
          return 1;
        }
        return 0;
      };

      /**
       * Drains only a contiguous prefix through the shared sequencer. Stale
       * duplicates are discarded; the first event beyond last+1 and every
       * later event remain buffered for an immediate trailing GetStory.
       */
      const drainBuffer = (): boolean => {
        attempt.buffer.sort(compareBufferedDeliveries);
        let consumed = 0;

        while (consumed < attempt.buffer.length) {
          if (!isCurrent(attempt)) return false;
          const pending = attempt.buffer[consumed];
          if (!pending) break;
          const result = deliver(pending.event, pending.metadata);
          if (result === 'gap') break;
          consumed += 1;
        }

        if (consumed > 0) attempt.buffer = attempt.buffer.slice(consumed);
        attempt.buffering = attempt.buffer.length > 0;
        return !attempt.buffering;
      };

      const getRecovery = async (fromSeq: bigint) => {
        try {
          const response = await sessionClient.getStory(
            { session, member, fromSeq },
            { signal: attempt.controller.signal }
          );
          return { entries: response.entries, agedOut: false };
        } catch (err) {
          if (!isCurrent(attempt) || !isStoryTrimmedError(err)) throw err;
          // Any recovery trigger, including a from-zero initial recovery,
          // gets one explicit from-zero retry when retention says it aged out.
          const response = await sessionClient.getStory(
            { session, member, fromSeq: 0n },
            { signal: attempt.controller.signal }
          );
          return { entries: response.entries, agedOut: true };
        }
      };

      const rebaseForAgedOutStory = (entries: Event[]) => {
        if (lastSeq === null) return;
        let firstAvailableAfterLast: bigint | null = null;
        for (const entry of entries) {
          if (
            entry.seq > lastSeq &&
            (firstAvailableAfterLast === null ||
              entry.seq < firstAvailableAfterLast)
          ) {
            firstAvailableAfterLast = entry.seq;
          }
        }
        if (
          firstAvailableAfterLast !== null &&
          firstAvailableAfterLast > lastSeq + 1n
        ) {
          // ErrStoryTrimmed explicitly acknowledges that this unavailable
          // prefix cannot be filled. Rebase only to the first retained entry;
          // normal and buffered delivery remain gapless from there onward.
          lastSeq = firstAvailableAfterLast - 1n;
        }
      };

      attempt.requestRecovery = (): Promise<void> => {
        if (!isCurrent(attempt)) return Promise.resolve();
        if (attempt.recovery) {
          // A trigger can arrive after the active RPC took its server snapshot.
          // Remember one coalesced trailing pass rather than losing that edge.
          attempt.trailingRecovery = true;
          return attempt.recovery;
        }

        attempt.buffering = true;
        setState('resyncing');
        const predecessor = recoveryLock;
        const operation = (async () => {
          await waitForRecoveryPredecessor(predecessor, attempt);
          if (!isCurrent(attempt)) return;

          try {
            // One immediate retry closes the normal live-vs-snapshot race.
            // If a responsive provider still cannot supply the gap, retain the
            // buffer and let the existing <=5s trigger cadence try again rather
            // than spinning an unbounded microtask/RPC loop.
            let gapTrailingPassUsed = false;
            do {
              // Triggers during this RPC set the flag back to true. Clearing it
              // before the await distinguishes them from the pass now starting.
              attempt.trailingRecovery = false;
              const fromSeq = lastSeq === null ? 0n : lastSeq + 1n;
              const recovery = await getRecovery(fromSeq);
              if (!isCurrent(attempt)) return;

              if (recovery.agedOut) rebaseForAgedOutStory(recovery.entries);
              attempt.buffer.push(
                ...recovery.entries.map((event) => ({
                  event,
                  metadata: CATCHUP_DELIVERY,
                }))
              );
              const fullyDrained = drainBuffer();
              if (!isCurrent(attempt)) return;
              if (recovery.agedOut) onAgedOutRef.current?.();

              // A stale server snapshot must not let a later buffered frame
              // advance lastSeq over a gap. Retry immediately from current
              // lastSeq+1; all current/later frames remain in this one buffer.
              if (!fullyDrained && !gapTrailingPassUsed) {
                gapTrailingPassUsed = true;
                attempt.trailingRecovery = true;
              }
            } while (isCurrent(attempt) && attempt.trailingRecovery);

            if (!isCurrent(attempt)) return;
            if (!attempt.buffering) {
              reconnectAttempt = 0;
              setState('live');
            }
          } catch {
            if (!isCurrent(attempt)) return;
            scheduleReconnect();
          }
        })().finally(() => {
          // A synchronous trigger can observe the operation after its final
          // loop check but before this cleanup. Preserve it as a fresh pass.
          const runTrailing = isCurrent(attempt) && attempt.trailingRecovery;
          if (attempt.recovery === operation) attempt.recovery = null;
          if (recoveryLock?.operation === operation) recoveryLock = null;
          if (runTrailing) {
            attempt.trailingRecovery = false;
            void attempt.requestRecovery();
          }
        });

        attempt.recovery = operation;
        recoveryLock = { attempt, operation };
        return operation;
      };

      // Open the stream first, then start recovery before asking its async
      // iterator for the first frame. They still run concurrently, but this
      // ordering also lets an already-resolved initial GetStory establish the
      // baseline before a finite/terminal stream can close and reconnect.
      void (async () => {
        try {
          const liveEvents = sessionClient.streamEvents(
            { session, member },
            { signal: attempt.controller.signal }
          );
          void attempt.requestRecovery();
          for await (const event of liveEvents) {
            if (!isCurrent(attempt)) return;
            if (attempt.buffering) {
              attempt.buffer.push({ event, metadata: LIVE_DELIVERY });
              continue;
            }

            const result = deliver(event, LIVE_DELIVERY);
            if (result === 'gap') {
              attempt.buffer.push({ event, metadata: LIVE_DELIVERY });
              attempt.buffering = true;
              void attempt.requestRecovery();
            }
          }
          if (!isCurrent(attempt) || attempt.controller.signal.aborted) return;
          scheduleReconnect();
        } catch {
          if (!isCurrent(attempt) || attempt.controller.signal.aborted) return;
          scheduleReconnect();
        }
      })();
    };

    const requestCurrentRecovery = () => {
      if (!disposed) void activeAttempt?.requestRecovery();
    };
    const handleFocus = () => requestCurrentRecovery();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestCurrentRecovery();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const recoveryInterval = setInterval(
      requestCurrentRecovery,
      STORY_RECOVERY_INTERVAL_MS
    );
    connect();

    return () => {
      disposed = true;
      generation += 1;
      activeAttempt?.controller.abort();
      activeAttempt = null;
      clearTimeout(retryTimeout);
      clearInterval(recoveryInterval);
      for (const wait of [...abortGraceWaits]) releaseAbortGraceWait(wait);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, member]);

  return state;
}
