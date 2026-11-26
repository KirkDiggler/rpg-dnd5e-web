# Run — 2026-11-26 — Custom items S4: new item by its name, delete item

Slice [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`11d7a082`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/11d7a082).

## Shipped

- Items page: a name input and "New item" (id made from the name, shown under the input), and "Delete item" in the selected item's detail; each is one undoable change — [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202).

## Decided

- none beyond the issue — [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202).

## Found

- F1 to F6 held at `11d7a082`; F4's engine rule is in `rpg-toolkit` `origin/main` (`magicitems/compile.go`) — [Rests on comment](https://github.com/KirkDiggler/rpg-project/issues/1202#issuecomment-7188623117).
- A test of `firstRequiredText` on the engine's real table cannot fail on the `required` check, since its first text word is required; a table with an optional text word first is built in the test — [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202).
- After a delete the item is unselected because the list no longer holds the focused id; the focus id stays, so Undo shows the item selected again — [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202).

## Mistaken

- The first draft of the new-item tests passed with `.trim()` removed from the block; a padded name was added to the test and the mutant then failed — [rpg-project#1202](https://github.com/KirkDiggler/rpg-project/issues/1202).

— cross-team agent, on behalf of KirkDiggler
