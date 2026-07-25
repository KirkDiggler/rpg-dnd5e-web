import { create } from '@bufbuild/protobuf';
import type { LobbyEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/events_pb';
import { StreamLobbyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useEffect, useRef, useState } from 'react';
import { lobbyClient } from './client';
import {
  dispatchLobbyStreamEvent,
  type LobbyStreamOptions,
} from './lobbyStreamDispatch';
import { RECONNECT_CONFIG } from './streamReconnect';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface UseLobbyStreamResult {
  connectionState: ConnectionState;
  error: Error | null;
}

/**
 * Subscribes to the LobbyService StreamLobby RPC. Sibling of
 * useEncounterStream — same snapshot-then-deltas contract, same reconnect
 * config, but no envelope and no playerId request field (StreamLobbyRequest
 * takes only lobby_id; the subscriber's identity for presence tracking
 * comes from the authenticated context — see StreamLobbyRequest's doc
 * comment in service.proto).
 *
 * Lifecycle:
 *   1. lobbyId set -> open stream, state='connecting'
 *   2. First message is always LobbySnapshot -> state='connected'
 *   3. Subsequent events dispatched via dispatchLobbyStreamEvent
 *   4. encounter_started is terminal — the server closes the stream after
 *      publishing it; callers unmount this hook (by clearing lobbyId) once
 *      onEncounterStarted fires rather than waiting for the close to
 *      trigger a reconnect loop against a lobby that no longer accepts
 *      subscribers.
 *   5. Stream end / error otherwise -> state='disconnected' -> exponential
 *      backoff reconnect (shared RECONNECT_CONFIG with the encounter hooks).
 */
export function useLobbyStream(
  lobbyId: string | null,
  options: LobbyStreamOptions
): UseLobbyStreamResult {
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
    if (!lobbyId) {
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
        const request = create(StreamLobbyRequestSchema, { lobbyId });
        const stream = lobbyClient.streamLobby(request, {
          signal: abortControllerRef.current.signal,
        });

        let sawFirstSnapshot = false;
        for await (const event of stream as AsyncIterable<LobbyEvent>) {
          if (!sawFirstSnapshot) {
            dispatchLobbyStreamEvent(event, optionsRef.current);
            sawFirstSnapshot = true;
            setConnectionState('connected');
            retryCountRef.current = 0;
            continue;
          }
          dispatchLobbyStreamEvent(event, optionsRef.current);
        }

        // Stream closed by server — expected on encounter_started (terminal);
        // the caller clears lobbyId in response to onEncounterStarted, which
        // tears this effect down before scheduleReconnect would fire again
        // for the same lobby.
        scheduleReconnect();
      } catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          return; // intentional abort, not an error
        }
        console.error('[useLobbyStream] stream error:', err);
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      abortControllerRef.current?.abort();
      clearTimeout(retryTimeoutRef.current);
    };
  }, [lobbyId]);

  return { connectionState, error };
}
