# Session combat production promotion — #817

Date: 2026-08-25

## Reproducible concept target

- Development deep link: `?concept=session-combat`
- Required viewports: `1280x800`, `1024x768`
- Shared renderer: `src/components/session/combat-experience/CombatExperience.tsx`
- Production route: `src/components/session/SessionEncounterView.tsx`

## Automated evidence

`SessionEncounterView.test.tsx` mounts the production shared shell and proves
panel-first exact Attack targeting, unavailable provider reasons, no unarmed map
dispatch, ambiguity and malformed-target-kind refusal, exact Move/End Turn
selectors, authenticated-owner private cache isolation, public map/action
operation during initial private failure, Turn/Afford freshness and synchronous
event invalidation, unified no-retry FAILED_PRECONDITION recovery for all three
verbs, stable public-roster dice ownership through FightEnded, authoritative-only
result fields, coalesced refresh, immediate Debug, presentation-only
other-member pacing, catch-up Story, equipment response replacement, reconnect,
scope reset, doors, roster pull, movement reconciliation, and the run-ended
overlay.

The shared component/concept/dice/recovery suites and full `npm run ci-check`
results are recorded in the Task 14 report and PR.

## Screenshot limit

No screenshot is committed from this checkout. The required licensed Synty
runtime tree (`public/models/synty/`) is absent, and the requested helper
`tools/browser/screenshot.mjs` is not present. Only unrelated/open local assets
and `public/models/human_test.glb` are available. Capturing the concept would
therefore show missing-asset fallbacks rather than the approved map fidelity.
No route interception, placeholder GLB/PNG, or private/licensed artifact was
created or committed.

Run the two viewports from an asset-complete authorized checkout before merge:

```bash
node tools/browser/screenshot.mjs \
  --url 'http://localhost:5173/?concept=session-combat' \
  --width 1280 --height 800
node tools/browser/screenshot.mjs \
  --url 'http://localhost:5173/?concept=session-combat' \
  --width 1024 --height 768
```

## Live limit

The authenticated two-browser API journey requires an asset-complete web host,
two owned characters, and a live API environment. It remains a controller gate;
no simulated result is presented as live evidence here.
