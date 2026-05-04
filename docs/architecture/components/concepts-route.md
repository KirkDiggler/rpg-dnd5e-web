---
name: /concepts route
description: UI prototyping sandbox — isolated from production, no promotion process
updated: 2026-05-02
confidence: high — verified by reading ConceptsView.tsx and the concepts/ directory
---

# /concepts route

`src/concepts/` — a sandbox for UI prototyping without touching production paths.

## Purpose

`/concepts` is a development-only route where new UI ideas can be built and explored without risk to the production encounter flow. `ConceptsView.tsx` routes to isolated prototype components.

## Current contents

`src/concepts/class-selection/` — enriched class selection UI prototype. Landed in PR #344 (2026-03-22). Includes:

- `ClassSelectionConcept.tsx` — top-level concept
- `ClassOverview.tsx`, `AbilityScoreGuidance.tsx`, `EquipmentGuidance.tsx`, `LevelProgression.tsx`, `ProficiencyDetails.tsx`, `SavingThrowContext.tsx`
- `data.ts` — hardcoded class data for the prototype

## Gap: no promotion process

There is no documented process for promoting a concept to production. The class-selection spike has existed since March 2026 with no next step defined. When a concept is ready, it needs:

1. A design decision on whether to replace the existing class selection flow
2. A PR that wires the component into the character creation flow and removes the hardcoded `data.ts`
3. Removal from the `/concepts` route (or keeping it as a development reference)

## Gap: hardcoded data

`data.ts` in the class-selection concept contains hardcoded class descriptions, ability score guidance, and level progression tables. This is exactly the kind of data that should come from the API (via proto responses), not be hardcoded in the web layer. If this concept is promoted to production, the data layer must be replaced with API calls.
