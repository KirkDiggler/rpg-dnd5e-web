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

## Copilot review fix

- Inline `3859462714`: member-scoped Story pacing now resets its timer, queue,
  draining flag, announced actor, beat flag, hidden IDs, and notice on member
  change and unmount. Render-scoped state prevents a prior member's Story or
  notice from projecting during the switch, and timer callbacks carry a stale
  scope fence.
- Inline `3859462730`: the collapsed dice-drawer chevron is now an
  `aria-hidden` decorative cue rather than a behaviorless focusable button;
  expanded authoritative roller controls remain interactive.
- RED: the new pacing and drawer regressions produced `2 failed | 15 passed`
  against `a840a1b`.
- GREEN: the focused regressions produced `17 passed`; the pacing/drawer/combat/
  concept gate produced `16 files passed | 219 tests passed`.
- Implementation commit: `4074ed2f26531d946bbdb535544b55332f2311dd`.
- Gates: Prettier format check, ESLint, TypeScript, build, focused tests, full
  tests, and `npm run ci-check` all passed; `git diff --check` passed.

## Visual-gate layout correction

An actual visual-gate run with synced licensed assets and system Chrome exposed a
layout failure that DOM structure tests had missed: at
`?concept=session-combat`, the shared game frame computed to `2px` high and the
map to `0px`. The generic `.combatExperience .gameFrame` selector forced
`height: 100%` for every mount, overriding the approved `800px` review frame
inside Concepts Lab even though that parent has no definite height.

The shared renderer now defaults to the fixed review-frame presentation (`800px`,
with the existing `768px` media floor). Only `SessionEncounterView` explicitly
selects the production fill-parent mode, whose discriminating selector applies
`height: 100%` and `border-radius: 0`. Shared-component, concept, production-route,
and CSS contract tests pin that separation and reject the former generic
selector.

The visual evidence must be recaptured at both required viewports from an
authorized checkout with the actual synced assets. The collapsed pre-fix capture
is invalid and must not be used as approval evidence; no fallback, placeholder,
or intercepted asset capture qualifies.
