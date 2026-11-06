# Run — 2026-11-06 — Courtyard S2 ground authoring

Slice [#874](https://github.com/KirkDiggler/rpg-project/issues/874), story [#867](https://github.com/KirkDiggler/rpg-project/issues/867). Base: `dev` at `2150256f`.

## Shipped

- T1 checkpoint adds region-ground edit/validation intent and real local/composition/native-document round trips; controls, resources and live play are not delivered by this checkpoint — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

## Decided

- Keep paint equal to the base as explicit intent; prune paint when its region loses the cell; preserve unknown native-source fields and old absence — [design and plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- Keep the authoring/persistence assertions together in the new ground test file while exercising real room/composition/native helpers rather than adding duplicate fixtures to large existing suites — [S2 plan T1](https://github.com/KirkDiggler/rpg-project/blob/design/867-courtyard-ground/ideas/courtyard-ground/plan.md#t1--authoring-state-persistence-and-edit-invariants).

## Found

- Missing-contract test run failed on the absent `regionGround` import; after implementation the five focused files pass 130 tests and TypeScript checks pass — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Existing region owner edits retain unknown fields unchanged, so ground needs explicit pruning to avoid orphan paint after floor edits — [S2 plan](https://github.com/KirkDiggler/rpg-project/pull/875).

## Mistaken

- A targeted edit initially mismatched a comment; the exact source was reread and the batch reapplied before testing — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
