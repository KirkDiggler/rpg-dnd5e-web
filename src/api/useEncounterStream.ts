import { create } from '@bufbuild/protobuf';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { StreamEncounterRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useEffect, useRef, useState } from 'react';
import { encounterClient } from './client';
import {
  dispatchEncounterStreamEvent,
  type EncounterStreamOptions,
} from './encounterStreamDispatch';
import { RECONNECT_CONFIG } from './streamReconnect';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface UseEncounterStreamResult {
  connectionState: ConnectionState;
  error: Error | null;
}

/**
 * Subscribes to the v1alpha2 StreamEncounter RPC. Sibling of useEncounterStream
 * (v1alpha1) — runs in parallel for slice 2; v1 still owns lobby/combat events.
 *
 * Lifecycle:
 *   1. encounterId set → open stream, state='connecting'
 *   2. First message MUST be SnapshotDelivered → state='connected', fire callback
 *   3. Subsequent events dispatched via encounterStreamDispatch
 *   4. Stream end / error → state='disconnected' → exponential backoff reconnect
 *
 * Slice 1 contract: SnapshotDelivered.encounter is empty. The hook acknowledges
 * the message (transitions to 'connected') but does NOT apply payload as state.
 * Treat as a stream-up sync barrier.
 *
 * Reconnect: shared RECONNECT_CONFIG with v1 hook (1s → 30s, 10 attempts).
 *
 * Mount-churn resilience (#442): a mount can tear its effect down and set it
 * back up again in quick succession (React StrictMode's dev double-invoke is
 * the common trigger, but any deps-driven re-run shapes the same race) —
 * the first connect() attempt's underlying transport can notice the
 * teardown's abort() and reject *after* the second attempt has already
 * replaced `abortControllerRef.current`. A catch handler that reads that
 * shared ref to decide "was I the one who got aborted" is reading a value
 * that may belong to a newer, unrelated attempt by then. Each connect()
 * attempt is tagged with a `generationRef` value at the moment it starts;
 * every side effect it performs (state updates, scheduling a reconnect,
 * touching the shared refs) is gated on still being the current generation,
 * and "was this abort mine" is decided from the attempt's own locally
 * captured AbortController, never the shared ref. That keeps a stale
 * attempt's belated rejection from silently no-op'ing (false intentional
 * read) *and* from re-arming its own zombie reconnect that clobbers the
 * live connection (false error read) — both were on the table with the old
 * shared-ref check depending on timing, which is why the bug was flaky.
 */
export function useEncounterStream(
  encounterId: string | null,
  playerId: string,
  options: EncounterStreamOptions
): UseEncounterStreamResult {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  // Bumped at the start of every connect() attempt (initial, StrictMode-churn
  // replay, and scheduled retries alike) so a superseded attempt's async
  // continuations can recognize they're stale and no-op instead of touching
  // shared state on a newer attempt's behalf.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!encounterId) {
      setConnectionState('idle');
      return;
    }

    const connect = async () => {
      const myGeneration = ++generationRef.current;
      const isCurrent = () => generationRef.current === myGeneration;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setConnectionState('connecting');
      setError(null);

      const scheduleReconnect = () => {
        if (!isCurrent()) return; // a newer attempt already owns the hook

        if (retryCountRef.current >= RECONNECT_CONFIG.maxAttempts) {
          setConnectionState('error');
          setError(new Error('Max reconnection attempts reached'));
          return;
        }
        setConnectionState('disconnected');
        const delay = Math.min(
          RECONNECT_CONFIG.initialDelayMs *
            Math.pow(RECONNECT_CONFIG.backoffMultiplier, retryCountRef.current),
          RECONNECT_CONFIG.maxDelayMs
        );
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(connect, delay);
      };

      try {
        const request = create(StreamEncounterRequestSchema, {
          encounterId,
          playerId,
        });
        const stream = encounterClient.streamEncounter(request, {
          signal: controller.signal,
        });

        let sawFirstSnapshot = false;
        for await (const event of stream as AsyncIterable<EncounterEvent>) {
          if (!isCurrent()) return; // superseded mid-stream; a newer attempt owns state now

          if (!sawFirstSnapshot) {
            // Broker contract: first message is always SnapshotDelivered. We
            // don't validate the case here — a violation is a server-side bug
            // that the playtest will surface via missing snapshot effects.
            // Loose handling matches v1's tolerance.
            dispatchEncounterStreamEvent(event, optionsRef.current);
            sawFirstSnapshot = true;
            setConnectionState('connected');
            retryCountRef.current = 0;
            continue;
          }
          dispatchEncounterStreamEvent(event, optionsRef.current);
        }

        // Stream closed by server — schedule reconnect
        scheduleReconnect();
      } catch (err) {
        if (!isCurrent()) return; // superseded — a newer attempt is already running
        if (controller.signal.aborted) {
          return; // our own cleanup tore this attempt down; nothing wants it anymore
        }
        console.error('[useEncounterStream] stream error:', err);
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      abortControllerRef.current?.abort();
      clearTimeout(retryTimeoutRef.current);
    };
  }, [encounterId, playerId]);

  return { connectionState, error };
}
