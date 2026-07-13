---
name: rpg-dnd5e-web quality scorecard
description: Per-component grade with rationale — a graded scorecard to be updated over time
updated: 2026-07-13
confidence: low-medium — sections below are dated 2026-05-02 and predate slices 1-2 of the game-screen rebuild; slice 3 (rpg-dnd5e-web#447) removed entries for deleted components and refreshed the stream/state grades, and rpg-dnd5e-web#449 added a first-pass grade for character creation/sheet (previously the audit's blind spot). hex-grid, Discord wiring, and other untouched areas are still not independently re-verified this pass. This doc needs a dedicated refresh pass.
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

### character-sheet / character-creation — C

The audit blind spot flagged when this doc was refreshed for slice 3: not
independently re-verified since 2026-05-02, and not touched by that slice.
Reviewed for rpg-dnd5e-web#449 (2026-07-13), which fixed the one live
boundary-rule violation found: `CharacterSheet.tsx`'s routed sheet
(`DnDCombatStats`, `DnDSkills`, `DnDSavingThrows`, plus the
`ProficiencyBonusBox` in `CharacterSheet.tsx` itself) silently computed AC,
initiative, and proficiency bonus client-side whenever the corresponding
`CombatStats` field was unset — the server's gap read as a plausible-looking
number instead of a gap. All four now render the server value or an
explicit "—", never a computed fallback. Four dead components duplicating
the same math with zero live importers (`SavingThrowsDisplay`,
`SkillsDisplay`, `CombatStatsDisplay`, `AbilityScoresDisplay`) plus three
more orphans from the same 2025 "overhaul the ui" era found during this
pass (`ProficienciesDisplay`, and creation's `CharacterSheetHeader`/
`CharacterSheetFooter`) were deleted.

One irreducible gap surfaced by the fix, not solved by it: `CombatStats`
fields (`armor_class`, `initiative`, `proficiency_bonus`) are plain
`int32`, not `optional int32`, so proto3 collapses "never computed" and
"legitimately zero" to the same wire value. `armorClass`/`proficiencyBonus`
are never validly zero in D&D 5e, so treating `<= 0` as "unset" is safe.
`initiative` has no such safety net — a DEX 10/11 character's real
initiative modifier is +0, indistinguishable on the wire from "not yet
computed." The sheet gates initiative display only on `combatStats` itself
being present, which is the most honest read the current wire format
allows; closing this fully needs an `optional` field (or wrapper) upstream
in rpg-api-protos.

DnDCombatStats.tsx's ability-modifier math (`floor((score-10)/2)` for
STR/DEX/etc., derived from server-sent raw ability scores) was left as-is
— out of #449's scope, and a materially different case from the AC/
proficiency-bonus fallback: it doesn't paper over a missing server field,
it derives a display value from one the server does send. Worth its own
audit pass if the boundary rule is read to forbid all client arithmetic,
not just fallback-for-missing-data arithmetic.

Gaps:

- Effectively zero test coverage: one test file
  (`DnDFeatures.test.tsx`) across ~25 components in `src/character/`,
  including the two largest surfaces — `InteractiveCharacterSheet.tsx`
  (1877 lines, the entire multi-step creation flow) and `CharacterSheet.tsx`
  (318 lines, the routed sheet) — neither has a single test.
- No coverage proving the new gap-indicator behavior renders correctly
  when `combatStats` fields are unset vs. populated.
- `AbilityScoresSectionV2` renamed to `AbilityScoresSection` in #449 (no
  collision, trivial rename) but its siblings in `sections/` were not
  audited for the same drift; not revisited this pass.

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
grades reflect the current trimmed design. rpg-dnd5e-web#449 (2026-07-13)
added the first independently-verified grade for character creation/sheet,
closing that blind spot. Sections still not independently re-verified
(Discord wiring beyond the fallback note, `/concepts`, hex-grid) are
carried forward and still need their own read-through pass.
