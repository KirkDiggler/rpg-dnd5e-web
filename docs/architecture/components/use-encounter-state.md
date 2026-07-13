---
name: useEncounterState
description: Single authoritative entity/turn/prompt store, populated exclusively from the v1alpha2 stream — trimmed of its v1alpha1 snapshot-replace path in slice 3
updated: 2026-07-13
confidence: high — verified by reading useEncounterState.ts and useEncounterState.test.ts in full
---

# useEncounterState

`src/hooks/useEncounterState.ts` — the unified entity/turn/prompt store
shared by `EncounterView` and `PlaytestHarness`. Keyed by entity ID,
populated exclusively from `useEncounterStream`'s v1alpha2 delta events
via `dispatchEncounterStreamEvent`.

## Slice 3 trim (rpg-dnd5e-web#447)

Through slice 2, this hook carried a hybrid store: v2 delta fields
alongside a v1alpha1 snapshot-replace path (`applySnapshot`/
`applyEntityUpdates`/`applyCombatState`, populating `rooms`/
`currentRoomId`/`revealedRoomIds`/`combat`/`doors`/`dungeonState`/
`roomsCleared`) that only `LobbyView` drove — the v2 stream's own
`SnapshotDelivered` populates entities and turn state through targeted
reducers (`applyEntityAppearedBatch`, `applySnapshotTurnState`), never
through a wholesale `EncounterStateData` replace. Deleting `LobbyView`
left that whole path with zero callers, so it — and the fields it alone
populated — was deleted along with it. Every field and reducer
documented below is exercised by `EncounterView` and/or `PlaytestHarness`
today.

## Design

- **Delta-only.** Every reducer merges a single event's data into
  existing state by entity ID (or a scalar field). There is no
  full-replace-from-snapshot path — `applyEntityAppearedBatch` seeds
  entities in one batch on `SnapshotDelivered`, and `applySnapshotTurnState`
  seeds `mode`/`initiativeOrder`/`activeEntityId`/`round`/`turnState` from
  the same event. Both are pure functions with no side effects; the hook
  wraps each in a `useCallback` that calls `setState`.
- **v1alpha1-shaped entity storage, v1alpha2-only population.** `entities:
Map<string, EntityState>` uses the v1alpha1 `EntityState` proto as its
  value type — this is an intentional wire-reuse decision upstream (the
  v1alpha2 stream's entity payloads carry v1alpha1-shaped data), not
  legacy debt. Every entity in the map got there via a v2 event
  (`EntityAppeared`/`applyEntityAppeared`, snapshot batch, or a delta
  reducer) — never a v1 snapshot replace.
- **Idempotent where cheap.** Reducers like `applyEntityDamaged`,
  `applyModeChanged`, `applyTurnStarted`, and `setPendingPromptReducer`
  return the same object reference when the incoming event wouldn't
  change anything, avoiding a spurious React re-render.

## State shape

| Field                                                             | Populated by                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`                                                        | `applyEntityAppeared(Batch)`, delta reducers                                                                                                                                          |
| `revealedHexes`                                                   | `applyHexRevealed` (`GeometryRevealed`)                                                                                                                                               |
| `walls`                                                           | `applyWallsRevealed` (snapshot's `Space.walls`, `GeometryRevealed.walls`) — sticky `Map<wallKey, Wall>`; overwrites an entry when `kind` changes (e.g. a door opening), never removes |
| `openDoors`                                                       | `applyDoorOpened` (`DoorOpened`)                                                                                                                                                      |
| `entityHP`                                                        | `applyEntityDamaged`, entity-appear seeding                                                                                                                                           |
| `entityAC`                                                        | Entity-appear seeding (initial AC)                                                                                                                                                    |
| `entityStatuses`                                                  | `applyStatusApplied`/`applyStatusRemoved`                                                                                                                                             |
| `entityMeta`                                                      | `applyEntityMetaFromAppeared`/batch                                                                                                                                                   |
| `initiativeOrder`, `activeEntityId`, `round`, `mode`, `turnState` | `applySnapshotTurnState`, `applyTurnStarted`, `applyTurnStateChanged`, `applyModeChanged`                                                                                             |
| `pendingPrompt`                                                   | `setPendingPromptReducer` (caller-driven, never auto-set)                                                                                                                             |
| `encounterStatus`, `encounterEndedReason`                         | `applyEncounterEnded`                                                                                                                                                                 |
| `reactionReadiness`                                               | `setReactionReadyLocalReducer` (optimistic mirror after `SetReactionReady` RPC)                                                                                                       |

`applyEntityPositionUpdate`/`mergeEntityPosition` and `reset` round out
the public API — the former is the `MovementCompletedEvent` fallback when
the API omits a full `updatedEntity`, the latter clears state to empty
(currently unused in the live app; `GameView`'s unmount-on-navigate
achieves the same effect, so it's kept as a documented capability rather
than dead code).

## Tests

`src/hooks/useEncounterState.test.ts` — pure-function coverage for every
reducer, including idempotency and no-mutation checks. Trimmed in slice 3
alongside the source: the deleted snapshot-replace functions' direct
tests are gone, as is the "v2 delta survives a v1 snapshot" regression
coverage that only made sense while that path existed.
