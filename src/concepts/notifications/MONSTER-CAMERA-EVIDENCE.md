# Monster-turn camera preview

Slice: [rpg-project#799](https://github.com/KirkDiggler/rpg-project/issues/799).

- `Follow monster turns` defaults on in the existing debug controls and uses the existing local preference store. Explicitly saved off remains off; reset the control to try the new default.
- Monster-turn attacks, casts, ability uses and speech share the same paced action ownership; a cast or ability use counts as an action rather than a turn that did nothing.
- Off suppresses monster-turn toasts without deleting story history. The pacing cursor identifies monster-owned rows using typed participant kind; the notice hook reads that selection. Own action results and heard-sound cues remain visible. Switching back on does not replay suppressed history.
- The presented turn's actor, not the server's advanced active-turn snapshot, selects a focus candidate. Only a currently sighted `MONSTER` qualifies; player actors, missing sightings and visual memories do not.
- Camera receives a separate keyed presentation pan. Viewer `focusTarget`, F/Center on me, rotation pivot, zoom and angle retain their existing roles. A turn-start request is applied once; same-key position changes do not repeatedly take back the camera. This is centering at turn start, not continuous miniature tracking.
- On turn end or disabled following, any unfinished automatic pan stops in place; there is no forced return to the player. Explicit Center on me remains available.
- Notification Concepts mounts the production `SessionCanvas` via `SessionCombatMap`, the real pacing hook and the same focus selector as the session. The zombie-memory checkbox supplies an explicit remembered sighting.

## Evidence

- Review-fix verification: 200 tests pass across queue, pacing, notices and live session suites. Real `buildActStory` → pacing → `useStoryNotices` tests cover cast/ability/speech notices with follow both off and on, retaining history and correct end-of-turn narration.
- Initial 430 tests pass across 13 files: camera hook, session canvas, live session wiring, focus selector, notice lifecycle, playback and feel controls.
- Typecheck, targeted ESLint, diff whitespace checks and the full local `npm run ci-check` pass.
- Browser renders the shared map without page errors; default-on, monster toasts enabled/disabled, retained history and continued own-result/hearing toasts verified. On/off/home screenshots inspected: the camera moves to the zombie's area with following on and returns to Aldric using Center on me, with the same angle and scale.
- Preview on port 3059, `?concept=notifications`. Port 3041 remains notification S1, unchanged.

## Not yet claimed

No live-stack operator playthrough, independent review or merge for S2. GitHub CI is separate from the completed local gate. Automatic centering uses current observer sighting positions; tracking a moving body's interpolated render position is not implemented here. The inherited 300ms beat spacing is unchanged and may be too brisk for the desired feel; tune only after the operator tries this view.
