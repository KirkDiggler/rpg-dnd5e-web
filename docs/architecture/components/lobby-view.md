---
name: LobbyView
description: The main game hub component — too large, dual-pathed, but correct
updated: 2026-05-02
confidence: high — verified by reading LobbyView.tsx (2,345 lines) in full
---

# LobbyView

`src/components/LobbyView.tsx` — **2,345 lines, 45 hook calls.**

LobbyView is the central hub of the game. It owns stream wiring, all event handlers, combat action dispatch, movement pathfinding, turn logic, rendering state, and routing between lobby/waiting/combat/dungeon-result views. Everything passes through it.

## Size and scope

| Metric                                                                | Value         |
| --------------------------------------------------------------------- | ------------- |
| Lines                                                                 | 2,345         |
| Hook calls (useState/useEffect/useCallback/useMemo/useRef/useContext) | 45            |
| Inline `legacy` comment occurrences                                   | 26            |
| Module-level helper functions                                         | 5 (see below) |
| gRPC hook calls wired                                                 | ~12           |

## Module-level functions (should be in utils/)

Five functions are defined at module level inside `LobbyView.tsx` rather than in `utils/`. On branch `test/room-reveal-transforms` (PR #378), four of them have been extracted to `utils/encounterStateTransforms.ts`. On main, they remain here.

| Function                     | Line | Should be in                                  |
| ---------------------------- | ---- | --------------------------------------------- |
| `applyMonsterMovement`       | 89   | `utils/monsterTurnUtils.ts` or similar        |
| `entityStateToPlacement`     | 120  | `utils/encounterStateTransforms.ts` (PR #378) |
| `roomFromEncounterState`     | 146  | `utils/encounterStateTransforms.ts` (PR #378) |
| `doorsFromEncounterState`    | 175  | `utils/encounterStateTransforms.ts` (PR #378) |
| `monstersFromEncounterState` | 183  | `utils/encounterStateTransforms.ts` (PR #378) |

`applyMonsterMovement` (line 89) is not extracted in either PR. It mutates entity positions in a `Room` object based on `MonsterTurnResult[]` from the API. This is a data transformation, not a game rule calculation, but it belongs in `utils/` not inline in the component file.

## processMonsterTurns: business logic inside a useCallback

`processMonsterTurns` (line 752) is a `useCallback` inside the component. It builds combat log entries via `monsterTurnsToLogEntries` and calls `applyMonsterMovement`. The side effect — `setCombatLog(prev => [...prev, ...entries])` — makes it hard to extract and test. This is game-adjacent logic (formatting turn results, updating combat log) that belongs outside the component.

## Dual-path state (the legacy/new seam)

LobbyView runs two entity state representations simultaneously:

**New path (Task 6, merged):**

- `useEncounterState` hook at line 250
- `applySnapshot(esd)` called from most event handlers

**Legacy path (Task 7, not yet done):**

- `monsters: MonsterCombatState[]` — useState at approx line 290
- `combatState: CombatState | undefined` — useState
- `fullCharactersMap: Map<string, Character>` — useState

The legacy path feeds `BattleMapPanel` entity rendering and `CombatPanel` monster type textures. Event handlers that update one path often update both with separate `setState` calls. Divergence between the two is possible and has occurred (the HP bug fixed in PR #365 was caused by this).

26 occurrences of "legacy" (grep-verified) mark this seam. The status.md previously claimed 41 occurrences — the current count on this branch is 26.

## handleRoomRevealed: the critical path

`handleRoomRevealed` (registered at `useEncounterStream` call around line 1070) is wrapped in a `setTimeout` at line 334 (300ms delay for fade transition). Code inside that timeout uses a stale-closure risk: it captures `addRoomToMap` and `applySnapshot` from the enclosing scope. The `optionsRef` pattern in `useEncounterStream` protects callbacks at the stream level, but the 300ms timeout inside `handleRoomRevealed` itself does not use a ref — it captures the closure at callback creation time.

On main, `handleRoomRevealed` calls `roomFromEncounterState` (single room, legacy path). PR #377 changes this to `allRoomsFromEncounterState` (all revealed rooms, correct behavior). PR #377 is paused pending stream delivery confirmation.

## Discord playerId fallback

`LobbyView.tsx:223-224`:

```typescript
const isDevelopment = import.meta.env.MODE === 'development';
const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');
```

If Discord fails to provide `user.id` in production, `playerId` becomes `''` silently. No error is surfaced. The stream subscription and all event guards that check `event.member?.playerId === playerId` will silently fail to match.

## Render routing

LobbyView renders one of five views based on state:

1. `LobbyScreen` — creating/joining an encounter
2. `WaitingRoom` — waiting for players to ready up
3. `BattleMapPanel` + `CombatPanel` — active combat
4. `DungeonResultOverlay` — victory/failure screen
5. Equipment management overlay

The conditional render logic is interleaved with the hook declarations, making the component hard to reason about. A container/presentation split would help here.

## No tests

Zero vitest tests. Any bug in an event handler requires a full manual playtest cycle to catch. The `handleRoomRevealed` → `addRoomToMap` pipeline has the highest risk-to-test-coverage ratio in the codebase.
