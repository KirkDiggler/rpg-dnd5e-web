---
name: useDungeonMap (deleted — replaced by dungeonMapGeometry)
description: The v1alpha1 room-accumulation hook was deleted in slice 3; its still-live pure geometry helpers moved to dungeonMapGeometry.ts
updated: 2026-07-12
confidence: high — verified by reading dungeonMapGeometry.ts + its test and a clean grep for useDungeonMap across src/
---

# useDungeonMap — deleted

`src/hooks/useDungeonMap.ts` was deleted in slice 3 of the
[game-screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447). The `useDungeonMap()` hook itself — its
`mergeRoom`/`updateEntitiesFromRoom`/`generateFloorTiles`/
`createEmptyState` internals and the `DungeonMapState`/`currentRoomId`
accumulation it built from v1alpha1 `Room`/`DoorInfo` events — was
`LobbyView`-only (via `BattleMapPanel`) and had no other consumer.

Multi-room accumulation on the v1alpha2 stream is future work
(design.md's slice 4), not yet rebuilt.

## What survived: `src/hooks/dungeonMapGeometry.ts`

Three pure, state-free helpers that `hex-grid/*` and the playtest map
depend on had nothing to do with the v1 accumulation hook — they're
coordinate-key math with no proto-version lean:

| Export                        | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `AbsoluteFloorTile`           | Floor tile shape in dungeon-absolute coordinates                                |
| `wallKey(wall)`               | Canonical wall-segment key (direction-independent, dedup)                       |
| `openDoorWalkableKeys(doors)` | Cube-coord keys for open doors, so HexGrid's pathfinder treats them as walkable |

These moved into the new file verbatim and kept their tests
(`dungeonMapGeometry.test.ts`, trimmed to just these three).
