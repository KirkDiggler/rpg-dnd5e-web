---
name: rpg-dnd5e-web quality scorecard
description: Per-component grade with rationale — a graded scorecard to be updated over time
updated: 2026-05-02
confidence: low-medium — first draft from full code read-through; grades reflect structural reality but stream-bug scope is uncertain until investigated
---

# Quality scorecard

Every area graded A–D. Grades reflect a holistic read of: design clarity,
test coverage, known gaps, and operational risk.

This is a first draft. Expect grades to move as the stream bug is confirmed
or cleared and as component tests are added.

---

## Stream / real-time layer

### useEncounterStream — C+

The load-then-stream buffer pattern is the right design: start the stream,
fetch snapshot, replay buffered events newer than `lastEventId`. The
reconnect logic with exponential backoff is also correct. However:

- The `RoomRevealed` event is suspected of not reaching the browser despite
  correct code in the dispatch switch. The failure point has not been isolated.
  Until that investigation closes, this is a live unknown that blocks the
  milestone.
- The entire hook is exercised only by manual playtesting. No vitest coverage.
  The buffer-during-sync path, history fetch, and reconnect path are all
  untested.
- React StrictMode double-mount causes double stream connections in development.
  The CLAUDE.md documents this as "normal and expected," but it means the dev
  experience masks potential connection-state bugs.

Grade would be B- if the stream bug is cleared; C+ reflects the current
unknown.

### gRPC client / encounterHooks — B-

Clean hook wrappers (`useOpenDoor`, `useMoveCharacter`, etc.) with consistent
`{ data, loading, error }` shape. Auth interceptor and logging interceptor in
`client.ts` are well-factored. Gaps:

- No tests. Error paths for every RPC hook are manually tested only.
- `useLeaveEncounter` and `useOpenDoor` return `loading` state that LobbyView
  threads through 2,000+ lines of props — not ideal for scale.
- Logging interceptor emits emoji-prefixed `console.log` in dev. Useful, but
  will need disabling or leveling before a polished demo.

---

## State management

### useDungeonMap — B+

