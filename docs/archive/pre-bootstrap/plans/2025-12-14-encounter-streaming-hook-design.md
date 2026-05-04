# Encounter Streaming Hook Design

**Date:** 2025-12-14
**Status:** Draft
**Related:** [rpg-api #280](https://github.com/KirkDiggler/rpg-api/issues/280), [rpg-api-protos PR #89](https://github.com/KirkDiggler/rpg-api-protos/pull/89)

## Overview

Design for `useEncounterStream` - a React hook that subscribes to real-time encounter events via gRPC-web server streaming. This enables multiplayer synchronization where all clients receive the same events in the same order.

## Design Decisions

| Decision                   | Choice                         | Rationale                                                                       |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Where subscription lives   | Dedicated hook                 | Matches existing `encounterHooks.ts` pattern, lifecycle tied to component mount |
| How events update state    | Callback-based                 | Explicit handlers, no missed events between renders                             |
| Reconnection strategy      | Auto-reconnect with backoff    | Network blips are common, especially on mobile/Discord                          |
| Optimistic updates         | No - stream is source of truth | Single source of truth, no reconciliation logic needed                          |
| Lobby-to-combat transition | Callback handles it            | Component owns navigation, hook stays focused                                   |

## Hook API

```typescript
// src/api/useEncounterStream.ts

import type {
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerReadyEvent,
  PlayerDisconnectedEvent,
  PlayerReconnectedEvent,
  CombatStartedEvent,
  CombatPausedEvent,
  CombatResumedEvent,
  CombatEndedEvent,
  MovementCompletedEvent,
  AttackResolvedEvent,
  FeatureActivatedEvent,
  TurnEndedEvent,
  MonsterTurnCompletedEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

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

function useEncounterStream(
  encounterId: string | null,
  playerId: string,
  options: UseEncounterStreamOptions
): UseEncounterStreamResult;
```

### API Design Notes

- **`encounterId: null`** - Pass null to not connect (before lobby created/joined)
- **All callbacks optional** - Subscribe only to events you need
- **`connectionState`** - For UI feedback (spinner, "reconnecting..." banner)
- **Event types** - Direct from proto-generated types, no custom wrappers

## Hook Implementation

### Connection Lifecycle

```
Mount with encounterId
        │
        ▼
   [connecting]
        │
        ├── success ──▶ [connected] ◀─────┐
        │                    │            │
        │              stream event       │
        │                    │            │
        │              dispatch to        │
        │              callback           │
        │                    │            │
        └── error ─┬─▶ [disconnected]     │
                   │         │            │
                   │    wait (backoff)    │
                   │         │            │
                   │    retry ────────────┘
                   │
                   └── max retries ──▶ [error]

Unmount or encounterId changes
        │
        ▼
   Cancel stream
   Clear retry timer
```

### Reconnection Strategy

```typescript
const RECONNECT_CONFIG = {
  initialDelayMs: 1000, // Start with 1 second
  maxDelayMs: 30000, // Cap at 30 seconds
  backoffMultiplier: 2, // Double each attempt
  maxAttempts: 10, // Give up after 10 attempts
};
```

**Backoff sequence:** 1s → 2s → 4s → 8s → 16s → 30s → 30s → 30s → 30s → 30s → error

### Internal Structure

```typescript
function useEncounterStream(
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
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

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
```

### Event Dispatcher

```typescript
function dispatchEvent(
  event: EncounterEvent,
  options: UseEncounterStreamOptions
) {
  const eventCase = event.event.case;
  const eventData = event.event.value;

  switch (eventCase) {
    case 'playerJoined':
      options.onPlayerJoined?.(eventData);
      break;
    case 'playerLeft':
      options.onPlayerLeft?.(eventData);
      break;
    case 'playerReady':
      options.onPlayerReady?.(eventData);
      break;
    case 'playerDisconnected':
      options.onPlayerDisconnected?.(eventData);
      break;
    case 'playerReconnected':
      options.onPlayerReconnected?.(eventData);
      break;
    case 'combatStarted':
      options.onCombatStarted?.(eventData);
      break;
    case 'combatPaused':
      options.onCombatPaused?.(eventData);
      break;
    case 'combatResumed':
      options.onCombatResumed?.(eventData);
      break;
    case 'combatEnded':
      options.onCombatEnded?.(eventData);
      break;
    case 'movementCompleted':
      options.onMovementCompleted?.(eventData);
      break;
    case 'attackResolved':
      options.onAttackResolved?.(eventData);
      break;
    case 'featureActivated':
      options.onFeatureActivated?.(eventData);
      break;
    case 'turnEnded':
      options.onTurnEnded?.(eventData);
      break;
    case 'monsterTurnCompleted':
      options.onMonsterTurnCompleted?.(eventData);
      break;
    default:
      console.warn('Unknown event type:', eventCase);
  }
}
```

## LobbyScreen Integration

### Usage Pattern

```typescript
// In LobbyScreen.tsx

export function LobbyScreen({ ... }: LobbyScreenProps) {
  // ... existing state ...

  const { connectionState, error: streamError } = useEncounterStream(
    encounterId,
    currentPlayerId,
    {
      onPlayerJoined: (event) => {
        setPartyMembers(prev => [...prev, {
          playerId: event.playerId,
          playerName: event.playerName,
          character: event.character,
          isReady: false,
          isHost: false,
        }]);
      },

      onPlayerLeft: (event) => {
        setPartyMembers(prev =>
          prev.filter(m => m.playerId !== event.playerId)
        );
      },

      onPlayerReady: (event) => {
        setPartyMembers(prev =>
          prev.map(m =>
            m.playerId === event.playerId
              ? { ...m, isReady: event.isReady, character: event.character }
              : m
          )
        );
        // Sync local ready state if it's us
        if (event.playerId === currentPlayerId) {
          setIsReady(event.isReady);
        }
      },

      onPlayerDisconnected: (event) => {
        setPartyMembers(prev =>
          prev.map(m =>
            m.playerId === event.playerId
              ? { ...m, isConnected: false }
              : m
          )
        );
      },

      onPlayerReconnected: (event) => {
        setPartyMembers(prev =>
          prev.map(m =>
            m.playerId === event.playerId
              ? { ...m, isConnected: true }
              : m
          )
        );
      },

      onCombatStarted: (event) => {
        // Transition to combat view
        onStartCombat(encounterId!);
      },
    }
  );

  // ... rest of component ...
}
```

### Connection Status UI

```typescript
// Show reconnecting banner when disconnected
{connectionState === 'disconnected' && (
  <div className="bg-yellow-500/20 text-yellow-200 px-4 py-2 text-center">
    Reconnecting...
  </div>
)}

{connectionState === 'error' && (
  <div className="bg-red-500/20 text-red-200 px-4 py-2 text-center">
    Connection lost. <button onClick={handleLeave}>Return to menu</button>
  </div>
)}
```

## Lobby API Hooks

In addition to the streaming hook, we need unary RPC hooks for lobby actions:

```typescript
// src/api/lobbyHooks.ts

export function useCreateEncounter() {
  // POST: Create lobby, returns encounterId + joinCode
  // Response triggers stream subscription
}

export function useJoinEncounter() {
  // POST: Join lobby by code, returns encounterId + current party state
  // Response triggers stream subscription
}

export function useSetReady() {
  // POST: Toggle ready status
  // Don't update local state - wait for stream event
}

export function useStartCombat() {
  // POST: Host starts combat
  // Don't navigate - wait for CombatStarted event
}

export function useLeaveEncounter() {
  // POST: Leave the lobby
  // Clear local state, unsubscribe from stream
}
```

### Key Pattern: No Optimistic Updates

```typescript
// WRONG - optimistic update
const handleToggleReady = async () => {
  setIsReady(!isReady); // Don't do this!
  await setReady({ encounterId, isReady: !isReady });
};

// RIGHT - wait for stream
const handleToggleReady = async () => {
  await setReady({ encounterId, isReady: !isReady });
  // Stream will deliver PlayerReady event which updates state
};
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         LobbyScreen                              │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ partyMembers │     │   isReady    │     │  joinCode    │    │
│  └──────┬───────┘     └──────┬───────┘     └──────────────┘    │
│         │                    │                                   │
│         │    Updated by stream events only                      │
│         │                    │                                   │
└─────────┼────────────────────┼───────────────────────────────────┘
          │                    │
          ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     useEncounterStream                           │
│                                                                  │
│   Subscribes to: StreamEncounterEvents(encounterId, playerId)   │
│   Dispatches events to callbacks                                 │
│   Handles reconnection automatically                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          ▲                    │
          │                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Unary RPC Hooks                             │
│                                                                  │
│  useCreateEncounter  → Returns encounterId, joinCode             │
│  useJoinEncounter    → Returns encounterId, initial party        │
│  useSetReady         → Returns success/error only                │
│  useStartCombat      → Returns success/error only                │
│  useLeaveEncounter   → Returns success/error only                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         rpg-api                                  │
│                                                                  │
│   Unary RPCs: Process action, publish event to Redis            │
│   Streaming: Subscribe to Redis, forward events to clients      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/api/
├── client.ts              # Existing - gRPC transport
├── encounterHooks.ts      # Existing - combat action hooks
├── lobbyHooks.ts          # NEW - create/join/ready/start/leave
└── useEncounterStream.ts  # NEW - streaming subscription hook
```

## Implementation Tasks

1. **Create `useEncounterStream` hook** - Core streaming logic with reconnection
2. **Create `lobbyHooks.ts`** - Unary RPC hooks for lobby actions
3. **Update `LobbyScreen.tsx`** - Wire up stream + replace TODO mocks
4. **Add connection status UI** - Show reconnecting/error states
5. **Update `PartyMemberCard`** - Show disconnected player indicator
6. **Test with backend** - End-to-end multiplayer flow

## Decisions Made

- **Kick player**: Postpone for now - can add later if needed
- **Host/player disconnect**: Treat as encounter ending event (simplest approach for v1)
- **Lobby timeout**: Not needed for v1

## Component Event Ownership

The same `useEncounterStream` hook serves both lobby and combat phases. Different components subscribe to different events:

| Component          | Events Handled                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **LobbyScreen**    | PlayerJoined, PlayerLeft, PlayerReady, CombatStarted                                              |
| **BattleMapPanel** | MovementCompleted, AttackResolved, FeatureActivated, TurnEnded, MonsterTurnCompleted, CombatEnded |
| **Both**           | PlayerDisconnected, PlayerReconnected, CombatPaused, CombatResumed                                |

This means when transitioning from lobby to combat:

1. LobbyScreen unmounts (stops handling lobby events)
2. BattleMapPanel mounts with same `encounterId`
3. BattleMapPanel uses same hook, subscribes to combat events
4. Stream stays connected - no reconnection needed

---

_Design validated through brainstorming session. Ready for implementation._
