---
name: GameView
description: The live game path's successor to LobbyView — party assembly (LobbyFlow) then a live encounter (EncounterView), built entirely on the shared harness stack
updated: 2026-07-12
confidence: high — verified by reading every new file in full, running the full vitest suite (675 passing), and cross-checking rpg-api's start_encounter.go entity-id claim
---

# GameView

`src/components/game/GameView.tsx` — mounted by `App.tsx` on the route `LobbyView` used to occupy. Slice 2 of the [game screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md) (rpg-dnd5e-web#440). `LobbyView.tsx` and everything only it referenced (the v1alpha1 lobby UI, `combat-v2/`, `BattleMapPanel`) were deleted in slice 3 (#447) — see [lobby-view.md](lobby-view.md).

GameView is a two-state switch, nothing more:

```
GameView
├── LobbyFlow        (no encounterId yet)
└── EncounterView     (encounterId set, from LobbyFlow's onEncounterStarted)
```

## LobbyFlow — party assembly

`src/components/game/LobbyFlow.tsx`, backed by the new `dnd5e.api.lobby.v1alpha1` `LobbyService` (rpg-api-protos#177, rpg-api#630 — [lobby-surface.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/lobby-surface.md)). This is a distinct proto package and client (`lobbyClient` in `src/api/client.ts`) from the v1alpha1 `EncounterService`'s legacy `CreateEncounter`/`JoinEncounter`/`SetReady` RPCs, deleted in slice 3 along with `LobbyView`, their only caller.

- **Create**: `useCreateLobby` — caller becomes host, binds `characterId`.
- **Join**: `useJoinLobby` — takes the opaque `join_ref` minted at create. Idempotent and rebinding (a second call re-binds `characterId` rather than erroring).
- **Dev join-ref carrier**: `LobbyFlow` reads a `?joinRef=` URL param once on mount and auto-joins — the dev/playtest equivalent of the Discord Activity's automatic instance carrier (lobby-surface.md Decision 2). This is what keeps multi-browser MCP playtest joins trivial without Discord.
- **Ready / start**: `useSetLobbyReady` toggles the caller's flag; `useStartLobbyEncounter` is host-only and gated all-ready server-side. On success `LobbyFlow` drives off both the RPC response _and_ the stream's `encounter_started` (belt-and-suspenders — see `useLobbyStream`'s docstring).
- **Roster**: `useLobbyStream` (`StreamLobby`, snapshot-then-deltas — the same pattern as `useEncounterStream`) feeds `PartyRoster`, which renders `is_host`/`is_ready`/`is_connected` verbatim, never inferred.

`useLobbyStream` and its event dispatcher (`src/api/lobbyStreamDispatch.ts`) are a deliberate sibling of `useEncounterStream`/`encounterStreamDispatch.ts` — same reconnect config (`streamReconnect.ts`), same snapshot-first contract, but no envelope (the lobby has no causation chain to reassemble) and a short-lived stream that ends the moment `encounter_started` fires.

## EncounterView — the shared harness stack

`src/components/game/EncounterView.tsx`. Per design.md's "Already shared or generic" survey, this slice does not build a new combat engine — it composes the pieces `PlaytestHarness` already proved out:

| Piece          | Source                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream + state | `useEncounterStream` + `useEncounterState`                                                | Same hooks, same dispatch. Zero harness assumptions in either.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Action menu    | `EncounterDock` composed from `ui/combat/*` (`components/game/`, `components/ui/combat/`) | The game-grade action surface (rpg-dnd5e-web#525 slice 1, PR #543). Renders verbatim off server-pushed `TurnState` — no client legality logic. Verbs carry pool-shape cost badges from `economy_slot` (`ui/combat/organizeVerbs`), a teaching strip narrates state (your turn / spectator #458 / free-roam #516 / ended), reaction readiness lives behind the settings gear. `ActionMenu`/`EconomyBar` (`components/playtest/`) remain the `PlaytestHarness` dev-panel's surface, not the game path. |
| Map            | `EncounterMap` (new, `components/game/`)                                                  | Thin HexGrid adapter, generalized from `PlaytestMap` — both now import `synthesizeFloorTiles`/`buildRenderableEntities` from the pre-existing shared `components/playtest/playtestMapHelpers.ts`. Single room only; multi-room accumulation is slice 4.                                                                                                                                                                                                                                              |
| Prompts        | `PromptModal` (new, `components/game/`)                                                   | Extracted from `PlaytestHarness` (Wave 2.9/2.11d inline JSX) so both surfaces dispatch `SubmitCheck` through one component instead of two copies drifting apart. `PlaytestHarness` now renders this component too — same testids, same behavior, verified by its existing (unmodified) vitest suite.                                                                                                                                                                                                 |
| Formatting     | `errorMessage`, `formatStatusBadges`, `formatSourceRefs` (`src/utils/combatFormat.ts`)    | Also extracted out of `PlaytestHarness` for the same reason.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Combat log     | `CombatLog` + `useCombatLog` (new, #445)                                                  | Game-grade rendering of the same stream events `PlaytestHarness`'s dev-log already prints as raw text — see "Combat log + initiative tracker" below.                                                                                                                                                                                                                                                                                                                                                 |
| Initiative     | `TurnOrderOverlay` (`components/hex-grid/`, pre-existing, newly wired — #445)             | Wired via a new `buildTurnOrderCombatState` shim in `playtestMapHelpers.ts`; `HexGrid`/`TurnOrderOverlay` themselves unmodified.                                                                                                                                                                                                                                                                                                                                                                     |

### entityId is `characterId`, not `char-<playerId>`

The local player's `entityId` in an `EncounterView` is the `characterId` bound at lobby create/join — **not** `char-<playerId>`, the shortcut `PlaytestHarness` uses (which only works there because devseed happens to name characters that way). This is because `StartEncounter` seeds the toolkit encounter with `EntityID: core.EntityID(m.CharacterID)` per ready member (rpg-api `internal/orchestrators/lobby/start_encounter.go`) — confirmed by reading that file directly, not inferred.

### Scope explicitly excluded this slice

Equipment modal, dungeon result overlay, and multi-room accumulation are not built here — see design.md's slice breakdown (2 vs 4) and #440's issue body. `EncounterMap` also does not wire door interaction: `HexGrid`'s door-click surface needs a `DoorInfo[]` the v2 stream doesn't accumulate yet, the same gap documented in `playtest-harness.md`'s known limitations.

### Combat log + initiative tracker (#445)

The two pieces that make a fight readable as a game — until this wave the kill
narrative (attack rolls, damage, death, victory) only existed in
`PlaytestHarness`'s raw dev-log text; `EncounterView` showed HUD numbers
changing with no story.

- **`src/hooks/useCombatLog.ts`** — a new hook, sibling to `useEncounterState`,
  that accumulates `AttackResolved` / `EntityDamaged` / `StatusApplied` /
  `StatusRemoved` / `TurnStarted` / `TurnEnded` / `EntityDied` /
  `EntityRemoved` / `EncounterEnded` stream events into a capped (100-entry)
  list of typed `CombatLogEntry` records. Each entry stores the raw proto
  event verbatim — no roll, total, or hit/miss verdict is recomputed; only
  `TurnStarted` carries a `round` on the wire, so the hook tracks the current
  round internally and stamps every later entry with it (mirrors how
  `useEncounterState.state.round` is derived).
- **`src/components/game/CombatLog.tsx`** — the panel `EncounterView` renders
  below the map. Reads `useCombatLog`'s entries and styles each `kind`
  distinctly (hit/miss/crit color, damage breakdown chips, status icons via
  the existing `conditionIcons.ts` lookup, death/encounter-end banners),
  auto-scrolling to the newest entry. This is the game-grade rendering of the
  exact events `PlaytestHarness`'s dev-log already prints as flat text — the
  old `combat-v2` `CombatHistorySidebar`'s "📜 Combat Log" rebuilt on the push
  model, matching its spirit (scrolling, newest visible, round-tagged), not
  its code. `PlaytestHarness` itself is untouched — its dev-log stays exactly
  as it was.
- **Initiative tracker** — `hex-grid`'s `TurnOrderOverlay` already existed but
  was unwired in both `EncounterMap` and `PlaytestMap` (`combatState={null}`
  in both). `HexGrid` derives the overlay's `turnOrder`/`activeIndex`/`round`
  from a v1alpha1 `CombatState` prop, not from raw v2 primitives, so a new
  pure helper — `buildTurnOrderCombatState` in
  `components/playtest/playtestMapHelpers.ts` (the existing shared
  "generalize, don't lift" translation layer) — shims
  `initiativeOrder`/`activeEntityId`/`round` (from `useEncounterState`) plus
  `entityMeta` into that shape. `EncounterMap` now takes `initiativeOrder` /
  `activeEntityId` / `round` props and builds the shim via `useMemo`; `HexGrid`
  and `TurnOrderOverlay` themselves are unmodified — this is wiring, not an
  extension, matching the wave's constraint that the v2 data shape fit
  without touching either component. `PlaytestMap` was not wired (still
  `combatState={null}`) — left for a future pass since it's optional per the
  wave's shared-component rule and out of scope here.
- No full `Character[]` list reaches `GameView` yet, so `TurnOrderOverlay`
  renders its entityId-derived fallback name/emoji for every combatant
  (same as `EncounterMap`'s existing renderable-entity naming) rather than
  portraits/class icons — a follow-up, not a proto gap.

## Related references

- [design.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md) — parent design, target shape, deletion list, slice breakdown
- [lobby-surface.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/lobby-surface.md) — LobbyService contract, decisions, edge cases
- [playtest-harness.md](playtest-harness.md) — the harness `EncounterView` shares its stack with
- rpg-dnd5e-web#440 (this slice), #432 (umbrella), rpg-project#81 (wave umbrella)
