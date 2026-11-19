# Run — 2026-11-19 — Shared wall-kit height fitting

## Shipped

- Implementation checkpoint only: a pure declared-height planner and the existing upper-row renderer use one bounded layout; provider configuration, all wall/door adapters and visual integration remain unfinished — [Courtyard S6](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Decided

- Bound repeat-row allocation, not a valid requested height: residual scale belongs to the upper rows actually created, never to the fixed opening or leaf — [agreed fitting direction](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Keep the old proportional-input minimum behavior at its legacy adapter while the new explicit-height contract refuses targets below the fixed region — [implementation plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).

## Found

- The old clone cap could render height 66 while reporting 120; the actual-geometry regression now reaches 120 with 64 upper courses and an unchanged 1.8-height leaf, then shrinks back to native height — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Residual scaling about a centred mesh pivot shifted the row base; anchoring the lower face removes the gap without moving fixed geometry — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The pure planner and loaded-model checks pass (29 focused tests), as do targeted lint and typecheck; this is not a full-gate, whole-kit or screenshot-reproduction claim — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Mistaken

- The initial plan proposed rejecting row-count overflow before reconciling the base renderer's documented pool policy; corrected it to preserve requested height with bounded allocation instead — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
