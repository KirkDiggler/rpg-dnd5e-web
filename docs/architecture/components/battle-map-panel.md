---
name: BattleMapPanel
description: React Three Fiber hex grid rendering — clean props interface, no tests
updated: 2026-05-02
confidence: high — verified by reading BattleMapPanel.tsx (194 lines)
---

# BattleMapPanel

`src/components/encounter/BattleMapPanel.tsx` — **194 lines.**

Renders the 3D hex grid for combat. Uses React Three Fiber (R3F) to compose a Three.js scene from hex components.

## Props

Props are proto-shaped and come directly from LobbyView state:

- `dungeonMap: DungeonMapState` — accumulated room geometry from `useDungeonMap`
- `entities: Map<entityId, EntityState>` — from `useEncounterState` (new path)
- `combatState: CombatState | undefined` — initiative, current turn
- `currentPlayerId: string` — for highlighting the active player's entity
- `onHexClick`, `onEntityClick` — interaction callbacks

The props boundary between `LobbyView` and `BattleMapPanel` is clean. `BattleMapPanel` does not import from the API layer or call hooks that touch the stream.

## Rendering

`BattleMapPanel` composes:

- `ShadedHexFloor` / `InstancedHexTiles` — floor geometry from `dungeonMap.floorTiles`
- `HexWall` / `ShadedHexWall` — wall geometry from `dungeonMap.walls`
- `HexDoor` — door rendering from `dungeonMap.doors`
- `HexEntity` — per-entity rendering (position, model, selection state)
- `MovementRangeBorder` — BFS movement range visualization
- `PathPreview` — A\* pathfinding preview
- `TurnOrderOverlay` — initiative order overlay

Camera is managed by `useCameraControls`.

## No error boundary

`MediumHumanoid.tsx` loads 12 OBJ files via `useLoader(OBJLoader, path)`. If any model file is missing from `public/models/characters/`, Three.js throws. There is no error boundary around the 3D canvas. A missing OBJ file will crash the entire BattleMapPanel with an unhandled error.

## No tests

Zero vitest tests. React Three Fiber components are notoriously difficult to test (requires WebGL context), but there is no snapshot or interaction test at any level. The movement range visualization and path preview are tested indirectly through `useMovementRange.test.ts` and `hexUtils.test.ts`.

## Cross-room pathing

`walkableTileKeys: Set<string>` is passed from LobbyView. The A\* pathfinder uses this set. Cross-room pathing (moving between revealed rooms) should work in principle since `dungeonMap.floorTiles` spans all revealed rooms. In practice this path is not exercised by existing integration tests.
