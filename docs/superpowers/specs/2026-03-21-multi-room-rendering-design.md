# Multi-Room Dungeon Rendering — Phases 3-5

## Context

Phases 1-2 of the multi-room dungeon design are complete:

- **Phase 1 (API):** Room.origin is populated with absolute cube coordinates
- **Phase 2 (UI):** `useDungeonMap` hook accumulates rooms with absolute coordinates (PR #328)

This spec covers phases 3-5: rendering the accumulated map, camera behavior, and basic room navigation.

**Issues:** rpg-dnd5e-web #312, #313, #310
**Design doc:** rpg-project/ideas/multi-room-dungeons/design.md

## Scope

- **#312:** Render tiles at absolute positions from `useDungeonMap`
- **#313:** Camera auto-centers on active character at turn start; free pan otherwise; fix WASD stuck-key bug
- **#310 (simplified):** Contiguous map with panning. No mini-map or room list — deferred to post-playtest.

## Data Flow

### Current

```
LobbyView -> BattleMapPanel(room) -> HexGrid(gridWidth, gridHeight, entities) -> InstancedHexTiles(gridWidth, gridHeight)
```

### Target

```
LobbyView -> BattleMapPanel(dungeonMap, currentRoomId) -> HexGrid(floorTiles, allEntities, allWalls, allDoors) -> InstancedHexTiles(floorTiles)
```

- **LobbyView** passes `dungeonMap` (from `useDungeonMap`) and `currentRoomId` to `BattleMapPanel`
- **BattleMapPanel** extracts accumulated state from `dungeonMap` and passes it down
- **HexGrid** receives `Map<string, AbsoluteFloorTile>` for tiles, accumulated entities/walls/doors
- **InstancedHexTiles** iterates floorTiles map, places one instance per tile at absolute position via `cubeToWorld()`
- The `room` prop stays available for current-room context (e.g., which room the active character is in)

## Coordinate Space

Entity positions and wall positions from the API are **already absolute** — the toolkit's `localToAbsolute()` converts entity positions during persistence, so by the time they reach the client they are in dungeon-absolute cube coordinates. `useDungeonMap.mergeRoom()` stores them directly without further offset. Floor tiles are generated from room origin + dimensions (also absolute). All coordinates in `DungeonMapState` are dungeon-absolute.

## Component Changes

### InstancedHexTiles.tsx

**Props change:**

- Remove: `gridWidth`, `gridHeight`
- Add: `floorTiles: Map<string, AbsoluteFloorTile>`

**Rendering:**

- Instance count = `floorTiles.size`
- Iterate `floorTiles`, call `cubeToWorld()` per tile for world position
- Tile coloring unchanged (default gray, hovered lighter, selected green, door brown)
- Hover/click lookup uses floorTiles map key (`"x,y,z"`) instead of grid index math

**Dynamic tile count:**

- Recreate instanced mesh when `floorTiles.size` changes (room reveal is infrequent)
- Accept brief flicker on reveal; optimize later if needed
- Clear `hoveredHex`/`selectedHex` state on tile count change to avoid stale references

### HexGrid.tsx

**Props change:**

- Remove: `gridWidth`, `gridHeight`
- Add: `floorTiles: Map<string, AbsoluteFloorTile>`, accumulated entities/walls/doors

**Bounds checking:**

- Replace `coord.x < 0 || coord.x >= gridWidth` with `floorTiles.has("x,y,z")`
- Naturally handles irregular multi-room shapes

**Blocking:**

- `isBlocked(coord)` checks all accumulated entities across rooms

**Grid center:**

- Computed from bounding box of all tiles (min/max world positions, midpoint)

**Pathfinding (`findHexPath` in hexUtils.ts):**

- Currently has no walkability check — only checks `occupiedPositions`
- Add a `walkable: Set<string>` parameter so neighbors outside the map are rejected
- Pass the floorTiles key set as `walkable` from callers
- This enables paths to cross room boundaries while preventing off-map pathing

**Interaction (hover, click, movement range):**

- All use cube coords already — validity check switches from grid bounds to map membership

### useHexInteraction.ts

**Props change:**

- Remove: `gridWidth`, `gridHeight`
- Add: `floorTiles: Map<string, AbsoluteFloorTile>` (or a `Set<string>` of valid tile keys)

**`isValidHex` callback:**

- Currently checks `coord.x >= 0 && coord.x < gridWidth && coord.z >= 0 && coord.z < gridHeight`
- Change to `floorTiles.has(coordKey(coord))` — valid if the tile exists in the accumulated map

**`useMovementRange` (consumed via isBlocked):**

- No direct changes needed — it receives `isBlocked` from HexGrid, which will now use floorTiles membership

### BattleMapPanel.tsx

- Accept `dungeonMap` and `currentRoomId` props
- Extract `floorTiles`, accumulated entities, walls, doors from dungeonMap
- Pass accumulated state to HexGrid

### LobbyView.tsx

- Pass `dungeonMap` (from `useDungeonMap`) and `currentRoomId` to BattleMapPanel
- Already calls `addRoom`/`updateEntities` correctly for accumulation

## Camera

### Auto-center on turn start

- When active character's turn begins, camera lerps to character's world position
- Uses `cubeToWorld()` on character's cube coords
- Lerp duration ~0.5s via `useFrame` interpolation
- Once within threshold, stop interpolating

### Free pan between turns

- WASD/drag panning works normally
- No forced camera movement except on turn start

### Initial position

- Camera centers on gridCenter (bounding box midpoint of all tiles) at session start

### Zoom

- Manual scroll wheel zoom only. No auto zoom-to-fit for now.

### Auto-center trigger mechanism

- `useCameraControls` gets a new optional prop: `focusTarget: THREE.Vector3 | null`
- When `focusTarget` changes (new turn starts), set an internal lerp target
- `useFrame` interpolates camera position + lookAt toward the focus target over ~0.5s
- If user pans (WASD/drag) during lerp, cancel the lerp immediately (user takes control)
- Callers compute `focusTarget` from active character position via `cubeToWorld()`

### WASD stuck-key bug fix

- Root cause: `keydown` fires but `keyup` is missed when window loses focus (alt-tab, overlay)
- Fix: Add `blur` event listener on `window` that resets all keys in `keys.current` to `false`

## Door Interaction

The existing flow handles room reveals:

1. Player clicks door -> `OpenDoor` RPC -> API reveals room -> `RoomRevealedEvent`
2. `useDungeonMap.addRoom()` -> floorTiles grows -> InstancedHexTiles recreates with new tiles
3. New room appears adjacent (absolute positioning) — no transition, no room swap

"Going back" is panning the camera. All revealed rooms remain rendered with their entities.

Ensure already-opened doors don't trigger OpenDoor again — check `door.isOpen` in the door click handler (HexGrid.tsx or LobbyView.tsx `handleDoorClick`).

## Acceptance Criteria

- Two rooms rendered simultaneously with tiles at correct absolute positions
- Path preview crosses room boundaries
- Camera lerps to active character position within ~0.5s on turn start
- WASD panning does not stick after alt-tab or focus loss
- Opening a door renders the new room adjacent without replacing the existing one
- Already-opened doors do not re-trigger OpenDoor RPC
- Movement range visualization works across room boundaries

## Out of Scope

- Mini-map (#266)
- Room list / room tabs
- Monster presence indicators on rooms
- Auto zoom-to-fit
- Animated room reveal transitions

## Files Modified

| File                                            | Change                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `src/components/hex-grid/InstancedHexTiles.tsx` | floorTiles prop, absolute positioning                            |
| `src/components/hex-grid/HexGrid.tsx`           | floorTiles prop, bounds via set membership, bounding box center  |
| `src/components/encounter/BattleMapPanel.tsx`   | dungeonMap prop, extract accumulated state                       |
| `src/components/LobbyView.tsx`                  | Pass dungeonMap to BattleMapPanel                                |
| `src/components/hex-grid/useHexInteraction.ts`  | floorTiles prop replaces gridWidth/gridHeight, isValidHex update |
| `src/utils/hexUtils.ts`                         | Add `walkable` set param to `findHexPath`                        |
| `src/components/hex-grid/useCameraControls.ts`  | focusTarget prop, lerp logic, WASD blur fix                      |
