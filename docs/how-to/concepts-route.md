---
name: working with /concepts
description: How to use and add to the UI prototyping sandbox
updated: 2026-09-01
---

# Working with /concepts

## What it is

`/concepts` is a route for isolated UI prototyping. It exists so new UI ideas can be built and evaluated without touching production encounter paths.

## Accessing it

`/concepts` is not a URL path — `ConceptsView` is a `currentView` React
state in `App.tsx`, not a router route. In development, run `npm run dev`,
load the app, then click the floating 🧪 "Open Concepts Lab" button
(bottom-right, only rendered when `import.meta.env.MODE === 'development'`)
to switch into it; use the sub-nav buttons at the top of that view to pick
a concept (e.g. "Combat Pacing"). A reproducible development deep link is
`?concept=<id>` (for example `?concept=asset-anchor-lab` or
`?concept=weapon-attachment`). There is no production entry point —
the dev-tools button is gated behind the same `isDevelopment` check as
the rest of `App.tsx`'s dev tools row.

## Adding a new concept

1. Create a directory under `src/concepts/your-concept-name/`
2. Build a self-contained prototype and register a route in `ConceptsView.tsx`
3. Prefer the **fixture-first** convention (below) over ad-hoc hard-coded data

## The fixture-first convention (outside-in)

