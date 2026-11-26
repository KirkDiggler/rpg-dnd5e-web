# Run — 2026-11-26 — Custom items S5: an author equips and unequips a person from their panel

Slice [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`629890fd`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/629890fd).

## Shipped

- Inspector, cast section: an "Equipped" row with each equipped item by name (a link to Items), "Unequip" per item, an "Equip an item" select and "Equip"; each change is one undoable transaction (`setCreatureEquipment`) — [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203).

## Decided

- none beyond the issue — [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203).

## Found

- F1 to F7 held at `629890fd` — [Rests on comment](https://github.com/KirkDiggler/rpg-project/issues/1203#issuecomment-7189388904).
- The room draft lists placed creatures as `room.monsterDeclarations` (`RoomMonsterPlacement`, `id` per entry); the writer refuses an id absent from it — [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203).
- An emptied list removes the `equipment` key; `withBinding` then drops a binding left with no keys and keeps one that has others (the guard's faction and behaviors stay) — [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203).

## Mistaken

- none observed — [rpg-project#1203](https://github.com/KirkDiggler/rpg-project/issues/1203).

— cross-team agent, on behalf of KirkDiggler
