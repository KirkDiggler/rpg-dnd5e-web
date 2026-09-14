# #1054 organized HUD concept contract

Normal Lab link: `?concept=organized-hud`. Viewport walkthrough link: `?concept=organized-hud&preview=1` (also exposed as **Open viewport preview** in the concept). Both are development Concepts Lab surfaces only.

## Boundaries

- `CombatExperience` remains the real production-owned scene shell, target surface, map composition, initiative, story log, resource/status projection, and action lifecycle gate.
- `ActionDock` receives an explicit `actionPresentation.mode: 'organized-hud'`; omitting it keeps the normal live dock. Existing reaction, death-save, and `CastOptionGroup` gates remain ahead of the organizer.
- `OrganizedActionSurface` only orders, inspects, and opens current `Declaration` offers. It resolves an id against current props immediately before calling the existing selection callback. It does not calculate availability, costs, spell level, cantrip status, targets, or execution. Its visible Details control does not select/arm an offer.
- The concept owns fixture selection, PC/landscape-phone frame controls, Escape/cancel reset, and the fixture-only intent receipt. No concept callback writes to the network or claims a successful rules execution.

## Provisional display metadata

`fixtures.ts` passes `quickDeclarationIds` and `sectionByDeclarationId` separately from generated `Declaration` facts. Quick uses `offer:aldric:move` and `offer:aldric:longsword:action`; spell sections use `mockery`, `bane`, `fire-bolt`, `command`, and `guidance`. The unhinted `shortbow` is deliberately retained in **All actions**, so every shortcut omitted for bounded phone capacity remains discoverable.

The installed `SpellRef` has only `ref` and `name`. This concept does **not** infer cantrips, spell levels, slot costs, or repeatability from names, refs, classes, missing costs, or resources. Promotion needs an authoritative display-hints/provider contract (or author-provided declaration section/shortcut metadata) that carries those semantics explicitly.

## Walkthrough

1. Open the normal Lab route and use **Open viewport preview** for a full-viewport PC or landscape-phone walkthrough. Preview collapses the Lab chrome into a reachable Controls drawer; Landscape phone is an actual active frame mode, not merely a smaller browser viewport.
2. Select Full slots or Spent slots. Open Spells / Abilities / All actions. Tap **Details** for available or denied offers to read current tooltip facts and provider refusal copy without arming an action.
3. Select Bane: its generated fixture has MEMBER candidates, 1–2 cardinality, a provider cost, target selection, explicit confirmation, and Cancel/Escape reset. Select Command to demonstrate the existing shared options group and its Cancel.
4. Choose Stale authority and confirm selection cannot dispatch. Choose Spectator to exercise the real shell's existing watching gate. Items honestly routes to existing equipment only when no item-use declaration exists.

## Evidence correction (first proof failure)

The first pass checked only document horizontal width and changed browser dimensions without selecting Landscape phone. It also allowed the fixed-height child shell to exceed its clipped frame, leaving the desktop dock below the viewport. This was corrected with a viewport preview whose frame and shared shell use the same viewport height bound. Fix-pass browser evidence must click and assert the phone control, measure both axes for frame/dock/End Turn/quick/tray, and `elementFromPoint` each intended click center before clicking. It must not use auto-scroll as proof of reachability.

## Known promotion gaps

This is concept-only and not promoted to live session routes. It does not add touch gestures/camera controls, nor does it decide item use. The fixture map is the established `SessionCombatMap` harness renderer, so it does not independently prove an asset-loaded live 3D session canvas.
