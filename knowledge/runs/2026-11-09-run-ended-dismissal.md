# Run — 2026-11-09 — Run-ended toast dismissal lifecycle

## Shipped

- Prepared an ending-keyed toast scope in Web#1401 so the existing dismissal/fade behavior survives commit-before-passive-effect ordering; release remains gated on full/current-head checks — [bug](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1403).

## Decided

- Reused the existing SessionEncounterView/SessionEncounterScope keyed lifecycle because dismissal and fade state belong to one ending; a passive reset should not overwrite user intent already issued against its committed DOM. No wait, timer increase, skipped assertion or new asset-editor abstraction — [bug](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1403).
- Kept same-ending metadata updates from reopening the toast and reset state on each ending change, including A→B→A, because that preserves the prior intended prop-change behavior without effect-order dependence. The passive effect owns only its fade timer and cleanup; leaving remains an explicit button — [original toast contract](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/999).

## Found

- The isolated failing integration case and complete157-test session file passed locally, but clicking Dismiss during a layout effect before passive effects deterministically reproduced the remaining-toast assertion. The original mount effect wrote dismissed=false after the click; the new keyed scope passes this regression and all existing cases — [CI failure and diagnostic](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1401#issuecomment-6750392119).
- Seven toast tests plus157 session integration tests pass, with types/lint clean. Added coverage checks early dismissal, same/different ending identities, fade restart, timer cleanup and no automatic navigation — [bug](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1403).

## Mistaken

- The prior implementation used a passive effect for both initial/identity resets and timer ownership, allowing its initial reset to win over a dismissal. Existing tests normally flushed effects before clicking, so ordinary local runs did not distinguish the race; the deterministic ordering regression now does — [bug](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1403).
