---
name: useEncounterState
description: Unified entity state — correct design, dual-pathed with legacy in LobbyView
updated: 2026-05-02
confidence: high — verified by reading useEncounterState.ts (148 lines) and useEncounterState.test.ts
---

# useEncounterState

`src/hooks/useEncounterState.ts` — **148 lines.**

Maintains a `Map<entityId, EntityState>` derived from the API's `EncounterStateData`. Landed in PR #371 (2026-04-05) as the "new path" for entity state management, replacing the scattered `monsters[]`, `fullCharactersMap`, and `dungeonMap.entities` representations.

## Design

- **Snapshot/delta.** `applySnapshotToState` replaces the full entity map from an `EncounterStateData`. `mergeEntityUpdates` applies keyed changes for delta events (movement completed, HP update, condition change).
- **CombatState as a separate field.** The hook tracks `CombatState` separately from entity state. `applyCombatState` replaces the full `CombatState` object.
- **Pure functions.** `applySnapshotToState` and `mergeEntityUpdates` are exported pure functions with no side effects. They take and return state objects.

## Exported functions

| Function                                | Purpose                                         |
| --------------------------------------- | ----------------------------------------------- |
| `applySnapshotToState(state, snapshot)` | Full entity map replace from EncounterStateData |
| `mergeEntityUpdates(state, updates)`    | Keyed delta merge                               |
| `applyCombatState(state, combatState)`  | Replace CombatState                             |

## Tests

`src/hooks/useEncounterState.test.ts` — tests cover snapshot application, entity merge, and combat state update. Exact count not verified independently here but part of the 298-test total.

## Current usage

`LobbyView.tsx:250` initializes `useEncounterState`. The hook is called for every event that carries `encounterStateData`. `BattleMapPanel` and `CombatPanel` receive entity state from this hook.

The legacy state (`monsters[]`, `combatState`, `fullCharactersMap`) still runs in parallel in `LobbyView`. Task 7 is the cleanup pass to remove the legacy path. Until then, the same event handlers often update both paths.

## Gap: doors and rooms

`useEncounterState` tracks entities and `CombatState` but not doors or room layouts. Door state (open/closed) between full snapshots is not tracked by this hook. A `RoomRevealed` event carries a full `encounterStateData` which calls `applySnapshot`, so doors are eventually consistent after room transitions. Mid-encounter door state between snapshots is not managed here — that lives in `useDungeonMap`.
