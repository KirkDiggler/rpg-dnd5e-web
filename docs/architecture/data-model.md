---
name: rpg-dnd5e-web data model
description: Proto types consumed, transform layer, derived UI state
updated: 2026-05-02
confidence: high — verified by reading encounterHooks.ts, useEncounterState.ts, useDungeonMap.ts, and LobbyView.tsx import graph
---

# Data model

## Proto packages consumed

All types flow in from `@kirkdiggler/rpg-api-protos` (currently v0.1.91). The web layer consumes two proto namespaces:

| Proto package        | Generated path                           | What we use                                                                                                      |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dnd5e.api.v1alpha1` | `gen/ts/dnd5e/api/v1alpha1/encounter_pb` | `EncounterStateData`, `EntityState`, `RoomLayout`, `DoorInfo`, `EntityPlacement`, `CombatState`, all event types |
| `dnd5e.api.v1alpha1` | `gen/ts/dnd5e/api/v1alpha1/character_pb` | `Character`, `CharacterService`                                                                                  |
| `dnd5e.api.v1alpha1` | `gen/ts/dnd5e/api/v1alpha1/enums_pb`     | `Ability`, `EntityType`, `MonsterType`, `ConditionType`, `FeatureType`                                           |
| `api.v1alpha1`       | `gen/ts/api/v1alpha1/room_common_pb`     | `Wall`, `GridType`                                                                                               |
| `api.v1alpha1`       | `gen/ts/api/v1alpha1/dice_pb`            | `DiceService`                                                                                                    |

The `create()` function from `@bufbuild/protobuf` is used when constructing proto messages for RPC requests. Proto message construction in transform code (e.g., assembling `EntityPlacement` from `EntityState` in `LobbyView.tsx:120-140`) requires manually setting `$typeName` and `$unknown` fields — a protobuf-es v2 constraint, not a design choice.

## The EncounterStateData snapshot

`EncounterStateData` is the central data structure. It is returned by `GetEncounterState` (snapshot) and embedded in several event payloads (`CombatStartedEvent`, `RoomRevealedEvent`, `PlayerReconnectedEvent`).

```
EncounterStateData
  ├── currentRoomId: string
  ├── rooms: map<string, RoomLayout>     # all revealed room layouts
  ├── entities: map<string, EntityState> # all entities (players + monsters)
  ├── doors: map<string, DoorInfo>       # all doors
  ├── combatState: CombatState           # initiative, current turn, action economy
  └── lastEventId: string                # for load-then-stream synchronization
```

`EntityState` is the richest entity type. It includes position, HP, conditions, features, and a `details` oneof that distinguishes `characterDetails` from `monsterDetails`.

## useEncounterState: derived entity map

`hooks/useEncounterState.ts` (148 lines) maintains a `Map<entityId, EntityState>` derived from the snapshot. Pure functions:

- `applySnapshotToState(state, snapshot)` — full replace from `EncounterStateData.entities`
- `mergeEntityUpdates(state, updates)` — keyed merge for delta events (movement, HP changes)
- `applyCombatState(state, combatState)` — replaces `CombatState` wholesale

This hook is the "new path." It runs in parallel with the legacy `monsters[]` / `combatState` / `fullCharactersMap` state variables in `LobbyView.tsx` until Task 7 cleanup.

## useDungeonMap: derived room geometry

`hooks/useDungeonMap.ts` (302 lines) accumulates revealed rooms into a single coordinate space. It is purely derived state — no proto mutation, only reads.

`DungeonMapState` fields:

- `floorTiles: Map<string, AbsoluteFloorTile>` — keyed by `"x,y,z"`, deduped
- `walls: Map<string, Wall>` — keyed by canonical wall key (prevents boundary wall doubling)
- `entities: Map<string, EntityPlacement>` — all entities across all rooms
- `doors: Map<string, DoorInfo>` — all doors
- `revealedRoomIds: Set<string>` — tracking
- `rooms: Map<string, Room>` — raw room data for local coordinate lookups
- `currentRoomId: string | null` — set to the last `mergeRoom` call's room ID

`mergeRoom(state, room, doors)` is the critical function. It is immutable (does not mutate input), handles duplicate rooms as updates, and has a 20-test suite in `useDungeonMap.test.ts`.

## Transform functions (warning: split location)

Three transform functions that convert `EncounterStateData` into `Room[]` for `useDungeonMap` exist in two places depending on branch:

| Function                     | On main                | On PR #378 branch                   |
| ---------------------------- | ---------------------- | ----------------------------------- |
| `roomFromEncounterState`     | `LobbyView.tsx:146`    | `utils/encounterStateTransforms.ts` |
| `allRoomsFromEncounterState` | Does not exist on main | `utils/encounterStateTransforms.ts` |
| `doorsFromEncounterState`    | `LobbyView.tsx:175`    | `utils/encounterStateTransforms.ts` |
| `entityStateToPlacement`     | `LobbyView.tsx:120`    | `utils/encounterStateTransforms.ts` |
| `monstersFromEncounterState` | `LobbyView.tsx:183`    | `utils/encounterStateTransforms.ts` |

On main today, all five functions are module-level functions inside `LobbyView.tsx`. The 25-test `encounterStateTransforms.test.ts` suite lives exclusively on the `test/room-reveal-transforms` branch (PR #378) and has not merged to main. The `status.md` claim that "25 tests merged to main via commit `15f232e`" is incorrect — `15f232e` is only on the PR branch.

## Hand-rolled interfaces (non-proto)

These TypeScript interfaces exist alongside proto types for legitimate reasons:

| File                     | Why it exists                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `types/featureData.ts`   | Decodes `feature.featureData bytes` from proto — JSON embedded in a bytes field, not a proto message |
| `types/conditionData.ts` | Same — decodes `condition.conditionData bytes`                                                       |
| `types/combat.ts`        | `DamageNumber` for animation/display state, no proto equivalent                                      |
| `types/character.ts`     | UI state types (form validation state, selection state)                                              |
| `types/choices.ts`       | Character creation form state — mirrors draft flow, not proto shape                                  |

These are justified. They are UI concerns not representable in proto. They should not drift from the proto shapes they display — each needs manual review when proto bumps.

## Proto version discipline

`@kirkdiggler/rpg-api-protos` is installed from GitHub (`github:KirkDiggler/rpg-api-protos#v0.1.91`). Version bumps require regenerating the lock file: `rm -rf node_modules package-lock.json && npm install`. The `CLAUDE.md` documents this. Failure to regenerate can cause CI to use stale proto code despite `package.json` being updated.
