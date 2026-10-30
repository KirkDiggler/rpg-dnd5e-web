# 2026-10-30 · Frank's list S7 · Add action and Drop action in the studio

processed: 2026-10-30T183312Z

Story [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714), slice [rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721), PR [rpg-dnd5e-web#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353).

## Shipped

- The cast form's Advanced editor and a placement's Overrides author `addActions` and `dropActions` as ordered ref lists with Move up/down ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- The Read back says each add and drop and what the creature fights with, in the session's order, from the draft alone ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- A new engine law, `dropAbsent`, states that the session refuses a drop absent from its layer at launch, sourced to rpg-toolkit `session/entities.go augmentActions` ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- A second engine law, `noWeapons`, states that the session refuses a creature left with no weapon at launch, sourced to rpg-toolkit `monster/weapons.go Monster.SetWeapons` ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353), review).
- Not built: the Grant story's player half, an item that hands a sheet an activation and returns to its owner. This slice is the NPC half only ([rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714)).

## Decided

- With no `actions:` at any layer, the Read back says "the kind's weapons" and never guesses the rulebook base's list ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- A ref the toolkit grammar refuses never enters either list; the field says why in the grammar's own sentence ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- Text typed in Add action or Drop action but not added makes the cast form's Apply refuse, naming the text and focusing the field; Cancel clears it ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353), review).
- An add of a weapon the list already holds reads "another javelin"; with no `actions:` at any layer an add reads "on top of the kind's weapons" ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353), review).

## Found

- Validate-only PutDungeon refuses only a malformed or non-weapon action ref. An unknown weapon id and a drop absent from its layer are refused at session assembly, when the run launches, so they cannot jump to the field until [rpg-toolkit#2168](https://github.com/KirkDiggler/rpg-toolkit/issues/2168) lands ([rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721)).
- The castle captain already carries the javelin in `actions:`, so adding one through the form gives him two ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).

## Mistaken

- The first Read back said "It fights with no weapon." when every weapon was dropped, but the engine refuses that launch; it also said "a javelin the kind does not" for the captain, who already carries one. Both corrected after review ([#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353)).
- `normalizeBinding` never copied `addActions`/`dropActions` after web#1331 added them, so any orders edit on a placement erased both lists. Fixed with a regression test in [#1353](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1353).
- The issue described the Weapons list as having Move up/down; the cast form's Weapons list has none ([rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721)).

— cross-team agent, on behalf of KirkDiggler