Clean accumulation-over-replacement design. `mergeRoom` is immutable and
handles the duplicate-room (update) case correctly. `wallKey` normalization
prevents shared boundary walls from doubling (the wall-shift bug, PR #368).
`updateEntitiesFromRoom` correctly removes dead entities. Exported pure
functions (`mergeRoom`, `generateFloorTiles`, `createEmptyState`) make unit
testing straightforward — and tests exist (part of `useDungeonMap.test.ts`).

Gap: `currentRoomId` is always overwritten to the last `mergeRoom` call.
Multi-room scenarios where the player is in room A but a second room is
merged for preview would update `currentRoom` incorrectly. Not a bug today
because rooms only merge on `RoomRevealed` when the player enters them.

### useEncounterState — B-

Correct snapshot/delta design: `applySnapshotToState` does a full replace;
`mergeEntityUpdates` does a keyed merge. Pure functions are tested. Gaps:

- Still runs alongside the "legacy" entity state in `LobbyView` (separate
  `monsters[]`, `combatState`, `fullCharactersMap` state). The dual path
  means entity data is updated in two places and can diverge.
- No door or room updates — the hook tracks combat/entities but `doors` and
  `rooms` only update on full snapshot. A `RoomRevealed` event that carries
  an `encounterStateData` does call `applySnapshot`, so doors are eventually
  consistent, but intermediate door state (open/closed between snapshots) is
  not tracked.
- `applyCombatState` replaces the full `CombatState` — correct but means the
  caller must pass the full object even when only one field changes.

---

## Transform / util layer

### encounterStateTransforms — B+

The critical path for multi-room rendering. Pure functions with no side
effects and a real test suite (25 tests in `encounterStateTransforms.test.ts`
covering `entityStateToPlacement`, `roomFromEncounterState`,
`allRoomsFromEncounterState`, `doorsFromEncounterState`, and the full pipeline
with `mergeRoom`).

Gaps:

- `entityStateToPlacement` manually reconstructs an `EntityPlacement` by
  copying fields from `EntityState`. Any new proto field on `EntityPlacement`
  that is also on `EntityState` must be manually added here; no compile-time
  reminder.
- `monstersFromEncounterState` has an implicit `any[]` return type. Should be
  `MonsterCombatState[]`.
- `allRoomsFromEncounterState` is correctly implemented and tested, but is
  NOT currently called in the `handleRoomRevealed` path (PR #377 is the fix).
  The live code in `LobbyView` still calls `roomFromEncounterState` there.

### hexUtils / hexMath — B

BFS reachability, A\* pathfinding, cube-coordinate math. Well-tested
(`hexUtils.test.ts`, `useMovementRange.test.ts` — 40+ tests between them).
The `wallKey` canonicalization that fixed the wall-shift bug lives here.
No known gaps; movement and boundary edge logic are solid.

### Other utils (characterMerge, monsterTurnUtils, entityHelpers, enumDisplays) — B-

Each has at least one test file. `characterMerge.test.ts`,
`monsterTurnUtils.test.ts`, `entityHelpers.test.ts` cover the happy paths.
Gaps:

- `enumDisplays.ts` / `enumRegistry.ts` are entirely untested; display
  string mapping is the kind of thing that silently regresses.
- `featureConditionMapping.ts` has tests but they cover a small subset of
  the feature→condition map.

---

## Components

### LobbyView — C

Correct behavior across the scenarios tested (Round 1 scenario works).
But structurally it is the riskiest file in the codebase:

- 2,256 lines, 45 hook calls.
- Runs two parallel state paths ("legacy" and "new") with 41 inline comments
  marking the seam. Any event handler that diverges between the two paths
  silently produces inconsistent UI.
- Business logic that belongs elsewhere: `applyMonsterMovement` (a Room
  mutation function) lives as a module-level function inside `LobbyView.tsx`;
  `processMonsterTurns` is a `useCallback` inside the component that does
  entity movement math.
- `handleRoomRevealed` wraps state updates in a 300ms `setTimeout` for the
  fade transition. Any state update inside that timeout uses a stale-closure
  risk (partially mitigated by `optionsRef` pattern in the stream, but not
  inside the callback itself).
- No tests. A bug in any handler requires a full manual playtest cycle to
  catch.

### combat-v2 / CombatPanel, CombatHistorySidebar — B-

Organized into panels with clear responsibilities. `CombatHistorySidebar`
(484 lines) and `ActionPanel`/`ActionPanelV2` (335/356 lines) are getting
large. The ActionPanel vs ActionPanelV2 split is unclear — README is present
but doesn't explain the distinction or which to use.

No component tests. Combat action dispatch (strike, ability, feature
activate) is wired through callbacks drilled from `LobbyView` all the way
down, making the component difficult to test in isolation.

### encounter/BattleMapPanel — B-

Clean props interface. Reads from unified `useEncounterState` entities for
HP/condition display (PR #371). Renders React Three Fiber hex grid.

Gaps:

- No tests.
- Cross-room pathing (moving entities across revealed rooms) is noted as
  still needed in project memory; the `walkableTileKeys` set passed from
  `LobbyView` should enable it but it's not exercised.

### hex-grid components (HexGrid, HexTile, HexEntity, MediumHumanoid) — B-

Voxel aesthetic with shader-based texture color replacement works.
`MediumHumanoid` assembles 12 OBJ parts with class-specific textures and
fallback chains. `useHexInteraction` and `useMovementRange` are tested.

Gaps:

- No rendering tests (React Three Fiber components are hard to test, but
  there is no snapshot or interaction test coverage at all).
- `MediumHumanoid` imports 12 OBJ parts via `useLoader` — no error boundary
  if a model file is missing; Three.js will throw and bubble up.

### lobby components (LobbyScreen, PartyMemberCard, DungeonConfigSelector) — B

Reasonable size and single-purpose. `LobbyScreen` is the clean entry into
the pre-combat flow. No tests, but these are simpler components with less
critical logic.

### /concepts route — B

Good sandbox pattern. `ConceptsView.tsx` routes to isolated prototypes
without affecting production. The class-selection spike is a real UI
improvement idea. Gaps: no documented process for promoting a concept to
production; the route exists in the app router but is undocumented in the
main README.

---

## Infrastructure

### Proto integration (rpg-api-protos v0.1.86) — B+

Types are used directly from generated protos — no hand-rolled TypeScript
interfaces duplicating proto shapes. `@bufbuild/protobuf` `create()` pattern
is used correctly. The CLAUDE.md lock-file discipline (delete
`node_modules + package-lock.json` on version bumps) is documented.

Gap: `$typeName` and `$unknown` fields must be manually set when constructing
proto-compatible objects (e.g., in `encounterStateTransforms.ts`). This is a
protobuf-es v2 constraint, not a design flaw, but it is a foot-gun for new
contributors.

### Discord Activity wiring — B-

`DiscordProvider` + `useDiscord` hook is a clean abstraction. The `/.proxy`
URL detection for Discord Activity is correct. Auth interceptor handles both
real Discord tokens and dev fallback.

Gaps:

- `isDevelopment ? 'test-player' : ''` fallback in `LobbyView` means a
  production Discord auth failure silently uses empty playerId.
- No test of the Discord SDK initialization path.

### vitest / test infrastructure — C+

15 test files, 323 tests, all passing. The test infrastructure itself is
clean: vitest 4.x, no flaky tests observed, tests run in ~1.5s. The
`encounterStateTransforms.test.ts` (25 tests) is the most complete suite and
serves as a template.

The fundamental gap: test coverage is entirely at the utility-function layer.
Zero component tests. Zero stream/hook integration tests. The most complex
and most bug-prone code paths (`useEncounterStream`, `LobbyView` event
handlers, `BattleMapPanel` rendering) are untested. 323 tests is a
beachhead, not a safety net.

---

## Grade legend

- **A** — strong design, good tests/observability, no major known gaps
- **B** — works reliably; some known gaps or missing polish
- **C** — has known regression, significant structural risk, or untested critical path
- **D** — blocked, broken, or so under-exercised that state is unknown

## How this doc is meant to work

Grades are a first draft from 2026-05-02. When you update a grade, leave a
reason. Don't just move a letter. The intended evolution:

1. Today: human-curated grades from code read-through
2. Next: as component tests are added, grades for those components move
3. Later: stream delivery confirmation either promotes `useEncounterStream`
   from C+ to B- or reveals a deeper bug worth its own ADR
