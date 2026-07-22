---
name: working with /concepts
description: How to use and add to the UI prototyping sandbox
updated: 2026-07-22
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
a concept (e.g. "Combat Pacing"). There is no production entry point —
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
- **The fixture contract is the draft proto contract.** Where the panel
  needs data the wire does NOT carry, keep that data in a clearly separated
  fixture type. That delta, once the concept proves it, becomes a concrete
  feature request to the platform team on board #19 (example:
  rpg-api-protos#183, the combat-HUD data gap).
- **Promotion = a data-source swap.** If the fixtures were faithful, wiring
  the composition into the game screen changes the data source, not the
  components.

## Promoting a concept to production

There is no formal process yet. When a concept is ready:

1. File an issue on the project board describing what the concept replaces or extends
2. In a new branch, replace any hard-coded data with API calls using the existing proto hooks
3. Wire the component into the production flow (character creation, encounter, etc.)
4. Remove or keep the `/concepts` entry as a development reference
5. Run `npm run ci-check` and create a PR

## Current concepts

| Concept            | Status                   | Notes                                                                                                                                                                  |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class-selection/` | Prototype — not promoted | Enriched class selection UI with guidance panels. Hard-coded data in `data.ts`. Needs API wiring to promote.                                                           |
| `encounter-dock/`  | Verification harness     | Renders the live `EncounterDock` with mock data to check responsive wrap behavior (#494/#519).                                                                         |
| `combat-panel/`    | Design review (web#525)  | Round-1 IA compositions built from `ui/combat` primitives on proto-typed fixtures; fixture-first exemplar.                                                             |
| `combat-pacing/`   | Design review (web#561)  | Round-1 beat-sequencer bench (`useBeatSequencer` + `BeatStage`) comparing token-anchored vs. center-stage die placement on identical fixtures; fixture-first exemplar. |
