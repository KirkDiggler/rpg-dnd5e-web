---
name: encounter state transforms (deleted)
description: Deleted in slice 3 along with LobbyView.tsx, their only home
updated: 2026-07-12
confidence: high — verified by git rm and a clean grep across src/
---

# Encounter state transforms — deleted

The five module-level transform functions this doc tracked
(`entityStateToPlacement`, `roomFromEncounterState`,
`doorsFromEncounterState`, `monstersFromEncounterState`,
`applyMonsterMovement`) lived inside `src/components/LobbyView.tsx` and
were deleted with it in slice 3 of the [game-screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447).

The proposed extraction to `utils/encounterStateTransforms.ts` (PR #378,
`test/room-reveal-transforms` branch) never merged to main and is now
moot — the functions it would have extracted no longer exist. `#378` is
closed out by this deletion, not landed.

The v1alpha2 path these functions fed (converting `EncounterStateData`
into `Room`/`EntityPlacement`/`DoorInfo` shapes for `useDungeonMap`) has
no direct successor — `EncounterMap`/`useEncounterState` consume stream
events directly (`entities: Map<string, EntityState>`,
`revealedHexes: Set<string>`) without an intermediate `Room`-shaped
transform layer. See [game-view.md](game-view.md).
