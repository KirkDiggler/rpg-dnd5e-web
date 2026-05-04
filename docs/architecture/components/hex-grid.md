---
name: hex-grid components and utils
description: HexGrid, HexTile, HexEntity, MediumHumanoid, hexUtils, hexMath — well-tested geometry, no rendering tests
updated: 2026-05-02
confidence: high — verified by reading hexUtils.ts, hexMath.ts, useMovementRange.ts, useHexInteraction.ts, and their test files
---

# hex-grid components and utils

## Geometry and math

`src/components/hex-grid/hexMath.ts` — cube coordinate system (q, r, s). Distance, neighbor enumeration, and axial-to-world conversion.

`src/utils/hexUtils.ts` — BFS reachability (`getReachableHexes`), A\* pathfinding (`findPath`), and the `wallKey` canonicalization function that also lives in `useDungeonMap.ts`. Two copies of `wallKey` exist — they should be consolidated to one.

`src/components/hex-grid/hexGeometry.ts` — vertex positions, edge midpoints for Three.js mesh construction.

## useMovementRange

`src/components/hex-grid/useMovementRange.ts` — converts movement speed (in feet) to hex steps (`Math.floor(feet / 5)`), runs BFS to get reachable hexes, calculates boundary edges for the movement range border visualization.

**Tests:** `useMovementRange.test.ts` — 22 tests covering feet-to-steps conversion, BFS reachability, A\* pathfinding integration, boundary edge calculation, and edge cases (zero movement, very large movement, null position). The test for "very large movement values" takes 343ms — a canary for BFS performance regressions.

## useHexInteraction

`src/components/hex-grid/useHexInteraction.ts` — pointer event handling on the hex grid. Converts 3D ray-cast hits to cube coordinates, manages hover and selection state.

**Tests:** `useHexInteraction.test.ts` — covers the coordinate conversion logic.

## Visual components

| Component                                  | Purpose                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `HexTile.tsx` / `InstancedHexTiles.tsx`    | Floor tile geometry (instanced for performance)                  |
| `HexWall.tsx` / `ShadedHexWall.tsx`        | Wall geometry with cel-shading                                   |
| `HexDoor.tsx`                              | Door geometry, open/closed state visual                          |
| `HexEntity.tsx`                            | Entity container — positions `MediumHumanoid` at hex coordinates |
| `MediumHumanoid.tsx`                       | 12-part OBJ voxel character model assembly                       |
| `CharacterHair.tsx`, `CharacterWeapon.tsx` | Hair and weapon attachment models                                |
| `MovementRangeBorder.tsx`                  | BFS range visualization outline                                  |
| `PathPreview.tsx`                          | A\* path line preview                                            |
| `TurnOrderOverlay.tsx`                     | Initiative order numbers on entities                             |
| `ShadedHexFloor.tsx`                       | Floor with shader-based shading                                  |

## MediumHumanoid: no error boundary

`MediumHumanoid.tsx` loads 12 OBJ parts with `useLoader(OBJLoader, path)`. If any file is missing from `public/models/characters/`, Three.js throws an unhandled error. There is no `ErrorBoundary` wrapping the 3D canvas. Missing model files will crash `BattleMapPanel`.

## Shader system

`src/shaders/AdvancedCharacterShader.ts` — detects 5 marker colors in textures (`#FFFFFF` skin, `#F704FF` armor primary, `#E5FF02` accent, `#1EDFFF` tertiary, `#2BFF06` decorative) and replaces them at runtime with class-specific colors. Textures use `NearestFilter` + `NoColorSpace` for pixel-accurate detection.

`src/shaders/OutlineShader.ts` — cel-shading outline effect.

## No rendering tests

No snapshot or canvas tests for any of the visual components. React Three Fiber requires a WebGL context, which makes testing difficult. At minimum, prop-level tests (does `HexEntity` receive the right position?) could be written with a mocked R3F context.
