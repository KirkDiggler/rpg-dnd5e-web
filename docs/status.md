---
name: rpg-dnd5e-web status
description: Where we are with the React/Discord Activity UI — active work, paused, known rough edges, per-subsystem confidence
updated: 2026-07-12
confidence: medium — seeded from full code read-through, git log, and open PRs; needs Kirk's correction pass on stream-bug details
---

# rpg-dnd5e-web: Where We Are

This is a living doc. Edit it in the same PR that invalidates a line. Don't
let it rot.

## Active work

- **GameView fight-feel — combat log panel + initiative tracker (#445)** —
  `EncounterView` gains a `CombatLog` panel (new `useCombatLog` hook) rendering
  `AttackResolved`/`EntityDamaged`/`StatusApplied`/`StatusRemoved`/`TurnStarted`/
  `TurnEnded`/`EntityDied`/`EntityRemoved`/`EncounterEnded` verbatim as a
  scrolling, round-tagged log — the game-grade version of `PlaytestHarness`'s
  raw dev-log text for the same events. The `TurnOrderOverlay` HexGrid already
  had (but neither `EncounterMap` nor `PlaytestMap` wired — both passed
  `combatState={null}`) is now wired in `EncounterMap` via a new
  `buildTurnOrderCombatState` shim in `playtestMapHelpers.ts` that reshapes
  v2's `initiativeOrder`/`activeEntityId`/`round` into the v1alpha1
  `CombatState` prop `HexGrid` expects — `HexGrid`/`TurnOrderOverlay`
  themselves are unmodified. `PlaytestMap`/`PlaytestHarness` untouched; the
  656-test suite it had before this wave stays green (675 total after adding
  17 new tests for the hook/component/shim). See
  [game-view.md](architecture/components/game-view.md#combat-log--initiative-tracker-445).

- **Chapter 2 Beat 2 — status effects + attack advantage/disadvantage (#430, wave rpg-project#75)** —
  `PlaytestHarness`'s entities table gains a **status** column rendering every
  entity's active conditions (Dodging/Hidden/Helped, plus whatever else the
  stream applies) as icon+label badges, and the `AttackResolved` combat-log
  line now appends `[advantage: <names>]` / `[disadvantage: <names>]` sourced
  from the new `has_advantage`/`has_disadvantage`/`advantage_sources`/
  `disadvantage_sources` fields (rpg-api-protos#173, fields 8-11 on
  `AttackResolved`). Display resolution for all condition refs (both the
  status column and the advantage/disadvantage source names) is unified
  through `src/utils/conditionIcons.ts`'s `getConditionDisplay(refId)` —
  a pre-existing string-keyed lookup table that was written but never wired
  into any component until this wave; extended with `dodging`/`hidden`/`helped`
  entries rather than adding a second lookup table (R5: display metadata
  stays web-side, keyed by the `Ref.id` string, never the wire's
  `StatusEffect.display_name`/`icon_hint`, which may be empty). Proto bumped
  to `@kirkdiggler/rpg-api-protos v0.1.102`.
  **Note:** `enumDisplays.ts`'s `CONDITION_DISPLAY` (keyed by the v1alpha1
  `ConditionId` enum, used by `ConditionsDisplay`/`activeConditions` on the
  static character sheet) is a _different, unrelated_ lookup — don't confuse
  the two; the v2 stream's `StatusEffect.source` is a bare `Ref`, not that enum.

- **Chapter 2 TakeAction wave — server-driven action menu + live economy (#426)** —
  The web now consumes the server-authored action menu instead of computing
  attack legality. `useEncounterState` holds a `turnState` (economy +
  `available_actions`), swapped in wholesale by the new `TurnStateChanged` stream
  event (Invariant 12, no polling) and seeded from the v2 snapshot's `turnState`.
  `PlaytestHarness` renders `<EconomyBar>` (live action/bonus/reaction/movement +
  granted capacities) and `<ActionMenu>` (entries grouped by `economy_slot`,
  disabled with the server's `unavailable_reason` when `available=false`, click
  dispatches per `target_kind`: SINGLE_ENTITY prompts, SELF self-targets, NONE
  fires untargeted). The stream dispatcher routes `ActionResolved` /
  `AttackResolved` (the latter **fires on a MISS too** — #594; misses now show in
  the combat log) / `TurnStateChanged`. **D7:** the hardcoded "Attack" button and
  the client-side `isTargetAdjacent`/`canAttack` adjacency gating were DELETED
  from `combat-v2/panels/ActionPanel.tsx` (the one real web-side legality
  violation). Proto bumped to `@kirkdiggler/rpg-api-protos v0.1.100`.
  **Server gap flagged (not web's lane):** the snapshot menu is unpopulated
  server-side (rpg-api #601 — `ProjectFor` loads read-only, no held chars), so
  whether the initial menu renders at turn start depends on the server emitting a
  turn-start `TurnStateChanged` push. The web is ready for both paths.

- **PR #377** (`fix/376-room-revealed-all-rooms`, open since 2026-04-06) — Fixes
  the bug where `onRoomRevealed` only added the current room to the dungeon map
  instead of all revealed rooms in the snapshot. Calls `allRoomsFromEncounterState`
  instead of `roomFromEncounterState`. Paused — depends on confirming the
  upstream stream-delivery bug (see Known Rough Edges below).

- **PR #378** (`test/room-reveal-transforms`, open since 2026-04-06) — Extracts
  four transform functions from `LobbyView.tsx` to `utils/encounterStateTransforms.ts`
  and adds 25 vitest tests. **Not merged to main.** Commit `15f232e` is on the
  PR branch only (`git branch --contains 15f232e` confirms). The 298 tests
  currently on main do not include these 25. Paused alongside #377.

- **PR #370** (`fix/hex-entity-equipment-fallback`, open since 2026-03-29) —
  Resolves weapons/shields from itemId fallback when equipment data is missing.
  Independently useful but unblocked by the stream issue.

- **Chapter 2 Wave 3 — Rage button + ActivateFeature RPC (PR #420, open)** —
  `useActivateFeatureV2` hook wraps the v1alpha2 `ActivateFeature` unary RPC.
  `PlaytestHarness` has a Rage button (calls `ActivateFeature` with
  `{module:"dnd5e", type:"features", id:"rage"}`), a "RAGING" status indicator
  in the header (lit when the `raging` condition appears in `entityStatuses` via
  `StatusApplied`), and a Features panel in the dev grid. Proto pin bumped from
  `8974685` to `92a9d062` (the `generated` branch commit that includes the v1alpha2
  `ActivateFeature` gen files from rpg-api-protos#165/#166).
  **Known proto gap**: v1alpha2 `Entity`/`CharacterData` carries no `feature_charges`
  field — RageCharges remaining (`2/2 → 1/2`) cannot be read from the stream
  in the current proto version. Pending director decision on proto extension
  (separate issue) or deferred to v1alpha3. The button + condition indicator covers
  the observable goal: Rage activates and the harness shows the raging condition.

## Recently landed (last 6 weeks, highlights)

- **Chapter 2 Wave 2 — AC column in harness entity panel (PR #418, 2026-05-29)** —
  `PlaytestHarness` entity table shows an AC column alongside HP. AC is sourced
  from the v2 `Entity.armor_class` field (rpg-api-protos#163, field 7 on Entity,
  populated by rpg-api#562) via `applyEntityAppearedBatch` (snapshot seed) and
  `applyEntityMetaFromAppeared` (EntityAppeared delta). Proto bumped from
  `3a5e2bc47447` to `8974685`. Tested: charli=15, goblin=15 from wave-2-monk fixture.

- **Chapter 2 Wave 1 (rogue) — Sneak Attack damage breakdown in combat log (PR #415, 2026-05-28)** —
  `PlaytestHarness` now renders per-source damage components from the v1alpha2
  `EntityDamaged.damage_breakdown` field (added in rpg-api-protos#161, populated by
  rpg-api#557). Combat log shows e.g. `[dnd5e:weapons:shortsword:2, dnd5e:abilities:dex:3,
dnd5e:features:sneak_attack:1]`. Verified end-to-end via MCP playtest. (An earlier read
  suggested no web work was needed because `DamageSourceBadge` handles the source string —
  but the v2 stream didn't carry the breakdown until this wave wired it through.)

- **Unified entity state** (PR #371, 2026-04-05) — `useEncounterState` hook
  replaces fragmented `monsters[]`, `fullCharactersMap`, and `dungeonMap.entities`
  with a single `Map<entityId, EntityState>`. Entity state now drives HP
  display in HoverInfoPanel and entity rendering in BattleMapPanel.

- **Proto bump to v0.1.86** (2026-04-05) — Picks up `GetEncounterHistory` and
  `lastEventId` fields on `GetEncounterStateResponse`. Enables the
  load-then-stream sync pattern in `useEncounterStream`.

- **Dead monster removal + HP fix cluster** (PRs #359, #360, #364, #365, 2026-04-03/04) —
  Dead monsters now stay visible on the board with a death indicator, HP
  values in the hover panel stay accurate through combat.

- **Wall deduplication** (PR #368, 2026-03-28) — Prevents duplicate walls
  from adjacent rooms from shifting the hex grid. Canonical wall-key
  normalization in `useDungeonMap`.

- **Multi-room rendering phases 3-5** (PR #345, 2026-03-22) — First end-to-end
  multi-room dungeon map working in browser; rooms accumulate as they are
  revealed via `useDungeonMap`.

- **Art asset integration** (PR #336, 2026-03-20) — Voxel character models,
  class-specific textures, shader-based color replacement, and floor/wall
  builders shipped.

- **Concepts lab** (PR #344, 2026-03-22) — `/concepts` route for UI
  prototyping without touching production paths. First spike: enriched
  class-selection UI.

## Paused / on hold

- **Stream-delivery investigation** — `RoomRevealed` events are proven to fire
  on the API side (rpg-api integration test `open_door_test.go`), but there is
  no confirmed browser receipt. PR #377 is blocked here because even with the
  correct transform code, we need to verify the event arrives. Investigation is
  the next milestone target before any additional multi-room work.

- **Task 7 / unified state migration** — `LobbyView` currently runs a
  "legacy path" (`roomFromEncounterState`, `combatState`, `monsters[]`) in
  parallel with the new `useEncounterState` path. 41 references to "legacy" or
  "new path" remain in `LobbyView.tsx`. Cleanup deferred until the stream
  bug is resolved to avoid destabilizing already-fragile state wiring.

- **`/concepts` class-selection spike** — Proof-of-concept enriched UI
  exists but not connected to production flow. Needs design decision before
  proceeding.

## Known rough edges

### Stream delivery (highest priority for next milestone)

- **Suspected `RoomRevealed` event drop** — The API-side integration test
  (`rpg-api/internal/integration/encounter/open_door_test.go`) proves that
  `RoomRevealed` events are emitted when a door is opened. However, there is
  no confirmed evidence that these events reach the browser via
  `useEncounterStream`. The `dispatchEvent` switch in `useEncounterStream.ts`
  does have a `roomRevealed` case and calls `onRoomRevealed`, and `LobbyView`
  does register `handleRoomRevealed`. The failure point has not yet been
  isolated — candidates include: the gRPC-Web transport dropping the event,
  a race in the load-then-stream buffer logic, or a missing `onRoomRevealed`
  prop at some call site. This is the next investigation target. Do not
  speculate fixes until the event is confirmed dropped (or not) via browser
  devtools.

### LobbyView complexity

- **2,345 lines, 45 hook calls** — `LobbyView.tsx` is the single largest file
  in the codebase and does too much: stream wiring, all event handlers,
  combat action dispatch, movement pathfinding, turn logic, and rendering
  routing. The dual legacy/new-path code makes this worse. Legacy comment
  occurrences: 26 (grep-verified 2026-05-02; an earlier pass counted 41 —
  some were removed during the new-path landing in PR #371). This is a refactor
  target but should not be touched until the stream bug is confirmed resolved.

- **`roomFromEncounterState` still called in `handleRoomRevealed`** — On main,
  `handleRoomRevealed` uses the single-room transform. `allRoomsFromEncounterState`
  does not exist on main — it is being added by PR #377 (paused) alongside
  PR #378's extraction. Until those branches merge, the multi-room reveal path
  is incomplete.

### Proto integration

- **`entityStateToPlacement` manual mapping** — `entityStateToPlacement` in
  `LobbyView.tsx` hand-maps `EntityState` fields to `EntityPlacement`. This is
  unavoidable (they are different proto messages) but any proto field additions
  require updating this function or rendering silently breaks. There is no
  compile-time guard. (When PR #378 merges, this function moves to
  `utils/encounterStateTransforms.ts`.)

### Testing

- **No component-level tests** — 14 test files, 298 tests (verified 2026-05-02
  by running npm test; prior count of 323 was incorrect), but all target
  pure utility functions and hooks. Zero coverage of `LobbyView`, `BattleMapPanel`,
  `CombatPanel`, `HexGrid`, or any component that renders JSX.

- **No stream integration test in the browser** — `useEncounterStream` is
  untested. The load-then-stream buffer logic (syncing state, replay,
  reconnect with exponential backoff) is entirely exercised by manual
  playtesting.

### Discord Activity wiring

- **Dev fallback is hardcoded** — `isDevelopment ? 'test-player' : ''` in
  `LobbyView`. If Discord fails to load in production, playerId silently
  becomes `''` rather than surfacing an error.

- **`DiscordDebugPanel` is behind a toggle button** — `App.tsx` keeps it behind
  `showDebugPanel` state and exposes a button to show/hide it. Available in all
  environments, not dev-only.

## Per-subsystem confidence

| Subsystem                                                                                                    | Confidence                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [useEncounterStream](#stream-delivery-highest-priority-for-next-milestone)                                   | Low — stream delivery of `RoomRevealed` unconfirmed; buffer/reconnect logic untested           |
| [useDungeonMap](#use-dungeon-map)                                                                            | Medium-high — clean accumulation logic, good tests, wall dedup works                           |
| [useEncounterState](#use-encounter-state)                                                                    | Medium — recently landed, snapshot/delta logic is clean, still dual-pathed with legacy         |
| [LobbyView transform functions](#lobbyview-complexity)                                                       | Medium — pure functions in `LobbyView.tsx`; 25 tests pending merge (PR #378 only, not on main) |
| [LobbyView](#lobbyview-complexity)                                                                           | Low-medium — correct behavior but structurally brittle; 2 k+ lines, dual paths                 |
| [combat-v2 panels (CombatPanel, CombatHistorySidebar)](#combat-v2--combatpanel-combathistorysidebar)         | Medium — feature complete for Round 1 scenario; no component tests                             |
| [encounter/BattleMapPanel](#encounterb-attlemappanel)                                                        | Medium — functional; entity state wired, no tests                                              |
| [hex-grid (HexGrid, HexTile, MediumHumanoid)](#hex-grid-components-hexgrid-hextile-hexentity-mediumhumanoid) | Medium — movement range and interaction tested; rendering untested                             |
| [gRPC client / encounterHooks](#grpc-client--encounterhooks)                                                 | Medium — clean hook wrappers; no tests                                                         |
| [proto integration (@kirkdiggler/rpg-api-protos v0.1.86)](#proto-integration-rpg-api-protos-v0186)           | Medium-high — types used directly, no duplication; lock-file discipline needed                 |
| [Discord Activity wiring](#discord-activity-wiring)                                                          | Medium — works in prod path, dev fallback is fragile                                           |
| [/concepts route](#concepts-route)                                                                           | Medium — useful sandbox; decoupled from production                                             |
| [vitest coverage](#testing)                                                                                  | Low — 298 tests but all utility-layer; zero component coverage                                 |

## Upcoming work

Milestone goal: multi-room dungeon scenario working end-to-end in browser.

1. **Confirm stream delivery** — Use browser devtools and the existing
   `console.log` calls in `useEncounterStream` to determine whether
   `RoomRevealed` events reach the browser at all.
2. **Merge PR #377** — Wire `allRoomsFromEncounterState` into
   `handleRoomRevealed` once stream delivery is confirmed.
3. **Merge PR #378** — Finalize the test infrastructure alongside #377.
4. **Add `useEncounterStream` test** — At minimum, test the buffer flush
   logic and `onRoomRevealed` dispatch path.
5. **LobbyView legacy cleanup (Task 7)** — Remove the parallel legacy path
   once `useEncounterState` covers all event types.
6. **Weapon/equipment fallback** — Merge PR #370 once stream work stabilizes.

## Related references

- [Project board #10](https://github.com/users/KirkDiggler/projects/10)
- [rpg-api integration test: open_door_test.go](https://github.com/KirkDiggler/rpg-api/blob/main/internal/integration/encounter/open_door_test.go)
- [PR #377 — add all rooms on RoomRevealed](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/377)
- [PR #378 — extract transforms + 25 vitest tests](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/378)
- [rpg-project/CLAUDE.md](https://github.com/KirkDiggler/rpg-project/blob/main/CLAUDE.md)
