import { create } from '@bufbuild/protobuf';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { StreamEncounterRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useEffect, useRef, useState } from 'react';
import { encounterClientV2 } from './client';
import {
  dispatchEncounterStream2Event,
  type EncounterStream2Options,
} from './encounterStream2Dispatch';
import { RECONNECT_CONFIG } from './streamReconnect';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface UseEncounterStream2Result {
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
 *   3. Subsequent events dispatched via encounterStream2Dispatch
 *   4. Stream end / error → state='disconnected' → exponential backoff reconnect
 *
 * Slice 1 contract: SnapshotDelivered.encounter is empty. The hook acknowledges
 * the message (transitions to 'connected') but does NOT apply payload as state.
 * Treat as a stream-up sync barrier.
 *
 * Reconnect: shared RECONNECT_CONFIG with v1 hook (1s → 30s, 10 attempts).
 */
export function useEncounterStream2(
  encounterId: string | null,
  playerId: string,
  options: EncounterStream2Options
): UseEncounterStream2Result {
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

  useEffect(() => {
    if (!encounterId) {
      setConnectionState('idle');
      return;
    }

    const scheduleReconnect = () => {
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

    const connect = async () => {
      setConnectionState('connecting');
      setError(null);
      abortControllerRef.current = new AbortController();

      try {
        const request = create(StreamEncounterRequestSchema, {
          encounterId,
          playerId,
        });
        const stream = encounterClientV2.streamEncounter(request, {
          signal: abortControllerRef.current.signal,
        });

        let sawFirstSnapshot = false;
        for await (const event of stream as AsyncIterable<EncounterEvent>) {
          if (!sawFirstSnapshot) {
            // Broker contract: first message is always SnapshotDelivered. We
            // don't validate the case here — a violation is a server-side bug
            // that the playtest will surface via missing snapshot effects.
            // Loose handling matches v1's tolerance.
            dispatchEncounterStream2Event(event, optionsRef.current);
            sawFirstSnapshot = true;
            setConnectionState('connected');
            retryCountRef.current = 0;
            continue;
          }
          dispatchEncounterStream2Event(event, optionsRef.current);
        }

        // Stream closed by server — schedule reconnect
        scheduleReconnect();
      } catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          return; // intentional abort, not an error
        }
        console.error('[useEncounterStream2] stream error:', err);
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
