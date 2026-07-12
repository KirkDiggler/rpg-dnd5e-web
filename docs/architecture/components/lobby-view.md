---
name: LobbyView (deleted)
description: Deleted in slice 3 of the game-screen rebuild — see game-view.md
updated: 2026-07-12
confidence: high — verified by git rm and a clean grep for LobbyView across src/
---

# LobbyView — deleted

`src/components/LobbyView.tsx` was deleted in slice 3 of the [game-screen
rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447). It ran the old v1alpha1 request/response lobby and
combat flow and had been unreferenced by `App.tsx` since slice 2 landed
`GameView` (#440) on the same route.

Its v1-only children went with it: the lobby UI (`LobbyScreen`,
`WaitingRoom`, `PartyMemberCard`, `JoinCodeDisplay`,
`DungeonConfigSelector`), the entire `combat-v2/` panel tree, and
`BattleMapPanel`. The module-level transform functions this doc's sibling
[encounter-state-transforms.md](encounter-state-transforms.md) tracked
(`entityStateToPlacement`, `roomFromEncounterState`,
`doorsFromEncounterState`, `monstersFromEncounterState`,
`applyMonsterMovement`) were deleted with it — they had no life outside
this file.

See [game-view.md](game-view.md) for the live successor.
