# #1054 organized HUD concept contract

Deep link: `?concept=organized-hud` (development Concepts Lab only).

## Boundaries

- `CombatExperience` remains the real production-owned scene shell, target surface, map composition, initiative, story log, resource/status projection, and action lifecycle gate.
- `ActionDock` receives an explicit `actionPresentation.mode: 'organized-hud'`; omitting it keeps the normal live dock.
- `OrganizedActionSurface` only orders and opens current `Declaration` offers. It resolves an id against current props immediately before calling the existing selection callback. It does not calculate availability, costs, spell level, cantrip status, targets, or execution.
- The concept owns fixture selection, PC/landscape-phone frame controls and the fixture-only intent receipt. No concept callback writes to the network or claims a successful rules execution.

## Provisional display metadata

`fixtures.ts` passes `quickDeclarationIds` and `sectionByDeclarationId` separately from generated `Declaration` facts. Exact ids used: `offer:aldric:move`, `offer:aldric:longsword:action`, `mockery`, and `guidance` for Quick; `mockery`, `bane`, `fire-bolt`, `command`, and `guidance` for Spells.

The installed `SpellRef` has only `ref` and `name`. This concept does **not** infer cantrips, spell levels, slot costs, or repeatability from names, refs, classes, missing costs, or resources. Promotion needs an authoritative display-hints/provider contract (or author-provided declaration section/shortcut metadata) that carries those semantics explicitly.

## Walkthrough

1. Open `?concept=organized-hud`, select Full slots or Spent slots, then open Spells / Abilities / All actions. Disabled rows retain provider refusal text in their keyboard-readable label/title.
2. Select an available offer: its collection closes before the existing target surface is shown; the receipt says fixture-only intent.
3. Choose Stale authority and confirm buttons cannot dispatch. Choose Spectator to exercise the real shell's existing watching gate.
4. Toggle PC and Landscape phone. Phone is a true 844×390 bounded viewport rather than a scaled desktop image. The scene is the real session concept map composition; actual mobile touch camera gestures and zoom controls are intentionally absent.

## Known promotion gaps

This is concept-only and not promoted to live session routes. It does not add touch gestures/camera controls, nor does it decide item use: Items opens the existing equipment entry only where the caller supplies it and no item-use declaration exists. Browser proof should still validate the live 3D session canvas route separately if that asset-loading claim is required; this fixture uses the established `SessionCombatMap` harness renderer.
