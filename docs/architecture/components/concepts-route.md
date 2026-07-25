---
name: /concepts route
description: UI prototyping sandbox — isolated from production, no promotion process
updated: 2026-07-22
confidence: high — verified by reading ConceptsView.tsx and the concepts/ directory
---

# /concepts route

`src/concepts/` — a sandbox for UI prototyping without touching production paths.

## Purpose

`/concepts` is a development-only route where new UI ideas can be built and explored without risk to the production encounter flow. `ConceptsView.tsx` routes to isolated prototype components.

Since the Game-UX charter (web#525) it is also the **outside-in contract bench**: concepts render the real shared components against typed fixtures (see `docs/how-to/concepts-route.md`, "The fixture-first convention"). Fixture shapes that the wire doesn't carry yet are the draft of the next proto feature request — the concept proves the need before the contract is asked for.

## Current contents

`src/concepts/class-selection/` — enriched class selection UI prototype. Landed in PR #344 (2026-03-22). Includes:

- `ClassSelectionConcept.tsx` — top-level concept
- `ClassOverview.tsx`, `AbilityScoreGuidance.tsx`, `EquipmentGuidance.tsx`, `LevelProgression.tsx`, `ProficiencyDetails.tsx`, `SavingThrowContext.tsx`
- `data.ts` — hardcoded class data for the prototype

`src/concepts/encounter-dock/` — verification harness for the live `EncounterDock`'s responsive behavior (#494/#519); renders the real component with mock proto data.

`src/concepts/combat-panel/` — round-1 IA design bench for web#525. `fixtures.ts` (proto-typed fixture states incl. armed/spent/spectator/free-roam), `CommandBar.tsx` + `CommandBarWithContext.tsx` (compositions of `src/components/ui/combat/` primitives), `CombatPanelConcept.tsx` (fixture switcher + Discord-viewport frame). `ComfortBar.tsx`'s equipment chip imports the production `EquipmentPopover` (see below) with its own local "plays-the-server" state.

`src/concepts/equipment/` — the equipment chip + popover bench (web#531/#557), now promoted to production (web#571, see [equipment.md](equipment.md)): `EquipmentConcept.tsx` imports the production `EquipmentSlots`/`InventoryLight` from `src/components/game/equipment/` directly and feeds them `fixtures.ts` (typed to the same wire-shaped interfaces) plus the concept-only cast switcher and intent log. `CONTRACT.md` records the original wire gaps this bench asked for — all landed (rpg-api-protos#188, rpg-toolkit#812, rpg-api#682).

`src/concepts/combat-pacing/` — the attack-loop beat-sequencer bench
(web#561): `fixtures.ts` (8 event-shaped round-one scenarios matching the
real `AttackResolved`/`EntityDamaged`/`ActionResolved` field shapes),
`useBeatSequencer.ts` (the pure Cue→Throw→Verdict→Impact→Release timing
state machine — pace-derived durations, crit stretch, auto-throw
timeout, tap-to-skip, repeat-roll compression), `BeatStage.tsx` (the
presentational verdict and impact surface, beat-shaped props only,
token-anchored-promotes-to-center-stage on crit/nat-1), and
`CombatPacingConcept.tsx` (one shared tray: routine outcomes sit upper
center and crit/nat-1 frame breaks promote it center-stage, plus a
pace-override/reduced-motion/viewport-frame switcher and an event/intent
inspector). `CONTRACT.md` restates
design.md §6's wire-shape candidates in the equipment concept's
gap-log STRUCTURE, but stays evidence-only (not yet ask-shaped like the
equipment file) — no Platform issue filed by this round.

`src/concepts/just-roll/` — local-only d20 play that reuses one persistent
presentation-only `src/components/ui/dice/DiceTray` across rolls; it and
combat pacing supply the tray's phase, outcome, motion, and final face.

## Gap: no promotion process

There is no documented process for promoting a concept to production. The class-selection spike has existed since March 2026 with no next step defined. When a concept is ready, it needs:

1. A design decision on whether to replace the existing class selection flow
2. A PR that wires the component into the character creation flow and removes the hardcoded `data.ts`
3. Removal from the `/concepts` route (or keeping it as a development reference)

## Gap: hardcoded data

`data.ts` in the class-selection concept contains hardcoded class descriptions, ability score guidance, and level progression tables. This is exactly the kind of data that should come from the API (via proto responses), not be hardcoded in the web layer. If this concept is promoted to production, the data layer must be replaced with API calls.
