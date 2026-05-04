---
name: encounter state transforms
description: Transform functions between EncounterStateData and Room/dungeon geometry — currently split between main and PR branches
updated: 2026-05-02
confidence: high — verified by reading LobbyView.tsx module-level functions and PR #378 branch diff
---

# Encounter state transforms

These are pure functions that convert `EncounterStateData` proto into the geometry types used by `useDungeonMap` and `BattleMapPanel`.

## Current location (on main)

All five functions live as module-level functions inside `src/components/LobbyView.tsx`. They are not exported and have no tests on main.

| Function                     | Line in LobbyView.tsx  | Purpose                                                    |
| ---------------------------- | ---------------------- | ---------------------------------------------------------- |
| `entityStateToPlacement`     | 120                    | Converts `EntityState` → `EntityPlacement` for dungeon map |
| `roomFromEncounterState`     | 146                    | Builds a single `Room` (current room only) from snapshot   |
| `doorsFromEncounterState`    | 175                    | Extracts `DoorInfo[]` from snapshot                        |
| `monstersFromEncounterState` | 183                    | Builds `MonsterCombatState[]` for legacy texture selection |
| `allRoomsFromEncounterState` | Does not exist on main | Builds `Room[]` for all revealed rooms                     |

## PR #378 (paused): extraction to utils/encounterStateTransforms.ts

Branch `test/room-reveal-transforms` extracts these four functions to `src/utils/encounterStateTransforms.ts` and adds 25 tests in `src/utils/encounterStateTransforms.test.ts`. This commit (`15f232e`) is on the PR branch only — it has NOT merged to main.

The `status.md` previously claimed "25 tests merged to main via standalone commit `15f232e`." This is incorrect: `git branch --contains 15f232e` shows only `test/room-reveal-transforms`. The 298 tests currently passing on main do not include these 25.

## PR #377 (paused): allRoomsFromEncounterState in handleRoomRevealed

Branch `fix/376-room-revealed-all-rooms` adds `allRoomsFromEncounterState` to LobbyView and calls it in `handleRoomRevealed` instead of `roomFromEncounterState`. This is the correct fix for the bug where only the current room was added to the dungeon map on a `RoomRevealed` event. PR #377 is paused pending confirmation that `RoomRevealed` events actually reach the browser (issue #380).

## Known gap: entityStateToPlacement has no compile-time guard

`entityStateToPlacement` manually copies fields from `EntityState` to `EntityPlacement`. If a new field is added to `EntityPlacement` in the proto, the function silently omits it — the type system does not catch it. No test covers this gap on main.

## Known gap: monstersFromEncounterState return type

The function at `LobbyView.tsx:183` constructs `MonsterCombatState` objects with `as MonsterCombatState` casts. The return type is `MonsterCombatState[]` by annotation. The `$typeName` and `$unknown` fields are set manually — if protobuf-es changes this requirement in a future version, these will break silently.
