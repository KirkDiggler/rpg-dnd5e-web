# Run — 2026-11-26 — Custom items S3 item form

Slice [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`2ba2134a`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/2ba2134a).

## Shipped

- On Items, the selected item has a Change form drawn from the engine's `GetItemWords` table; Save writes the item as one undoable change, Discard resets the draft — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- The engine's refusals at `customItems.<id>` show on the item; with no item words the page says so and draws no form — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).

## Decided

- The form's pure half (`wordsForm.ts`) and its component (`WordsForm.tsx`) import nothing from the protos package, so a status table can use them later — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- A `list of` word is drawn as a group of checkboxes with the label's text before and after the group; the group's accessible name is the label with `{value}` removed — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- A `one of` word whose written value is not among the table's values keeps that value as an extra option, so the form never hides what the file says — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- A text word cleared to empty removes its key when the word is not required, else writes the empty string — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- Draft equality for Save and Discard ignores key order, so removing and re-adding a key does not leave Save enabled — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- No CSS was added: fieldsets, labels and inputs take the studio's existing element styles — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).

## Found

- `commitBehaviorDefinition` has no test through the real `WorldBuildingConcept`; `commitCustomItem` is covered by `itemEdit.test.ts` and by the Items integration test through the real owner (Save writes, one Undo restores) — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
- The real owner is given item words in a test by spying `authoringClient.getItemWords`; the answer is kept per client for the file, so the test without words runs before the test with them — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).

## Mistaken

- none observed — [rpg-project#1201](https://github.com/KirkDiggler/rpg-project/issues/1201).
