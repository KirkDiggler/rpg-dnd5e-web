---
name: rpg-dnd5e-web architecture overview
description: Rendering rules, layer boundaries, and the stream layer
updated: 2026-05-02
confidence: high — verified by reading LobbyView.tsx, useEncounterStream.ts, useDungeonMap.ts, useEncounterState.ts, BattleMapPanel.tsx, client.ts, and the proto import graph
---

# rpg-dnd5e-web architecture overview

rpg-dnd5e-web is the React/TypeScript Discord Activity UI. It renders what the API sends and sends intent back to the API. It does not calculate game outcomes.

## The three rendering rules

These are non-negotiable. Any violation is a bug.

### Rule 1: Render what the API sends. Never calculate.

The API and toolkit compute all game-mechanical results. The web layer receives final values and displays them.

**Permitted:**

- Formatting a modifier from `score` to `+3` display string
- Choosing a color based on HP percentage brackets sent by the API
- Translating a proto enum to a display label

**Violations — verify and file issues:**

- `CharacterInfoSection.tsx:33` — `Math.floor((score - 10) / 2)` implements the D&D ability modifier formula directly. The API should provide computed modifier values.
- `DnDSkills.tsx:11,99-101` — Same formula, plus adds proficiency bonus to compute total skill modifier. These calculations belong in rpg-toolkit, exposed via the API.
- `SavingThrowsDisplay.tsx:17` — Same formula, third independent copy.
- `DnDSavingThrows.tsx:11` — Fourth copy.
- `diceCalculations.ts:27` — Fifth copy. (At minimum this one is tested.)
- `Phase1Demo.tsx:172` — Sixth copy (demo code, lower priority).

Six independent implementations of `floor((score - 10) / 2)` means six places to diverge from the rulebook. The correct fix is for the API to include computed modifier and skill values in the character proto response, not for the web to re-implement D&D math.

### Rule 2: Proto types are the contract.

Consume `@kirkdiggler/rpg-api-protos` generated types directly. Do not re-shape them into web-specific interfaces unless the re-shape is a pure UI concern (display strings, derived layout).

**Permitted:**

- `featureData.ts` — TypeScript interfaces for JSON-encoded toolkit data embedded in proto `bytes` fields. These are not proto messages; they decode opaque bytes, so a local type is necessary.
- `conditionData.ts` — Same pattern.
- `DungeonMapState` in `useDungeonMap.ts` — Derived accumulation state (floor tiles, wall dedup) that has no proto equivalent.

**Violations:**

- `types/choices.ts` — `SkillChoice`, `LanguageChoice`, `EquipmentChoice`, etc. are hand-rolled interfaces that parallel proto message shapes. Verified by inspection: these do not appear to shadow proto types exactly, but they need a one-time audit to confirm they are not stale copies.

### Rule 3: Stream subscription is load-bearing.

`useEncounterStream` is the difference between playable and broken. It is the only path for multiplayer event delivery. Treat it with the same caution as database migration code. Zero tests currently exercise it.

## Layer map

```
Browser / Discord iframe
       |
  App.tsx (router)
       |
  LobbyView.tsx (2,345 lines — the hub, too large)
       |
  +----+----------------------------+
  |                                 |
useEncounterStream            BattleMapPanel.tsx
(stream layer — load-bearing) (React Three Fiber hex grid)
  |                                 |
useEncounterState             useDungeonMap.ts
(unified entity state)        (accumulated room geometry)
  |
api/client.ts (Connect RPC transport + interceptors)
  |
rpg-api gRPC server
```

## gRPC / transport layer

`src/api/client.ts` (86 lines) creates three Connect RPC clients:

- `encounterClient` — main game loop
- `characterClient` — character CRUD
- `diceClient` — dice rolling

Auth and logging interceptors are applied at the transport level. The `/.proxy` URL detection for Discord Activity sandbox is in `client.ts:12-14`.

## Stream layer: load-then-stream pattern

`useEncounterStream` implements the load-then-stream pattern:

1. Start stream subscription (gRPC server streaming via Connect RPC)
2. Set `isSyncingRef = true`, buffer all arriving events
3. Fetch snapshot via `GetEncounterState` RPC
4. Call `onStateSync` with the snapshot
5. Flush buffered events via `dispatchEvent`, set `isSyncingRef = false`
6. Subsequent events dispatch immediately

Reconnect uses exponential backoff (1s → 30s cap, 10 attempts).

**Current status:** The stream dispatch switch (`useEncounterStream.ts:99-156`) handles all event types including `roomRevealed`. Whether `RoomRevealed` events actually reach the browser has not been confirmed by devtools. This is the blocking investigation for multi-room dungeon work.

## State management: dual-path problem

Two state representations run in parallel in `LobbyView.tsx`:

| State                                            | Where                        | Description                   |
| ------------------------------------------------ | ---------------------------- | ----------------------------- |
| `useEncounterState`                              | `hooks/useEncounterState.ts` | Unified entity map (new path) |
| `monsters[]`, `combatState`, `fullCharactersMap` | LobbyView `useState`         | Legacy flat state             |
| `useDungeonMap`                                  | `hooks/useDungeonMap.ts`     | Accumulated room geometry     |

The legacy state runs alongside the new path. 26 occurrences of "legacy" in `LobbyView.tsx` mark the dual-path seam. Until Task 7 cleanup, entity data can diverge between the two representations.

## Discord Activity constraints

The app runs inside a sandboxed Discord iframe at `discordsays.com`. Relevant constraints:

- All API calls must go through `/.proxy` prefix (configured in `vite.config.ts` and the Connect RPC client).
- CSP restricts external script sources.
- `DiscordProvider` initializes the Discord Embedded App SDK. In development, the SDK stub is used.
- `DiscordDebugPanel.tsx` renders only in development mode and shows auth state / user info.

## Asset pipeline

3D voxel character models are OBJ files in `public/models/characters/`. The shader layer (`AdvancedCharacterShader.ts`) detects marker colors in textures and replaces them at runtime for class-specific coloring. `MediumHumanoid.tsx` assembles 12 OBJ parts. There is no error boundary if a model file is missing — Three.js will throw and bubble up.

## /concepts route

`/concepts` is a sandbox route for UI prototyping without touching production paths. `ConceptsView.tsx` routes to isolated prototype components. Currently contains the class-selection enriched UI spike. No documented promotion process from concept to production.
