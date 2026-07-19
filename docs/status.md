---
name: rpg-dnd5e-web status
description: Where we are with the React/Discord Activity UI — active work, paused, known rough edges, per-subsystem confidence
updated: 2026-07-12
confidence: low-medium — entries below "Slice 3" are dated 2026-05-02 and predate slices 1-2 of the game-screen rebuild; several (Task 7, PR #377/#378, LobbyView complexity) are now stale/moot and are flagged inline rather than fully rewritten. This doc needs a dedicated refresh pass covering the intervening waves (#415/#418/#420/#426/#430/#445/#446), not just slice 3's deletions.
---

# rpg-dnd5e-web: Where We Are

This is a living doc. Edit it in the same PR that invalidates a line. Don't
let it rot.

## Active work

- **Slice 3: clean slate — legacy v1 path deleted, version suffixes dropped
  (#447)** — Closes out the game-screen rebuild's old-vs-new debt.
  `LobbyView.tsx` (and everything only it referenced: the v1alpha1 lobby
  UI, the entire `combat-v2/` panel tree, `BattleMapPanel`,
  `useDungeonMap`'s stateful hook) is deleted; `GameView` is now the only
  game route. Every `*2`/`*V2` identifier (`useEncounterStream2`,
  `useMoveEntityV2`, `applyV2SnapshotTurnState`, etc.) lost its suffix —
  the rebuilt names are the real names now. `useEncounterState` dropped
  the v1alpha1 snapshot-replace path (`applySnapshot`/`applyEntityUpdates`/
  `applyCombatState`) that only `LobbyView` drove. This also closes PR
  #377/#378 below as moot (see "Paused / on hold") and retires the
  "LobbyView complexity" rough edge. See
  [game-view.md](architecture/components/game-view.md) and
  [lobby-view.md](architecture/components/lobby-view.md).

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
  `useActivateFeature` hook (named `useActivateFeatureV2` before slice 3's
  rename, #447) wraps the v1alpha2 `ActivateFeature` unary RPC.
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

- **Stream-delivery investigation (moot — v1 path deleted)** — This tracked
  whether `RoomRevealed` events reached the browser via the old v1alpha1
  `useEncounterStream`/`LobbyView`. That whole path was deleted in slice 3
  (#447); the question no longer applies to a stream that doesn't exist.
  Multi-room dungeon rendering on the live v1alpha2 stack is still a real
  future need — design.md schedules it as slice 4, not yet started.

- **PR #377 / PR #378 (closed out by slice 3, not merged)** — Both targeted
  `LobbyView.tsx`'s single-room transform bug and its proposed extraction
  to `utils/encounterStateTransforms.ts`. Both branches are moot now that
  `LobbyView.tsx` and its transform functions are deleted (#447) — see
  [encounter-state-transforms.md](architecture/components/encounter-state-transforms.md).

- **`/concepts` class-selection spike** — Proof-of-concept enriched UI
  exists but not connected to production flow. Needs design decision before
  proceeding.

## Known rough edges

### LobbyView complexity (resolved — deleted in slice 3)

`LobbyView.tsx`, its dual legacy/new-path state, and the single-room
`roomFromEncounterState` transform bug this section used to track are all
gone (rpg-dnd5e-web#447). See [lobby-view.md](architecture/components/lobby-view.md).

### Proto integration

- **`entityStateToPlacement` manual mapping (resolved — deleted in slice 3)**
  — This function lived in `LobbyView.tsx` and was deleted with it. The
  live path has no equivalent hand-mapping step; `EncounterMap` consumes
  stream events directly.

### Testing

- **No component-level tests** — 37 test files, 569 tests (verified
  2026-07-12 running `npx vitest run`, post-slice-3), but almost all
  target pure utility functions and hooks; `PlaytestHarness.test.tsx` and
  `EncounterView.test.tsx` are the exceptions. Zero coverage of `HexGrid`
  or other components that render a Three.js canvas.

- **No stream integration test in the browser** — `useEncounterStream`
  (renamed from `useEncounterStream2` in slice 3) has no direct vitest
  coverage of the live gRPC loop; its event-dispatch switch
  (`encounterStreamDispatch.ts`) and reconnect config are covered, but the
  `for await` stream loop itself is exercised only by manual/MCP playtesting.

### Discord Activity wiring

- **Dev fallback is hardcoded** — `isDevelopment ? 'test-player' : ''` in
  `LobbyView`. If Discord fails to load in production, playerId silently
  becomes `''` rather than surfacing an error.

- **`DiscordDebugPanel` is behind a toggle button** — `App.tsx` keeps it behind
  `showDebugPanel` state and exposes a button to show/hide it. Available in all
  environments, not dev-only.

## Per-subsystem confidence

`LobbyView`, its transform functions, `combat-v2` panels, and
`encounter/BattleMapPanel` are deleted (rpg-dnd5e-web#447) — removed from
this table. See [game-view.md](architecture/components/game-view.md) for
their live successor.

| Subsystem                                                                                                                         | Confidence                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useEncounterStream](architecture/components/use-encounter-stream.md)                                                             | Medium — clean lifecycle/reconnect design, mount-churn hardened (#442); no direct hook-level test                                                                                                                                                                         |
| [dungeonMapGeometry](architecture/components/use-dungeon-map.md)                                                                  | High — three small pure functions, fully tested                                                                                                                                                                                                                           |
| [useEncounterState](architecture/components/use-encounter-state.md)                                                               | Medium-high — delta-only design, no dual-path, thoroughly tested pure reducers                                                                                                                                                                                            |
| [hex-grid (HexGrid, HexTile, MediumHumanoid, ClassCharacterModel)](#hex-grid-components-hexgrid-hextile-hexentity-mediumhumanoid) | Medium — movement range and interaction tested; class-model selection logic tested (classCharacterModels.test.ts, isDowned/classRefId passthrough, rpg-dnd5e-web#502); actual WebGL rendering still has no automated test (jsdom has no WebGL) — MCP/manual playtest only |
| [gRPC client](#grpc-client--encounterhooks)                                                                                       | Medium — clean hook wrappers; no tests                                                                                                                                                                                                                                    |
| [proto integration (@kirkdiggler/rpg-api-protos)](#proto-integration-rpg-api-protos-v0186)                                        | Medium-high — types used directly, no duplication; lock-file discipline needed                                                                                                                                                                                            |
| [Discord Activity wiring](#discord-activity-wiring)                                                                               | Medium — works in prod path, dev fallback is fragile                                                                                                                                                                                                                      |
| [/concepts route](#concepts-route)                                                                                                | Medium — useful sandbox; decoupled from production                                                                                                                                                                                                                        |
| [vitest coverage](#testing)                                                                                                       | Medium — 569 tests, mostly utility/hook-layer; near-zero rendered-component coverage                                                                                                                                                                                      |

## Upcoming work

1. **Multi-room dungeon accumulation on the v2 stack** — design.md's
   slice 4, not yet scheduled. The old stream-delivery investigation this
   list used to lead with was about the now-deleted v1 path and no longer
   applies.
2. **Refresh this doc and quality.md for the intervening waves** —
   Both docs are dated 2026-05-02 and predate slices 1-2 of the
   game-screen rebuild; slice 3 (this entry) removed what it deleted but
   did not backfill the history of #415/#418/#420/#426/#430/#445/#446.
3. **Weapon/equipment fallback** — Merge PR #370 (status unverified this pass).

## Related references

- [Project board #10](https://github.com/users/KirkDiggler/projects/10)
- [design.md — game-screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
- [rpg-project/CLAUDE.md](https://github.com/KirkDiggler/rpg-project/blob/main/CLAUDE.md)
