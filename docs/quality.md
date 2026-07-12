---
name: rpg-dnd5e-web quality scorecard
description: Per-component grade with rationale — a graded scorecard to be updated over time
updated: 2026-07-12
confidence: low-medium — sections below are dated 2026-05-02 and predate slices 1-2 of the game-screen rebuild; slice 3 (rpg-dnd5e-web#447) removed entries for deleted components and refreshed the stream/state grades, but grades for character creation/sheet, hex-grid, Discord wiring, and other untouched areas are not independently re-verified this pass. This doc needs a dedicated refresh pass.
---

# Quality scorecard

Every area graded A–D. Grades reflect a holistic read of: design clarity,
test coverage, known gaps, and operational risk.

---

## Stream / real-time layer

### useEncounterStream — B

Renamed from `useEncounterStream2` in slice 3 (rpg-dnd5e-web#447) — the
v1alpha1 hook it used to coexist with, along with its `LobbyView`
consumer, is deleted. The lifecycle is simple: the stream's own first
message (`SnapshotDelivered`) is the sync barrier, no separate
snapshot-RPC-then-buffer step. Reconnect uses exponential backoff, config
shared with `useLobbyStream`. Mount-churn resilience (#442) is
generation-tagged to survive React StrictMode's dev double-invoke without
a stale attempt's belated rejection clobbering a newer one.

Gaps:

- No direct vitest coverage of the live gRPC `for await` loop (mocking an
  `AsyncIterable` stream end-to-end is high-effort for marginal value
  over MCP playtest verification, which exercises the real path).
  `encounterStreamDispatch.ts`'s pure dispatch switch and
  `streamReconnect.ts`'s config ARE tested independently.
- React StrictMode double-mount causes double stream connections in
  development. Documented as "normal and expected" in CLAUDE.md.

### gRPC client — B-

Clean Connect RPC client setup (`characterClient`, `encounterClient`,
`lobbyClient`, `diceClient`) with auth + logging interceptors well
factored in `client.ts`. The old v1alpha1 `encounterHooks.ts`/
`lobbyHooks.ts` wrapper hooks this section used to grade are deleted
(rpg-dnd5e-web#447) — their only real consumers (`LobbyView` and a
pre-existing orphaned tree with zero live consumers even before this
change) are gone. The live action-dispatch hooks
(`useMoveEntity`/`useEndTurn`/`useInteract`/`useTakeAction`/
`useSubmitCheck`/`useActivateFeature`, all renamed off their `V2` suffix
in slice 3) are per-RPC thin wrappers with a consistent shape and direct
vitest coverage each.

Gap: logging interceptor emits emoji-prefixed `console.log` in dev.
Useful, but will need disabling or leveling before a polished demo.

---

## State management

### dungeonMapGeometry — A-

Renamed from `useDungeonMap.ts` in slice 3. The stateful hook and its
`Room`-accumulation logic (`mergeRoom`, `updateEntitiesFromRoom`,
`generateFloorTiles`, `createEmptyState`) were `LobbyView`-only and
deleted with it. What's left — `AbsoluteFloorTile`, `wallKey`,
`openDoorWalkableKeys` — are three small pure functions with full test
coverage and no known gaps. Multi-room accumulation on the v1alpha2
stream doesn't exist yet (design.md's slice 4); this file is geometry
math with nothing to accumulate into yet.

### useEncounterState — B+

Delta-only design: every reducer merges one event's data into existing
state, no full-replace-from-snapshot path. The v1alpha1 snapshot-replace
functions (`applySnapshotToState`, `mergeEntityUpdates`,
`applyCombatState`) that only `LobbyView` drove — along with the
`rooms`/`currentRoomId`/`revealedRoomIds`/`combat`/`doors`/
`dungeonState`/`roomsCleared` fields they alone populated — were deleted
in slice 3. Every remaining field/reducer is exercised by `EncounterView`
and/or `PlaytestHarness`. Reducers are pure, well-tested, and idempotent
where cheap (return the same reference when nothing changed, avoiding
spurious re-renders).

Gap: `entities: Map<string, EntityState>` uses the v1alpha1 `EntityState`
proto as its value shape — an intentional upstream wire-reuse decision
(the v1alpha2 stream's entity payloads carry v1alpha1-shaped data), worth
knowing if this file resurfaces in a future `v1alpha1` grep gate.

---

## Components

### GameView / EncounterView / LobbyFlow — B+

Live successor to `LobbyView` (deleted, rpg-dnd5e-web#447). `GameView` is
a two-state switch (lobby vs encounter); `LobbyFlow` and `EncounterView`
compose already-proven pieces (`useEncounterStream`, `useEncounterState`,
`ActionMenu`/`EconomyBar`, `HexGrid` via `EncounterMap`) rather than
reimplementing a combat UI from scratch. Sharing hooks with
`PlaytestHarness` is what makes MCP playtest verification a proof of the
live game path. See [game-view.md](architecture/components/game-view.md).

Gaps: equipment modal, dungeon result overlay, and multi-room
accumulation are not built yet (explicitly out of scope through slice 3,
scheduled later per design.md).

### hex-grid components (HexGrid, HexTile, HexEntity, MediumHumanoid) — B-

Voxel aesthetic with shader-based texture color replacement works.
`MediumHumanoid` assembles 12 OBJ parts with class-specific textures and
fallback chains. `useHexInteraction` is tested; its `AbsoluteFloorTile`
import moved to `dungeonMapGeometry.ts` in slice 3 with no behavior
change.

Gaps:

- No rendering tests (React Three Fiber components are hard to test, but
  there is no snapshot or interaction test coverage at all).
- `MediumHumanoid` imports 12 OBJ parts via `useLoader` — no error
  boundary if a model file is missing; Three.js will throw and bubble up.

### /concepts route — B

Good sandbox pattern. `ConceptsView.tsx` routes to isolated prototypes
without affecting production. Gaps: no documented process for promoting a
concept to production; the route exists in the app router but is
undocumented in the main README.

---

## Infrastructure

### Proto integration (@kirkdiggler/rpg-api-protos) — B+

Types are used directly from generated protos — no hand-rolled
TypeScript interfaces duplicating proto shapes. `@bufbuild/protobuf`
`create()` pattern is used correctly. The CLAUDE.md lock-file discipline
(delete `node_modules` + `package-lock.json` on version bumps) is
documented.

Gap: `$typeName` and `$unknown` fields must be manually set when
constructing proto-compatible objects by hand. This is a protobuf-es v2
constraint, not a design flaw, but it is a foot-gun for new contributors.

### Discord Activity wiring — B-

`DiscordProvider` + `useDiscord` hook is a clean abstraction. The
`/.proxy` URL detection for Discord Activity is correct. Auth interceptor
handles both real Discord tokens and dev fallback.

Gaps:

- `isDevelopment ? 'test-player' : null` fallback (now in `App.tsx`, was
  in `LobbyView` before its deletion) means a production Discord auth
  failure silently falls through to `null` rather than surfacing an
  error.
- No test of the Discord SDK initialization path.

### vitest / test infrastructure — B-

37 test files, 569 tests, all passing (verified 2026-07-12 by running
`npx vitest run`, post-slice-3). Vitest 4.x, no flaky tests observed.
`dungeonMapGeometry.test.ts` and `useEncounterState.test.ts` are among
the most complete suites and serve as templates for new tests.
`PlaytestHarness.test.tsx` and `EncounterView.test.tsx` are the rare
component-level suites; nearly everything else is utility/hook-layer.

The fundamental gap: near-zero coverage of anything that renders a
Three.js canvas (`HexGrid` and everything under it). This grade moved
from the pre-slice-3 C+ mostly because a large share of the previously
untested surface (`LobbyView`, `BattleMapPanel`, `combat-v2` panels) is
now deleted rather than covered — the remaining untested surface is
smaller, not better-tested.

---

## Grade legend

- **A** — strong design, good tests/observability, no major known gaps
- **B** — works reliably; some known gaps or missing polish
- **C** — has known regression, significant structural risk, or untested critical path
- **D** — blocked, broken, or so under-exercised that state is unknown

## How this doc is meant to work

Grades were a first draft from 2026-05-02, refreshed for slice 3
(rpg-dnd5e-web#447, LobbyView deletion) on 2026-07-12 — entries for
deleted components are removed rather than graded, and the stream/state
grades reflect the current trimmed design. Sections not touched by slice
3 (character creation/sheet, Discord wiring beyond the fallback note,
`/concepts`) are carried forward unverified and still need their own
read-through pass.
