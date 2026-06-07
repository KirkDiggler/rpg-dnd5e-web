---
name: combat-v2 panels
description: CombatPanel, ActionPanel/V2, CombatHistorySidebar, HoverInfoPanel — feature complete for Round 1, structurally growing
updated: 2026-06-07
confidence: high — verified by reading CombatPanel.tsx, CombatHistorySidebar.tsx, ActionPanel.tsx, ActionPanelV2.tsx, CharacterInfoSection.tsx
---

# combat-v2 panels

`src/components/combat-v2/` — the in-combat UI layer.

## Files

| File                                 | Lines   | Purpose                                               |
| ------------------------------------ | ------- | ----------------------------------------------------- |
| `panels/CombatPanel.tsx`             | 243     | Top-level combat layout, routes to action/info panels |
| `panels/CombatHistorySidebar.tsx`    | 484     | Scrolling combat event log                            |
| `panels/ActionPanel.tsx`             | ~290    | Original action UI (movement + features + end turn)   |
| `panels/ActionPanelV2.tsx`           | 356     | Revised action UI (replacement? parallel?)            |
| `panels/CharacterInfoSection.tsx`    | ~110    | HP bar, AC, ability scores, conditions                |
| `panels/HoverInfoPanel.tsx`          | unknown | Entity hover tooltip                                  |
| `panels/ActionEconomyIndicators.tsx` | small   | Remaining actions/bonus/reaction display              |
| `panels/CombatAbilitiesPanel.tsx`    | unknown | Feature/ability buttons                               |
| `panels/FeaturesListPanel.tsx`       | unknown | Feature list display                                  |
| `hooks/usePlayerTurn.ts`             | unknown | Player turn state management                          |

## ActionPanel vs ActionPanelV2

Both exist. Both are exported from `panels/index.ts`. The README in `combat-v2/` does not explain which to use or whether V2 supersedes the original. `LobbyView.tsx` imports from `./combat-v2` via the barrel export — which panel is actually rendered is unclear without reading the full render tree. This ambiguity should be resolved: deprecate one, document the decision.

## TakeAction wave (#426): client-side attack gating removed

`ActionPanel.tsx` previously computed attack legality in the web layer — an
`isTargetAdjacent` hex-distance check (`~118–140`) feeding a `canAttack` gate on a
hardcoded "Attack" button (`~244`). This was the one real rendering-rule violation
in this panel (web deciding what's legal). It was **deleted** (decision D7): attack
is now an entry in the server-authored action menu (`AvailableAction.available` +
`unavailable_reason`), rendered by the v2 path's `ActionMenu` (in
`components/playtest/`). `ActionPanel` keeps movement, class features, and end turn
only. The server (toolkit → rpg-api) decides availability; the web renders the
verdict.

> Residual (NOT this wave): `LobbyView.tsx ~1315` still calls `hexDistance` when an
> entity is clicked, but only for a `console.log` — it does not gate the attack on
> the result. It's a logging artifact in the v1alpha1 path, not an active legality
> gate. Clean up when the v1alpha1 combat path is retired.

## Architectural violation: ability modifier calculation

`CharacterInfoSection.tsx:33`:

```typescript
function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
```

This is the D&D ability modifier formula implemented in the web layer. Per the rendering rules, the web should render what the API sends. The API/toolkit should provide computed modifier values on the `Character` proto. This is a confirmed rendering rule violation — the same formula appears in 5 other files.

## Callback prop drilling

Combat action dispatch (strike, ability, feature activate) is wired through callbacks drilled from `LobbyView` all the way down through `CombatPanel` → `ActionPanel` → individual buttons. This makes the panels hard to test in isolation — any test of `ActionPanel` requires mocking the full callback chain.

## No tests

Zero component tests. CombatHistorySidebar (484 lines) and ActionPanel/V2 (335/356 lines) are both at the size where testing becomes impractical without it.
