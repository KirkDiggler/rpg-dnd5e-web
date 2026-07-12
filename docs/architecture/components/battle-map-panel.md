---
name: BattleMapPanel (deleted)
description: Deleted in slice 3 of the game-screen rebuild — see game-view.md
updated: 2026-07-12
confidence: high — verified by git rm and a clean grep for BattleMapPanel across src/
---

# BattleMapPanel — deleted

`src/components/encounter/BattleMapPanel.tsx` was deleted in slice 3 of
the [game-screen rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447). `LobbyView.tsx` was its only consumer.

`BattleMapPanel` consumed `useDungeonMap`'s `DungeonMapState` — the
v1alpha1 `Room`-accumulation state — to compose `HexGrid`. That hook is
also gone (see [use-dungeon-map.md](use-dungeon-map.md)). Its live
successor is `EncounterMap` (`src/components/game/EncounterMap.tsx`), a
thin `HexGrid` adapter built directly on v1alpha2 stream state
(`revealedHexes`, `entityMeta`), generalized from the pre-existing
`PlaytestMap` adapter — see
[game-view.md](game-view.md#encounterview--the-shared-harness-stack) and
[playtest-harness.md](playtest-harness.md).
