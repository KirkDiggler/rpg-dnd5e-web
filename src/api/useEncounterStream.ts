import { create, toJson } from '@bufbuild/protobuf';
import type {
  AttackResolvedEvent,
  CombatEndedEvent,
  CombatPausedEvent,
  CombatResumedEvent,
  CombatStartedEvent,
  DungeonFailureEvent,
  DungeonVictoryEvent,
  EncounterEvent,
  FeatureActivatedEvent,
  GetEncounterStateResponse,
  MonsterTurnCompletedEvent,
  MovementCompletedEvent,
  PlayerDisconnectedEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerReadyEvent,
  PlayerReconnectedEvent,
  RoomRevealedEvent,
  TurnEndedEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  AttackResolvedEventSchema,
  CombatEndedEventSchema,
  CombatStartedEventSchema,
  DungeonFailureEventSchema,
  DungeonVictoryEventSchema,
  FeatureActivatedEventSchema,
  GetEncounterStateRequestSchema,
  MonsterTurnCompletedEventSchema,
  MovementCompletedEventSchema,
  PlayerJoinedEventSchema,
  RoomRevealedEventSchema,
  StreamEncounterEventsRequestSchema,
  TurnEndedEventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useEffect, useRef, useState } from 'react';
import { encounterClient } from './client';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'syncing' // Buffering events while loading snapshot
  | 'connected'
  | 'disconnected'
  | 'error';

interface UseEncounterStreamOptions {
  // State sync callback - called with snapshot before processing buffered events
  onStateSync?: (snapshot: GetEncounterStateResponse) => void;

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

  // Dungeon events
  onRoomRevealed?: (event: RoomRevealedEvent) => void;
  onDungeonVictory?: (event: DungeonVictoryEvent) => void;
  onDungeonFailure?: (event: DungeonFailureEvent) => void;
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
 * Logs an event with full JSON representation for debugging
 */
function logEventDetails(eventCase: string, value: unknown): void {
  // Map event types to their schemas for JSON conversion
  const schemaMap: Record<string, unknown> = {
    playerJoined: PlayerJoinedEventSchema,
    combatStarted: CombatStartedEventSchema,
    combatEnded: CombatEndedEventSchema,
    movementCompleted: MovementCompletedEventSchema,
    attackResolved: AttackResolvedEventSchema,
    featureActivated: FeatureActivatedEventSchema,
    turnEnded: TurnEndedEventSchema,
    monsterTurnCompleted: MonsterTurnCompletedEventSchema,
    roomRevealed: RoomRevealedEventSchema,
    dungeonVictory: DungeonVictoryEventSchema,
    dungeonFailure: DungeonFailureEventSchema,
  };

  const schema = schemaMap[eventCase];
  if (schema && value) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = toJson(schema as any, value as any);
      console.log(
        `🔵 Stream event [${eventCase}]:`,
        JSON.stringify(json, null, 2)
      );
    } catch {
      // Fallback to raw value if toJson fails
      console.log(`🔵 Stream event [${eventCase}]:`, value);
    }
  } else {
    console.log(`🔵 Stream event [${eventCase}]:`, value);
  }
}

/**
 * Dispatches an encounter event to the appropriate callback handler
 */
function dispatchEvent(
  event: EncounterEvent,
  options: UseEncounterStreamOptions
) {
  const eventPayload = event.event;

  // Log full event details for debugging
  logEventDetails(eventPayload.case ?? 'unknown', eventPayload.value);

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
    case 'roomRevealed':
      options.onRoomRevealed?.(eventPayload.value);
      break;
    case 'dungeonVictory':
      options.onDungeonVictory?.(eventPayload.value);
      break;
    case 'dungeonFailure':
      options.onDungeonFailure?.(eventPayload.value);
      break;
    default:
      console.warn('Unknown event type:', eventPayload.case);
  }
}

/**
 * Fetches the current encounter state snapshot for load-then-stream pattern
 */
async function fetchSnapshot(
  encounterId: string,
  playerId: string
): Promise<GetEncounterStateResponse> {
  const request = create(GetEncounterStateRequestSchema, {
    encounterId,
    playerId,
  });
  return encounterClient.getEncounterState(request);
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

  // Buffer refs for load-then-stream pattern
  const eventBufferRef = useRef<EncounterEvent[]>([]);
  const lastEventIdRef = useRef<string | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!encounterId) {
      setConnectionState('idle');
      return;
    }

    console.log(
      '🔄 useEncounterStream effect triggered, encounterId:',
      encounterId
    );

    const connect = async () => {
      console.log('🔄 connect() called, starting stream connection...');
      setConnectionState('connecting');
      setError(null);

      // Reset sync state for new connection
      eventBufferRef.current = [];
      lastEventIdRef.current = null;
      isSyncingRef.current = true;

      abortControllerRef.current = new AbortController();

      try {
        const request = create(StreamEncounterEventsRequestSchema, {
          encounterId,
          playerId,
        });

        console.log('🔄 Creating stream iterator...');
        // Start stream - events will be buffered during sync
        const streamIterator = encounterClient.streamEncounterEvents(request, {
          signal: abortControllerRef.current.signal,
        });

        // Fetch snapshot while stream connects
        setConnectionState('syncing');
        console.log('🔄 Fetching encounter state snapshot...');

        try {
          const snapshot = await fetchSnapshot(encounterId, playerId);
          lastEventIdRef.current = snapshot.lastEventId;
          console.log(
            '🔄 Snapshot received, lastEventId:',
            snapshot.lastEventId
          );

          // Apply snapshot via callback
          optionsRef.current.onStateSync?.(snapshot);

          // Process buffered events (filter already-seen by ULID comparison)
          const bufferedCount = eventBufferRef.current.length;
          const newEvents = eventBufferRef.current.filter(
            (e) => e.eventId > lastEventIdRef.current!
          );
          console.log(
            `🔄 Processing ${newEvents.length} new events from ${bufferedCount} buffered`
          );

          for (const event of newEvents) {
            dispatchEvent(event, optionsRef.current);
          }

          // Clear buffer and exit sync mode
          eventBufferRef.current = [];
          isSyncingRef.current = false;

          setConnectionState('connected');
          retryCountRef.current = 0;
        } catch (snapshotErr) {
          // Snapshot fetch failed - continue without sync (graceful degradation)
          console.warn(
            'Failed to fetch snapshot, continuing without sync:',
            snapshotErr
          );
          isSyncingRef.current = false;

          // Process all buffered events since we don't have a lastEventId
          for (const event of eventBufferRef.current) {
            dispatchEvent(event, optionsRef.current);
          }
          eventBufferRef.current = [];

          setConnectionState('connected');
          retryCountRef.current = 0;
        }

        // Continue processing live events
        for await (const event of streamIterator) {
          if (isSyncingRef.current) {
            // Still syncing - buffer the event
            eventBufferRef.current.push(event);
            console.log('🔵 Buffering event during sync:', event.eventId);
          } else {
            // Normal operation - dispatch immediately
            dispatchEvent(event, optionsRef.current);
          }
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
