---
name: GameView
description: The live game path's successor to LobbyView — party assembly (LobbyFlow) then a live encounter (EncounterView), built entirely on the shared harness stack
updated: 2026-07-08
confidence: high — verified by reading every new file in full, running the full vitest suite (656 passing), and cross-checking rpg-api's start_encounter.go entity-id claim
---

# GameView

`src/components/game/GameView.tsx` — mounted by `App.tsx` on the route `LobbyView` used to occupy. Slice 2 of the [game screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md) (rpg-dnd5e-web#440). `LobbyView.tsx` itself is untouched and now unreferenced — its deletion is slice 3, not this one.

GameView is a two-state switch, nothing more:

```
GameView
├── LobbyFlow        (no encounterId yet)
└── EncounterView     (encounterId set, from LobbyFlow's onEncounterStarted)
```

## LobbyFlow — party assembly

`src/components/game/LobbyFlow.tsx`, backed by the new `dnd5e.api.lobby.v1alpha1` `LobbyService` (rpg-api-protos#177, rpg-api#630 — [lobby-surface.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/lobby-surface.md)). This is a distinct proto package and client (`lobbyClient` in `src/api/client.ts`) from the v1alpha1 `EncounterService`'s legacy `CreateEncounter`/`JoinEncounter`/`SetReady` RPCs, which `LobbyView` still uses until slice 3.

- **Create**: `useCreateLobby` — caller becomes host, binds `characterId`.
- **Join**: `useJoinLobby` — takes the opaque `join_ref` minted at create. Idempotent and rebinding (a second call re-binds `characterId` rather than erroring).
- **Dev join-ref carrier**: `LobbyFlow` reads a `?joinRef=` URL param once on mount and auto-joins — the dev/playtest equivalent of the Discord Activity's automatic instance carrier (lobby-surface.md Decision 2). This is what keeps multi-browser MCP playtest joins trivial without Discord.
- **Ready / start**: `useSetLobbyReady` toggles the caller's flag; `useStartLobbyEncounter` is host-only and gated all-ready server-side. On success `LobbyFlow` drives off both the RPC response _and_ the stream's `encounter_started` (belt-and-suspenders — see `useLobbyStream`'s docstring).
- **Roster**: `useLobbyStream` (`StreamLobby`, snapshot-then-deltas — the same pattern as `useEncounterStream2`) feeds `PartyRoster`, which renders `is_host`/`is_ready`/`is_connected` verbatim, never inferred.

`useLobbyStream` and its event dispatcher (`src/api/lobbyStreamDispatch.ts`) are a deliberate sibling of `useEncounterStream2`/`encounterStream2Dispatch.ts` — same reconnect config (`streamReconnect.ts`), same snapshot-first contract, but no envelope (the lobby has no causation chain to reassemble) and a short-lived stream that ends the moment `encounter_started` fires.

## EncounterView — the shared harness stack

`src/components/game/EncounterView.tsx`. Per design.md's "Already shared or generic" survey, this slice does not build a new combat engine — it composes the pieces `PlaytestHarness` already proved out:

| Piece          | Source                                                                                 | Notes                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream + state | `useEncounterStream2` + `useEncounterState`                                            | Same hooks, same dispatch. Zero harness assumptions in either.                                                                                                                                                                                                                                       |
| Action menu    | `ActionMenu` / `EconomyBar` (`components/playtest/`)                                   | Rendered verbatim off server-pushed `TurnState` — no client legality logic. Slice 2 renders these directly; a game-grade `ActionPanel` wrapper is a later slice, per #440's scope.                                                                                                                   |
| Map            | `EncounterMap` (new, `components/game/`)                                               | Thin HexGrid adapter, generalized from `PlaytestMap` — both now import `synthesizeFloorTiles`/`buildRenderableEntities` from the pre-existing shared `components/playtest/playtestMapHelpers.ts`. Single room only; multi-room accumulation is slice 4.                                              |
| Prompts        | `PromptModal` (new, `components/game/`)                                                | Extracted from `PlaytestHarness` (Wave 2.9/2.11d inline JSX) so both surfaces dispatch `SubmitCheck` through one component instead of two copies drifting apart. `PlaytestHarness` now renders this component too — same testids, same behavior, verified by its existing (unmodified) vitest suite. |
| Formatting     | `errorMessage`, `formatStatusBadges`, `formatSourceRefs` (`src/utils/combatFormat.ts`) | Also extracted out of `PlaytestHarness` for the same reason.                                                                                                                                                                                                                                         |

### entityId is `characterId`, not `char-<playerId>`

The local player's `entityId` in an `EncounterView` is the `characterId` bound at lobby create/join — **not** `char-<playerId>`, the shortcut `PlaytestHarness` uses (which only works there because devseed happens to name characters that way). This is because `StartEncounter` seeds the toolkit encounter with `EntityID: core.EntityID(m.CharacterID)` per ready member (rpg-api `internal/orchestrators/lobby/start_encounter.go`) — confirmed by reading that file directly, not inferred.

### Scope explicitly excluded this slice

Equipment modal, dungeon result overlay, and multi-room accumulation are not built here — see design.md's slice breakdown (2 vs 4) and #440's issue body. `EncounterMap` also does not wire door interaction: `HexGrid`'s door-click surface needs a `DoorInfo[]` the v2 stream doesn't accumulate yet, the same gap documented in `playtest-harness.md`'s known limitations.

## Related references

- [design.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md) — parent design, target shape, deletion list, slice breakdown
- [lobby-surface.md](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/lobby-surface.md) — LobbyService contract, decisions, edge cases
- [playtest-harness.md](playtest-harness.md) — the harness `EncounterView` shares its stack with
- rpg-dnd5e-web#440 (this slice), #432 (umbrella), rpg-project#81 (wave umbrella)
