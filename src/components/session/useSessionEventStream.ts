/**
 * One delivery sequencer for SessionService.StreamEvents and GetStory.
 *
 * Stream frames and recovery entries share the same monotonic-sequence
 * deduper. Initial, reconnect, observed-gap, interval, focus, and visibility
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

interface StreamAttempt {
  generation: number;
  controller: AbortController;
  superseded: boolean;
  buffering: boolean;
  buffer: Event[];
  recovery: Promise<void> | null;
  requestRecovery: () => Promise<void>;
}

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
    let recoveryLock: Promise<void> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    const isCurrent = (attempt: StreamAttempt) =>
      !disposed &&
      activeAttempt === attempt &&
      attempt.generation === generation &&
      !attempt.superseded;

    /** The single seq deduper used by both delivery sources. */
    const deliver = (
      event: Event,
      metadata: SessionEventDeliveryMetadata
    ): boolean => {
      if (lastSeq !== null && event.seq <= lastSeq) return false;
      lastSeq = event.seq;
      onEventRef.current(event, metadata);
      return true;
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

      const applyCatchUpEntries = (entries: Event[]) => {
        for (const entry of entries) {
          if (!isCurrent(attempt)) return;
          deliver(entry, CATCHUP_DELIVERY);
        }
      };

      const drainLiveBuffer = () => {
        const pending = attempt.buffer;
        attempt.buffer = [];
        attempt.buffering = false;
        for (const event of pending) {
          if (!isCurrent(attempt)) return;
          deliver(event, LIVE_DELIVERY);
        }
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

      attempt.requestRecovery = (): Promise<void> => {
        if (!isCurrent(attempt)) return Promise.resolve();
        // Focus/visibility/interval bursts join the active catch-up. GetStory
        // has no upper bound, so overlapping calls add no authority.
        if (attempt.recovery) return attempt.recovery;

        attempt.buffering = true;
        setState('resyncing');
        const predecessor = recoveryLock;
        const operation = (async () => {
          // A reconnect may be created while the superseded attempt's
          // aborted transport is still unwinding. Queue behind it so even
          // across generations two GetStory promises never overlap.
          await predecessor;
          if (!isCurrent(attempt)) return;

          try {
            const fromSeq = lastSeq === null ? 0n : lastSeq + 1n;
            const recovery = await getRecovery(fromSeq);
            if (!isCurrent(attempt)) return;

            applyCatchUpEntries(recovery.entries);
            if (!isCurrent(attempt)) return;
            drainLiveBuffer();
            if (!isCurrent(attempt)) return;

            reconnectAttempt = 0;
            setState('live');
            if (recovery.agedOut) onAgedOutRef.current?.();
          } catch {
            if (!isCurrent(attempt)) return;
            scheduleReconnect();
          }
        })().finally(() => {
          if (attempt.recovery === operation) attempt.recovery = null;
          if (recoveryLock === operation) recoveryLock = null;
        });

        attempt.recovery = operation;
        recoveryLock = operation;
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
              attempt.buffer.push(event);
              continue;
            }
            if (lastSeq !== null && event.seq <= lastSeq) continue;
            if (lastSeq !== null && event.seq !== lastSeq + 1n) {
              attempt.buffer.push(event);
              attempt.buffering = true;
              void attempt.requestRecovery();
              continue;
            }
            deliver(event, LIVE_DELIVERY);
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
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, member]);

  return state;
}
