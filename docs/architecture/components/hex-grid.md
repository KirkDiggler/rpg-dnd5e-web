---
name: hex-grid components and utils
description: HexGrid, HexTile, HexEntity, MediumHumanoid, hexUtils, hexMath — well-tested geometry, no rendering tests
updated: 2026-07-23
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

| Component                                  | Purpose                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `HexTile.tsx` / `InstancedHexTiles.tsx`    | Floor tile geometry (instanced for performance)                                                                          |
| `HexWall.tsx` / `ShadedHexWall.tsx`        | Wall geometry with cel-shading                                                                                           |
| `HexDoor.tsx`                              | Door geometry, open/closed state visual                                                                                  |
| `HexEntity.tsx`                            | Entity container — positions the resolved class/monster model and threads the local owner's exact main-hand presentation |
| `ClassCharacterModel.tsx`                  | Animated Synty class/monster GLB clone; attaches a normalized standalone main-hand GLB beneath cloned `Hand_R`           |
| `mainHandWeapons.ts`                       | Exact 27-ref production presentation catalog plus shared `townfolk-main-hand-v1` socket; no equipment rules              |
| `MediumHumanoid.tsx`                       | 12-part OBJ voxel character fallback assembly                                                                            |
| `CharacterHair.tsx`, `CharacterWeapon.tsx` | Legacy OBJ hair/weapon attachments used by the fallback renderer                                                         |
| `MovementRangeBorder.tsx`                  | BFS range visualization outline                                                                                          |
| `PathPreview.tsx`                          | A\* path line preview                                                                                                    |
| `TurnOrderOverlay.tsx`                     | Initiative order numbers on entities                                                                                     |
| `ShadedHexFloor.tsx`                       | Floor with shader-based shading                                                                                          |

## Door wall contract

`DOOR_CLOSED`, `DOOR_OPEN`, and `DOOR_LOCKED` are all door geometry, not
solid walls. Each uses the wire-designated `Wall.from -> Wall.to` edge and
retains `Wall.id` for the existing click -> `Interact(id)` intent path. The
client only renders the state: the server owns lock checks, prompts, retries,
and unlock outcomes. Locked doors use a distinct material state in both the
Synty and fallback renderers; only `DOOR_OPEN` is walkable.

## Class GLB main-hand boundary

`SessionEncounterView` resolves only the acting owner's authoritative
`equipped.main_hand`. `SessionCanvas` applies that presentation only to the
local `HexEntity`; `otherMembers` never inherit it. `ClassCharacterModel` keeps
the class GLB unarmed on disk, clones the standalone weapon, disables its
raycast, and attaches it under the cloned `Hand_R`. Missing/unknown refs,
invalid sockets, missing bones, and GLB load failures preserve the character
and render unarmed.

Fighter, barbarian, monk, and rogue use the same accepted socket. The browser
contains neither item-specific transforms nor a class × weapon correction
matrix. Off-hand contact and two-hand posing are not implied by this rigid
right-hand presentation.

## MediumHumanoid: no error boundary

`MediumHumanoid.tsx` loads 12 OBJ parts with `useLoader(OBJLoader, path)`. If any file is missing from `public/models/characters/`, Three.js throws an unhandled error. There is no `ErrorBoundary` wrapping the 3D canvas. Missing model files will crash `BattleMapPanel`.

## Shader system

`src/shaders/AdvancedCharacterShader.ts` — detects 5 marker colors in textures (`#FFFFFF` skin, `#F704FF` armor primary, `#E5FF02` accent, `#1EDFFF` tertiary, `#2BFF06` decorative) and replaces them at runtime with class-specific colors. Textures use `NearestFilter` + `NoColorSpace` for pixel-accurate detection.

`src/shaders/OutlineShader.ts` — cel-shading outline effect.

## No rendering tests

No snapshot or canvas tests for any of the visual components. React Three Fiber requires a WebGL context, which makes testing difficult. At minimum, prop-level tests (does `HexEntity` receive the right position?) could be written with a mocked R3F context.
