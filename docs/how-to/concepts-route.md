---
name: working with /concepts
description: How to use and add to the UI prototyping sandbox
updated: 2026-05-02
---

# Working with /concepts

## What it is

`/concepts` is a route for isolated UI prototyping. It exists so new UI ideas can be built and evaluated without touching production encounter paths.

## Accessing it

In development, navigate to `http://localhost:5173/concepts` after running `npm run dev`.

The route is defined in `App.tsx` and is available in both dev and production builds. It is not linked from any production UI.

## Adding a new concept

1. Create a directory under `src/concepts/your-concept-name/`
2. Build a self-contained prototype. Hard-coded data is fine for a concept. Do not import from the production encounter flow.
3. Register a route in `ConceptsView.tsx`

## Promoting a concept to production

There is no formal process yet. When a concept is ready:

1. File an issue on the project board describing what the concept replaces or extends
2. In a new branch, replace any hard-coded data with API calls using the existing proto hooks
3. Wire the component into the production flow (character creation, encounter, etc.)
4. Remove or keep the `/concepts` entry as a development reference
5. Run `npm run ci-check` and create a PR

## Current concepts

| Concept            | Status                   | Notes                                                                                                        |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `class-selection/` | Prototype — not promoted | Enriched class selection UI with guidance panels. Hard-coded data in `data.ts`. Needs API wiring to promote. |
