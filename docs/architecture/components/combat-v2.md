---
name: combat-v2 panels (deleted)
description: Deleted in slice 3 of the game-screen rebuild — see game-view.md
updated: 2026-07-12
confidence: high — verified by git rm and a clean grep for combat-v2 across src/
---

# combat-v2 panels — deleted

`src/components/combat-v2/` was deleted in slice 3 of the [game-screen
rebuild](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/game-screen-rebuild/design.md)
(rpg-dnd5e-web#447): `CombatPanel`, `ActionPanel`/`ActionPanelV2`,
`CombatHistorySidebar`, `HoverInfoPanel`, `CharacterInfoSection`,
`CombatAbilitiesPanel`, `FeaturesListPanel`, `EquipmentDisplay`,
`ActionEconomyIndicators`, and `usePlayerTurn`. `LobbyView.tsx` was the
only consumer of any of it (via the `combat-v2` barrel export); once
LobbyView was deleted, every file in the directory was unreferenced.

Per design.md's "Incompatible — rebuild, no bridge exists" framing, these
panels got available actions from RPC response payloads; the proven v2
stack pushes them on the stream as `TurnStateChanged`. The replacement
combat surface builds on `ActionMenu`/`EconomyBar`
(`src/components/playtest/`), which already render the server-authored
`TurnState` verbatim — see [game-view.md](game-view.md#encounterview--the-shared-harness-stack).
The old `CombatHistorySidebar`'s "📜 Combat Log" was rebuilt on the push
model (matching its spirit, not its code) as `CombatLog` +
`useCombatLog` — see game-view.md's "Combat log + initiative tracker"
section.
