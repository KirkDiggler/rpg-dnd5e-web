---
name: rpg-dnd5e-web architecture overview
description: Rendering rules, layer boundaries, and the stream layer
updated: 2026-07-12
confidence: medium — layer map, transport, and stream/state sections refreshed for slice 3 (rpg-dnd5e-web#447, LobbyView deletion); rendering-rule violation list and other sections not independently re-verified this pass
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

- `DnDSkills.tsx:11,99-101` — `Math.floor((score - 10) / 2)` implements the D&D ability modifier formula directly, plus adds proficiency bonus to compute total skill modifier. These calculations belong in rpg-toolkit, exposed via the API.
- `SavingThrowsDisplay.tsx:17` — Same formula, second independent copy.
- `DnDSavingThrows.tsx:11` — Third copy.
- `diceCalculations.ts:27` — Fourth copy. (At minimum this one is tested.)
- `Phase1Demo.tsx:172` — Fifth copy (demo code, lower priority).

(A sixth copy in `combat-v2/panels/CharacterInfoSection.tsx` was deleted
along with the rest of `combat-v2/` in slice 3 of the game-screen rebuild
— rpg-dnd5e-web#447 — not fixed, just gone with its file.)

Five remaining independent implementations of `floor((score - 10) / 2)` means five places to diverge from the rulebook. The correct fix is for the API to include computed modifier and skill values in the character proto response, not for the web to re-implement D&D math.

### Rule 2: Proto types are the contract.

Consume `@kirkdiggler/rpg-api-protos` generated types directly. Do not re-shape them into web-specific interfaces unless the re-shape is a pure UI concern (display strings, derived layout).

**Permitted:**

- `featureData.ts` — TypeScript interfaces for JSON-encoded toolkit data embedded in proto `bytes` fields. These are not proto messages; they decode opaque bytes, so a local type is necessary.
- `conditionData.ts` — Same pattern.
- `AbsoluteFloorTile` in `hooks/dungeonMapGeometry.ts` — Derived tile-key shape (dungeon-absolute coordinates) that has no proto equivalent.

**Violations:**

- `types/choices.ts` — `SkillChoice`, `LanguageChoice`, `EquipmentChoice`, etc. are hand-rolled interfaces that parallel proto message shapes. Verified by inspection: these do not appear to shadow proto types exactly, but they need a one-time audit to confirm they are not stale copies.

### Rule 3: Stream subscription is load-bearing.

`useEncounterStream` is the difference between playable and broken. It is the only path for multiplayer event delivery. Treat it with the same caution as database migration code. Zero tests currently exercise it.

## Layer map

Slice 3 of the [game-screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447) deleted `LobbyView.tsx` and the v1alpha1 path it ran.
`GameView` is the live game route; it shares its stream/state hooks with
the permanent `/playtest` verification harness — see
[game-view.md](components/game-view.md) and
[playtest-harness.md](components/playtest-harness.md).

```
Browser / Discord iframe
       |
  App.tsx (router: GameView route, or /playtest's PlaytestHarness in dev)
       |
  +----+----------------------+
  |                           |
GameView                PlaytestHarness
├── LobbyFlow            (dev verification UI)
└── EncounterView             |
  |                           |
  +----+----------------------+
       |
useEncounterStream  (stream layer — load-bearing, shared)
       |
useEncounterState   (unified entity/turn/prompt state, shared)
       |
api/client.ts (Connect RPC transport + interceptors)
       |
rpg-api gRPC server
```

`EncounterMap` (game) and `PlaytestMap` (harness) both render through the
same `HexGrid`, adapting v2 stream state via shared pure helpers in
`components/playtest/playtestMapHelpers.ts` — "generalize, don't lift."

## gRPC / transport layer

`src/api/client.ts` creates four Connect RPC clients:

- `encounterClient` — v1alpha2 `EncounterService`, the live game loop
- `lobbyClient` — v1alpha1 `LobbyService` (party assembly, distinct from the deleted v1alpha1 `EncounterService` lobby RPCs)
- `characterClient` — character CRUD
- `diceClient` — dice rolling

Auth and logging interceptors are applied at the transport level. The `/.proxy` URL detection for Discord Activity sandbox is in `client.ts`.

## Stream layer

`useEncounterStream` subscribes to the v1alpha2 `StreamEncounter` RPC. Its
first message is always `SnapshotDelivered`, which is the sync barrier —
there is no separate load-then-stream buffering step (that was the
deleted v1alpha1 hook's design). Reconnect uses exponential backoff (1s →
30s cap, 10 attempts), config shared with `useLobbyStream`. Full detail:
[use-encounter-stream.md](components/use-encounter-stream.md).

## State management

`useEncounterState` is the single entity/turn/prompt store, populated
exclusively from v1alpha2 delta events — no snapshot-replace path, no
parallel "legacy" state. Full detail:
[use-encounter-state.md](components/use-encounter-state.md).

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
