# Monster-turn camera preview

Slice: [rpg-project#799](https://github.com/KirkDiggler/rpg-project/issues/799).

- `Follow monster turns` defaults off in the existing debug controls and uses the existing local preference store.
- The presented turn's actor, not the server's advanced active-turn snapshot, selects a focus candidate. Only a currently sighted `MONSTER` qualifies; player actors, missing sightings and visual memories do not.
- Camera receives a separate keyed presentation pan. Viewer `focusTarget`, F/Center on me, rotation pivot, zoom and angle retain their existing roles. A turn-start request is applied once; same-key position changes do not repeatedly take back the camera. This is centering at turn start, not continuous miniature tracking.
- On turn end or disabled following, any unfinished automatic pan stops in place; there is no forced return to the player. Explicit Center on me remains available.
- Notification Concepts mounts the production `SessionCanvas` via `SessionCombatMap`, the real pacing hook and the same focus selector as the session. The zombie-memory checkbox supplies an explicit remembered sighting.

## Evidence

- 342 tests pass across 10 files: camera hook, session canvas, live session wiring, focus selector and feel controls.
- Typecheck passes. Targeted ESLint and diff whitespace checks run before checkpoint.
- Browser renders the shared map without page errors; default-off and persisted-on controls verified. On/off/home screenshots inspected: the camera moves to the zombie's area with following on and returns to Aldric using Center on me, with the same angle and scale.
- Preview on port 3059, `?concept=notifications`. Port 3041 remains notification S1, unchanged.

## Not yet claimed

No live-stack operator playthrough, full CI, review or merge for S2. Automatic centering uses current observer sighting positions; tracking a moving body's interpolated render position is not implemented here. The inherited 300ms beat spacing is unchanged and may be too brisk for the desired feel; tune only after the operator tries this view.
