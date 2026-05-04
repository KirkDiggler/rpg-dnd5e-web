---
name: useEncounterStream
description: Real-time encounter event delivery — load-bearing, untested
updated: 2026-05-02
confidence: high — verified by reading useEncounterStream.ts (432 lines) in full
---

# useEncounterStream

`src/api/useEncounterStream.ts` — **432 lines.**

The single most critical file in the codebase. It is the only real-time event delivery path. If this hook breaks, the game breaks for all players simultaneously.

## What it does

Subscribes to `EncounterService.StreamEncounterEvents` (gRPC server streaming via Connect RPC). Dispatches each event to a callback registered by `LobbyView`. Also runs the load-then-stream pattern to synchronize state on connect and reconnect.

## Load-then-stream pattern

```
1. connect() called
2. Start gRPC stream (abortable via AbortController)
3. isSyncingRef = true → buffer all arriving events in eventBufferRef
4. setConnectionState('syncing')
5. fetchSnapshot(encounterId, playerId) → GetEncounterState RPC
6. Fetch history via fetchHistory() → GetEncounterHistory RPC
7. Call optionsRef.current.onHistoricalEvents(historyEvents)
8. Call optionsRef.current.onStateSync(snapshot)
9. Flush eventBufferRef: dispatchEvent(bufferedEvent, optionsRef.current) for each
10. isSyncingRef = false → subsequent events dispatch immediately
11. setConnectionState('connected')
```

The `optionsRef` pattern prevents stale closure bugs: `optionsRef.current` is updated on every render (`optionsRef.current = options` at line 229), so callbacks always refer to the latest props/state even inside long-lived async functions.

## Reconnect logic

Exponential backoff: 1s → 30s cap, multiplier 2x, max 10 attempts. Controlled by `RECONNECT_CONFIG` at line 83. On stream error or abnormal close, `retryCountRef` increments and `connect()` is scheduled after the backoff delay. On unmount (`cleanup` returned from `useEffect`), the `AbortController` is aborted and any pending retry is cancelled.

## Event dispatch

`dispatchEvent(event, options)` at line 93 is a pure switch over `event.event.case`. All event types present in the proto are handled. The `roomRevealed` case at line 145 calls `options.onRoomRevealed?.(eventPayload.value)`.

The switch is currently the only path through which multiplayer state updates reach `LobbyView`. No event is handled outside this switch.

## React StrictMode double-mount

In development, StrictMode double-mounts the component, causing two stream connections to open. Both connections receive events, which can cause duplicate event processing. The CLAUDE.md documents this as "normal and expected." In practice it means dev-mode playtest sessions see doubled console logs and occasionally doubled combat log entries.

## Known unknowns

- **RoomRevealed delivery status:** The dispatch switch has the `roomRevealed` case and calls `onRoomRevealed`. Whether the event actually arrives from the server through the gRPC-Web transport has not been confirmed with browser devtools. This is issue #380 (open) and the blocking investigation for multi-room dungeon work. Do not assume a code fix is needed until delivery is confirmed or ruled out.

- **Buffer race condition:** If the gRPC-Web transport delivers events before `fetchSnapshot` returns, they are correctly buffered. If `fetchSnapshot` throws (network error), the buffer is never flushed and the connection is stuck in 'syncing' state until reconnect. There is no test for this path.

- **History replay ordering:** `onHistoricalEvents` is called with events from `GetEncounterHistory` before `onStateSync`. LobbyView uses this for combat log population. If the API returns history events that are already reflected in the snapshot, they will be replayed a second time in the combat log. No deduplication is done.

## No tests

Zero vitest tests. The buffer-during-sync path, the reconnect path, the history fetch path, and the `onRoomRevealed` dispatch path are all untested. A test that fakes a grpc stream and verifies buffer flush ordering would be the highest-value test addition in the codebase.
