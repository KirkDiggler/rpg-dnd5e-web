# 2026-10-30 · Frank's list S7 · Add action and Drop action in the studio

Story [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714), slice [rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721), PR [rpg-dnd5e-web#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353).

## Shipped

- The cast form's Advanced editor and a placement's Overrides author `addActions` and `dropActions` as ordered ref lists with Move up/down ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- The Read back says each add and drop and what the creature fights with, in the session's order, from the draft alone ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- A new engine law, `dropAbsent`, states that the session refuses a drop absent from its layer at launch, sourced to rpg-toolkit `session/entities.go augmentActions` ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).

## Decided

- With no `actions:` at any layer, the Read back says "the kind's weapons" and never guesses the rulebook base's list ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- A ref the toolkit grammar refuses never enters either list; the field says why in the grammar's own sentence ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).

## Found

- Validate-only PutDungeon refuses only a malformed or non-weapon action ref. An unknown weapon id and a drop absent from its layer are refused at session assembly, when the run launches, so they cannot jump to the field yet ([rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721)).
- The castle captain already carries the javelin in `actions:`, so adding one through the form gives him two ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).

## Mistaken

- `normalizeBinding` never copied `addActions`/`dropActions` after web#1331 added them, so any orders edit on a placement erased both lists. Fixed with a regression test in [#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353).
- The issue described the Weapons list as having Move up/down; the cast form's Weapons list has none ([rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721)).

— cross-team agent, on behalf of KirkDiggler
