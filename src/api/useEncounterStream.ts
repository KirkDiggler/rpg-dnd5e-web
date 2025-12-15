import { create } from '@bufbuild/protobuf';
import type {
  AttackResolvedEvent,
  CombatEndedEvent,
  CombatPausedEvent,
  CombatResumedEvent,
  CombatStartedEvent,
  EncounterEvent,
  FeatureActivatedEvent,
  MonsterTurnCompletedEvent,
  MovementCompletedEvent,
  PlayerDisconnectedEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerReadyEvent,
  PlayerReconnectedEvent,
  TurnEndedEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { StreamEncounterEventsRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useEffect, useRef, useState } from 'react';
import { encounterClient } from './client';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface UseEncounterStreamOptions {
  // Lobby events
  onPlayerJoined?: (event: PlayerJoinedEvent) => void;
  onPlayerLeft?: (event: PlayerLeftEvent) => void;
  onPlayerReady?: (event: PlayerReadyEvent) => void;

  // Connection events
  onPlayerDisconnected?: (event: PlayerDisconnectedEvent) => void;
  onPlayerReconnected?: (event: PlayerReconnectedEvent) => void;

  // Combat lifecycle
  onCombatStarted?: (event: CombatStartedEvent) => void;
  onCombatPaused?: (event: CombatPausedEvent) => void;
  onCombatResumed?: (event: CombatResumedEvent) => void;
  onCombatEnded?: (event: CombatEndedEvent) => void;

  // Combat action events (for BattleMap)
  onMovementCompleted?: (event: MovementCompletedEvent) => void;
  onAttackResolved?: (event: AttackResolvedEvent) => void;
  onFeatureActivated?: (event: FeatureActivatedEvent) => void;
  onTurnEnded?: (event: TurnEndedEvent) => void;
  onMonsterTurnCompleted?: (event: MonsterTurnCompletedEvent) => void;
}

interface UseEncounterStreamResult {
  connectionState: ConnectionState;
  error: Error | null;
}

const RECONNECT_CONFIG = {
  initialDelayMs: 1000, // Start with 1 second
  maxDelayMs: 30000, // Cap at 30 seconds
  backoffMultiplier: 2, // Double each attempt
  maxAttempts: 10, // Give up after 10 attempts
};

/**
 * Dispatches an encounter event to the appropriate callback handler
 */
function dispatchEvent(
  event: EncounterEvent,
  options: UseEncounterStreamOptions
) {
  const eventPayload = event.event;

  console.log(
    '🔵 Stream event received:',
    eventPayload.case,
    eventPayload.value
  );

  switch (eventPayload.case) {
    case 'playerJoined':
      options.onPlayerJoined?.(eventPayload.value);
      break;
    case 'playerLeft':
      options.onPlayerLeft?.(eventPayload.value);
      break;
    case 'playerReady':
      options.onPlayerReady?.(eventPayload.value);
      break;
    case 'playerDisconnected':
      options.onPlayerDisconnected?.(eventPayload.value);
      break;
    case 'playerReconnected':
      options.onPlayerReconnected?.(eventPayload.value);
      break;
    case 'combatStarted':
      options.onCombatStarted?.(eventPayload.value);
      break;
    case 'combatPaused':
      options.onCombatPaused?.(eventPayload.value);
      break;
    case 'combatResumed':
      options.onCombatResumed?.(eventPayload.value);
      break;
    case 'combatEnded':
      options.onCombatEnded?.(eventPayload.value);
      break;
    case 'movementCompleted':
      options.onMovementCompleted?.(eventPayload.value);
      break;
    case 'attackResolved':
      options.onAttackResolved?.(eventPayload.value);
      break;
    case 'featureActivated':
      options.onFeatureActivated?.(eventPayload.value);
      break;
    case 'turnEnded':
      options.onTurnEnded?.(eventPayload.value);
      break;
    case 'monsterTurnCompleted':
      options.onMonsterTurnCompleted?.(eventPayload.value);
      break;
    default:
      console.warn('Unknown event type:', eventPayload.case);
  }
}

/**
 * useEncounterStream subscribes to real-time encounter events via gRPC server streaming.
 *
 * This hook enables multiplayer synchronization by connecting to the encounter event stream
 * and dispatching events to the provided callback handlers. It handles automatic reconnection
 * with exponential backoff if the connection is lost.
 *
 * @param encounterId - The encounter to subscribe to (null to not connect)
 * @param playerId - The player subscribing to events
 * @param options - Callback handlers for different event types
 * @returns Connection state and any error
 *
 * @example
 * ```tsx
 * const { connectionState, error } = useEncounterStream(
 *   encounterId,
 *   playerId,
 *   {
 *     onPlayerJoined: (event) => {
 *       console.log('Player joined:', event.playerName);
 *     },
 *     onCombatStarted: (event) => {
 *       navigate('/combat');
 *     },
 *   }
 * );
 * ```
 */
export function useEncounterStream(
  encounterId: string | null,
  playerId: string,
  options: UseEncounterStreamOptions
): UseEncounterStreamResult {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Refs to avoid stale closures in callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (!encounterId) {
      setConnectionState('idle');
      return;
    }

    const connect = async () => {
      setConnectionState('connecting');
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const request = create(StreamEncounterEventsRequestSchema, {
          encounterId,
          playerId,
        });

        // Server streaming call
        for await (const event of encounterClient.streamEncounterEvents(
          request,
          { signal: abortControllerRef.current.signal }
        )) {
          setConnectionState('connected');
          retryCountRef.current = 0; // Reset on successful message

          dispatchEvent(event, optionsRef.current);
        }

        // Stream ended normally (server closed)
        scheduleReconnect();
      } catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          return; // Intentional abort, don't reconnect
        }

        console.error('Stream error:', err);
        scheduleReconnect();
      }
    };

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

    connect();

    return () => {
      abortControllerRef.current?.abort();
      clearTimeout(retryTimeoutRef.current);
    };
  }, [encounterId, playerId]);

  return { connectionState, error };
}
