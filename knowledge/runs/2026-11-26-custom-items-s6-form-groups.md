# Run — 2026-11-26 — custom items S6 form groups

Slice [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`629890fd`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/629890fd).

## Shipped

- The item form's groups are boxed, each list entry holds its Remove, a true-or-false box precedes its text, and the Change block's buttons sit in one row with Delete item at the far end — [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205).

## Decided

- Delete item is the last child of the same actions row as Save and Discard, and the row renders whenever either exists, so a block with no form still shows Delete in a row — [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205).
- Each field is wrapped in `es-words-field`; a field that draws nothing leaves an empty wrapper that the stylesheet hides, so it adds no gap — [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205).

## Found

- The Save and Discard buttons were separated by a text space and the warning line was inside a fragment with Delete; both are now direct children of the new wrappers — [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205).

## Mistaken

- none observed — [rpg-project#1205](https://github.com/KirkDiggler/rpg-project/issues/1205).

— cross-team agent, on behalf of KirkDiggler