Since the Game-UX charter (web#525), concepts are how we develop the REAL
components against fixture data — not throwaway mockups:

- **Real components, fixture data.** The concept renders the actual shared
  components (e.g. `src/components/ui/combat/`), fed by typed fixtures kept
  next to the concept (`fixtures.ts`). Type fixtures against the real
  generated proto types wherever the wire already carries the data — a
  component must not be able to tell fixture from stream.
- **Fixtures cover the states that are hard to reach live**: armed actions,
  spent reactions, spectator turns, FREE_ROAM intervals.
- **The fixture contract discovers the desired contract; it does not ratify one
  automatically.** Where the panel needs data the wire does NOT carry, keep that
  data in a clearly separated, explicitly provisional fixture type. After the UX
  proves the semantics, record the delta and exact open questions. Only then can
  Kirk choose whether it becomes a concrete Platform request on board #19
  (example: rpg-api-protos#183, the combat-HUD data gap).
- **Promotion = a data-source swap.** If the fixtures were faithful, wiring
  the composition into the game screen changes the data source, not the
  components. The session-combat harness is the completed reference: both it
  and `SessionEncounterView` import the production-owned `CombatExperience`;
  the concept supplies generated fixtures, while production supplies exact
  RPC declarations, owner-private CharacterData, and recovered typed events.

## Promoting a concept to production

Use this promotion checklist when a concept is ready:

1. File an issue on the project board describing what the concept replaces or extends
2. In a new branch, replace any hard-coded data with API calls using the existing proto hooks
3. Wire the component into the production flow (character creation, encounter, etc.)
4. Remove or keep the `/concepts` entry as a development reference
5. Run `npm run ci-check` and create a PR

## Current concepts

| Concept                   | Status                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class-selection/`        | Prototype — not promoted      | Enriched class selection UI with guidance panels. Hard-coded data in `data.ts`. Needs API wiring to promote.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `encounter-dock/`         | Verification harness          | Renders the live `EncounterDock` with mock data to check responsive wrap behavior (#494/#519).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `combat-panel/`           | Design review (web#525)       | Round-1 IA compositions built from `ui/combat` primitives on proto-typed fixtures; fixture-first exemplar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `session-combat/`         | Promoted shared-shell harness | Deep link `?concept=session-combat` renders the same production-owned `CombatExperience`, `ActionDock`, `TargetSurface`, `StoryLog`, `DiceDrawer`, and `SessionCanvas` now mounted by the live session route (#817). Generated Declaration/Participant/CharacterData fixtures, controls, and contract inspector remain concept-only; production supplies exact RPC, recovery, private-cache, and presentation-controller wiring.                                                                                                                                                                                                                                                                                                                           |
| `combat-pacing/`          | Design review (web#561)       | Round-1 beat-sequencer bench (`useBeatSequencer` + `BeatStage`) with one shared tray: routine outcomes upper-center and crit/nat-1 frame breaks center-stage; fixture-first exemplar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `just-roll/`              | Concept exploration           | Persistent local-only d20 play that reuses one shared `src/components/ui/dice/DiceTray` across rolls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fog-of-war/`             | Design review (web#605)       | Viewer-scoped fog contract, remembered-vs-visible knowledge, authority/knowledge event boundary enforced by test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `dungeon-builder/`        | Graduated authoring surface   | Shared authoring component tree: live at `/author`, fixture-backed in Concepts Lab. Hex-true 2D/3D canvas, palette/Inspector/YAML, and Play/Walk/Orbit cameras; see `src/author/CONTRACT.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `prop-composition`        | Learn verdict (web#728)       | Fixture-only surface in `src/author/PropCompositionConcept.tsx`: actual bookcase/ornate-torch models, bounded wall-local nudge/snap/replace/reset, and the shared tactical Play camera. Findings: `docs/evidence/prop-composition-728.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `asset-anchor-lab`        | Learn verdict (web#731)       | Actual synced bookcase, ornate torch, and fighter standing/downed GLBs; Raw-only start plus explicit Calibrated-only/Overlay, anchored scene labels, recommended/diagnostic candidate actions, preset base vs ±25 cm fine trim, measured visible/nominal wall targets, one owning hex, and a positive load/measurement/render-acknowledged Orbit/Play gate where Raw-only earns no candidate credit. Non-production output only. Findings: `docs/evidence/asset-anchor-lab-731.md`.                                                                                                                                                                                                                                                                        |
| `weapon-attachment`       | Learn verdict (web#821)       | Deep link: `?concept=weapon-attachment`. Uses the real shared `ClassCharacterModel` with provisional fighter main-hand fixtures only: unarmed/longsword/shortbow across idle/walk. Scope is evidence-only: provisional candidate provenance, socket inspector, and texture-budget warnings for provider follow-up. Verdict/docs: `src/concepts/weapon-attachment/CONTRACT.md`, `docs/evidence/821-weapon-attachment/README.md`. Kirk accepted the attachment proof, accepted `SM_Prop_Bow_01` provisionally for shortbow, rejected oversized `SM_Wep_Slayer_01` for final longsword semantics, and left provider gaps around final asset selection, normalized exports, socket receipt, and texture budget. No production writer or live equipment wiring. |
| `character-customization` | Learn verdict (web#877)       | Deep link: `?concept=character-customization`. Uses two real `ClassCharacterModel` instances to exercise exact provider-backed scalp/facial-hair rebinding, shared controlled runtime treatment, immutable reference-twin isolation, motion/view changes, and an optional canonical weapon witness. Exact bind identities, source-armature count, asset receipts, and R3F-commit-fenced coverage remain Concept-only. Browser proof and non-production boundaries: `src/concepts/character-customization/CONTRACT.md`. Local candidate GLBs remain ignored; no production writer, API/proto/toolkit behavior, or persistence was added.                                                                                                                    |
| `world-building`          | Durable concept (web#935)     | Deep link: `?concept=world-building`. Blank continuous-world staging surface with a real hex scale, shared `PropModel` assets, palette/tabletop drag-to-add, click/Shift-click selection, visible Three/Drei Move and upright-Y Rotate gizmos, Blender-style middle-orbit/Shift-middle-pan, editable group/support descendants, independent drag-stamped arrangements, and versioned local scene/library JSON. It is explicitly provisional and does not change live one-placement-per-cell dungeon YAML/API behavior. Contract and real-browser proof: `src/concepts/world-building/CONTRACT.md`.                                                                                                                                                         |
