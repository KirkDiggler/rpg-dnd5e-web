---
name: rpg-dnd5e-web data model
description: Proto types consumed, transform layer, derived UI state
updated: 2026-07-13
confidence: medium — proto packages table, snapshot, walls, and transform sections refreshed for The Dungeon wave 1 (rpg-dnd5e-web#451) and slice 3 (rpg-dnd5e-web#447, LobbyView deletion); hand-rolled-interfaces and proto-version-discipline sections not independently re-verified this pass
---

# Data model

## Proto packages consumed

All types flow in from `@kirkdiggler/rpg-api-protos`. The web layer consumes several proto namespaces:

| Proto package                    | Generated path                             | What we use                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dnd5e.api.v1alpha2` (encounter) | `gen/ts/dnd5e/api/v1alpha2/encounter/*_pb` | `StreamEncounter`, all v2 event types, `TurnState`, `AvailableAction`, `InputRequired`, `Space` (`hexes`/`walls`/`entities`/`zones`), `Wall`/`WallKind` — the live game/harness stream                                                          |
| `dnd5e.api.v1alpha1` (encounter) | `gen/ts/dnd5e/api/v1alpha1/encounter_pb`   | `EntityState`, `RoomLayout`, `DoorInfo`, `EntityPlacement`, `Room` — entity/geometry **shapes**, deliberately reused by the v2 stream's event payloads (not a legacy holdover; see [use-encounter-state.md](components/use-encounter-state.md)) |
| `dnd5e.api.lobby.v1alpha1`       | `gen/ts/dnd5e/api/lobby/v1alpha1/*_pb`     | `LobbyService`, `LobbyEvent`/`StreamLobby` — party assembly (slice 1, rpg-api#630)                                                                                                                                                              |
| `dnd5e.api.v1alpha1` (character) | `gen/ts/dnd5e/api/v1alpha1/character_pb`   | `Character`, `CharacterService` — the character creation/sheet subsystem, unaffected by and never in scope for the game-screen rebuild                                                                                                          |
| `dnd5e.api.v1alpha1` (enums)     | `gen/ts/dnd5e/api/v1alpha1/enums_pb`       | `Ability`, `EntityType`, `MonsterType`, `ConditionType`, `FeatureType`                                                                                                                                                                          |
| `api.v1alpha1`                   | `gen/ts/api/v1alpha1/room_common_pb`       | `Position`, `GridType` — `Wall` moved off this package to the v1alpha2 encounter type in rpg-dnd5e-web#450; only the dead, unexported-from-anywhere-live `HexWall.tsx` (superseded by `ShadedHexWall`) still imports the old one                |
| `api.v1alpha1`                   | `gen/ts/api/v1alpha1/dice_pb`              | `DiceService`                                                                                                                                                                                                                                   |

The old v1alpha1 `EncounterService`'s request/response lobby/combat RPCs
(`CreateEncounter`/`JoinEncounter`/`SetReady`/`GetEncounterState`/etc.) and
their sole consumer, `LobbyView.tsx`, were deleted in slice 3
(rpg-dnd5e-web#447) — see [lobby-view.md](components/lobby-view.md).

The `create()` function from `@bufbuild/protobuf` is used when constructing proto messages for RPC requests. Constructing proto-shaped objects by hand requires manually setting `$typeName` and `$unknown` fields — a protobuf-es v2 constraint, not a design choice.

## The v1alpha2 stream: delta events, not a snapshot-replace

There is no `EncounterStateData`-shaped full-snapshot RPC on the live
path anymore. `useEncounterStream` subscribes to `StreamEncounter`; its
first message is always `SnapshotDelivered`, which seeds
`useEncounterState` through the same targeted, additive reducers every
other event uses (`applyEntityAppearedBatch` for entities,
`applySnapshotTurnState` for mode/turn state) — never a wholesale field
replace. See [use-encounter-state.md](components/use-encounter-state.md)
for the full reducer/field table.

`EntityState` (from the v1alpha1 encounter package) is still the richest
entity shape — position, HP, conditions, features, and a `details` oneof
distinguishing `characterDetails`/`monsterDetails`. The v2 stream's
`EntityAppeared` event carries one; `useEncounterState.entities` is a
`Map<entityId, EntityState>` built up one appearance at a time.

Walls follow the same seed-then-delta shape as entities, mirroring
`revealedHexes`: `SnapshotDelivered.encounter.space?.walls` seeds the sticky
`walls` store via `applyWallsRevealed`, and each `GeometryRevealed.walls`
merges in newly-explored segments (or an updated `kind`, e.g. a door
transitioning `DOOR_CLOSED` -> `DOOR_OPEN`) the same way. `EncounterMap` and
`PlaytestMap` both thread the store's `walls: Map<string, Wall>` through to
`HexGrid`'s `walls?: Wall[]` prop (`Array.from(walls.values())`); an empty
map — today's api, until rpg-api#644 lands `Space.Walls` population — is
just an empty `walls` prop, not an error path.

## useEncounterState: unified entity/turn/prompt store

`hooks/useEncounterState.ts` maintains entity, turn, and prompt state
keyed by entity ID, populated exclusively from v1alpha2 stream deltas —
no snapshot-replace path, no parallel "legacy" state. This is the single
state store `GameView`'s `EncounterView` and `PlaytestHarness` both
consume. Full detail: [use-encounter-state.md](components/use-encounter-state.md).

## dungeonMapGeometry: derived tile/wall geometry

`hooks/dungeonMapGeometry.ts` (renamed from `useDungeonMap.ts` in slice
3, which also dropped the stateful hook and its `Room`-accumulation
logic — `LobbyView`-only, no other consumer) holds three pure,
state-free helpers `hex-grid/*` and the playtest map still depend on:
`AbsoluteFloorTile` (tile shape), `wallKey` (canonical wall-dedup key),
`openDoorWalkableKeys` (open-door cube keys for pathfinding). No proto
mutation, no accumulated multi-room state — that's future work (slice 4).
`wallKey` has two call sites: `useEncounterState.applyWallsRevealed`, where
it's the sticky store's `Map` key and does the actual dedup (a wall
reported from either adjacent hex collapses to one entry before
`Array.from(walls.values())` ever reaches `HexGrid`), and `HexGrid`'s
render loop, which reuses the same direction-normalized string only as the
React `key` for each `ShadedHexWall` — it does not itself dedupe the
`walls` array it's given.
Full detail: [use-dungeon-map.md](components/use-dungeon-map.md).

## Transform functions: deleted with LobbyView

The five `EncounterStateData`→`Room`/`EntityPlacement`/`DoorInfo`
transform functions (`entityStateToPlacement`, `roomFromEncounterState`,
`doorsFromEncounterState`, `monstersFromEncounterState`,
`applyMonsterMovement`) lived as module-level functions inside
`LobbyView.tsx` and were deleted with it in slice 3. The proposed
extraction to `utils/encounterStateTransforms.ts` (PR #378) never merged
and is now moot. The live path has no equivalent transform layer:
`EncounterMap`/`useEncounterState` consume stream events directly. See
[encounter-state-transforms.md](components/encounter-state-transforms.md).

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

`@kirkdiggler/rpg-api-protos` is installed from GitHub. Version bumps require regenerating the lock file: `rm -rf node_modules package-lock.json && npm install`. The `CLAUDE.md` documents this. Failure to regenerate can cause CI to use stale proto code despite `package.json` being updated.
