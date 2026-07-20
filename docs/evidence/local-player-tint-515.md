# Live verification: local player no longer permanently selection-tinted (#515)

Driven through the **real game route** (`/` — Home → select character → Play
→ LobbyFlow → StartEncounter → `EncounterView`/`EncounterMap`), not
`/playtest`, per the issue's evidence requirement. Backend: a local
`rpg-api` server + Redis, seeded with `cmd/devseed`'s canonical fixture
(`char-alice`, a level-2 Rogue, `PlayerID: "alice"`). Synty class GLBs
(`rogue.glb` etc.) were synced from `rpg-game-assets` so the real
`ClassCharacterModel` path rendered, not the `MediumHumanoid` fallback.

## Sequence

1. Ran `cmd/devseed` against a local Redis to seed `char-alice` (owned by
   player `alice`) — this is what makes `alice`'s Home carousel show a real,
   playable character without walking the full character-creation flow.
2. Loaded `http://localhost:5183/?playerId=alice` (dev player-id override,
   `App.tsx`), selected "Alice the Rogue", clicked **Play**.
3. `LobbyFlow`: **Create lobby** → **Ready up** → **Start Encounter** (host,
   solo party — `allReady` is trivially true with one member). This performs
   the real `CreateLobby`/`SetLobbyReady`/`StartLobbyEncounter` RPCs, not a
   devseed shortcut — `StartEncounter` seeds the toolkit encounter with
   `EntityID: char-alice` per `start_encounter.go`, so `myEntityId` in
   `EncounterMap` really is `char-alice`, exactly the real-player wiring
   `game-view.md` documents.
4. Landed in `EncounterView` — confirmed by the `data-testid="encounter-map"`
   canvas and the `mode: FREE_ROAM` HUD header, the real `GameView` surface,
   not the playtest harness's dev-log UI.
5. **Before frame** (`local-player-tint-515-before.png`): captured with the
   pre-fix code (`git stash` to the branch's parent commit) — Alice's rogue
   GLB renders almost white, the "washed-out ghost" the issue describes,
   because `EncounterMap.tsx` passes `selectedEntityId={myEntityId}` and
   `HexGrid` fed that straight into `HexEntity`'s `isSelected`, permanently
   tinting the local player's own model. No self-indicator present.
6. **After frame** (`local-player-tint-515-after.png`): same live session,
   same camera framing, fix restored (`git stash pop`) — Alice's actual
   garment colors (dark leather, purple accents) are visible, and a warm-gold
   ring renders on the ground under her feet — the new "this is me"
   indicator (`SelfIndicatorRing.tsx`).
7. Both frames are the SAME live `FREE_ROAM` encounter session (verified via
   the resume-after-refresh path, `GetMyActiveLobby` — rpg-dnd5e-web#444 —
   routing straight back into the still-active encounter on each reload, so
   no new lobby/session was created between the two captures).

I viewed both frames directly (Read tool on the saved PNGs, not just the
inline tool preview) before embedding them in the PR.

## Secondary confirmation: the bug is in shared selection logic, not GLB-specific

The same before/after pair was also captured on the `MediumHumanoid` fallback
path (no Synty assets synced) and shows the identical tint/no-tint contrast —
confirming the fix at `HexGrid.tsx`'s single `isSelected` computation site
covers both character-rendering paths, since neither `HexEntity.tsx` nor
`ClassCharacterModel.tsx`/`MediumHumanoid.tsx` needed to change.

## What was NOT captured

- **Ally/monster selection styling** — no second party member or monster was
  in this solo session, so a real "targeting a monster tints it" frame
  wasn't captured live. Covered instead by `selectionVisuals.test.ts`'s
  `resolveEntityTint` unit tests (a non-local entity matching
  `selectedEntityId` still gets tinted) and by code reading of
  `MediumHumanoid.tsx`/`HexEntity.tsx`'s obstacle-tint path, which are
  unchanged by this fix.
