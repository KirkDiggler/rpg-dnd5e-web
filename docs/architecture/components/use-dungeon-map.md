---
name: useDungeonMap
description: Accumulated multi-room dungeon geometry — clean design, well tested
updated: 2026-05-02
confidence: high — verified by reading useDungeonMap.ts (302 lines) and useDungeonMap.test.ts
---

# useDungeonMap

`src/hooks/useDungeonMap.ts` — **302 lines.**

Maintains the accumulated geometry of all revealed dungeon rooms in a single coordinate space. Instead of replacing room state on each reveal, it merges new rooms into a persistent map. This is the rendering foundation for multi-room dungeon play.

## Design

- **Accumulation over replacement.** `mergeRoom` adds a room's tiles, walls, entities, and doors to existing state. Re-adding the same room (e.g., on state sync) updates it in place without duplication.
- **Dungeon-absolute coordinates.** Each room's `origin` field (sent by the API) is used to offset room-local tile positions into a shared coordinate space. No coordinate calculation happens here — the origin comes from the API.
- **Wall deduplication.** `wallKey(wall)` produces a canonical string from the two endpoint cube coordinates, sorting them lexicographically so that `(A,B)` and `(B,A)` produce the same key. This fixed the wall-shift bug (PR #368) where adjacent rooms sharing a boundary wall generated duplicate geometry.
- **Immutable state.** `mergeRoom` does not mutate input state. Returns a new `DungeonMapState` object.

## Exported functions (testable)

| Function                              | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `mergeRoom(state, room, doors)`       | Add or update a room in the accumulated map                             |
| `updateEntitiesFromRoom(state, room)` | Update entity positions for a specific room (called on movement events) |
| `generateFloorTiles(room)`            | Convert a `RoomLayout` into `AbsoluteFloorTile[]`                       |
| `createEmptyState()`                  | Factory for a fresh `DungeonMapState`                                   |
| `wallKey(wall)`                       | Canonical string for wall deduplication                                 |

## Tests

`src/hooks/useDungeonMap.test.ts` — 20 tests. Covers:

- First room creation (tiles, doors, entities, walls)
- Second room accumulation (tiles from both rooms, walls from both, entity merging across rooms)
- Same room re-merge (no tile duplication, entity position update)
- Immutability
- `updateEntitiesFromRoom` (position update, dead entity removal, cross-room isolation)
- Wall deduplication (identical walls, reversed-direction walls)
- `wallKey` canonical form

## Known gap

`currentRoomId` is overwritten to the room passed to the most recent `mergeRoom` call. In current use, rooms only merge when a `RoomRevealed` event fires (the player enters a new room), so `currentRoomId` correctly tracks the player's location. If rooms were merged for preview purposes before the player entered, `currentRoomId` would be incorrect. Not a bug today.
