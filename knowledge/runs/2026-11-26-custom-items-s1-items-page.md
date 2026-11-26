# Run — 2026-11-26 — Custom items S1 Items page

Slice [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`ea623f57`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ea623f57).

## Shipped

- Encounter → Pieces → Items lists the site's custom items with the engine's sentence, the item as written and who has it equipped; an item link in a read-back and a refusal at `customItems.<id>` open it — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).

## Decided

- An item with no engine answer is still listed, with the one line "The engine has not said the items yet." — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).
- The Layout list-detail pin in the integration test gains `Items` beside Behaviours, since Items joins `LIST_DETAIL_SECTIONS` — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).
- The `customItems` refusal-path test lives in `engineReadBack.test.ts`, which already reads a file through `readDraftYaml`; `refusalJump.test.ts` runs in the node environment and the file reader needs a window — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).
- `placeName.ts` names an item's place as ``item `<id>` `` then the place inside it, as `table` and `bundle` are, by the lead's ruling — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).

## Found

- A person's equipment sentence is folded into their line, so its item links show only after "Full sentences" is opened on that line — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).
- `placeName.ts` holds an exhaustive switch over `LocatedKind`, a file the issue's Path did not list; reported as a gap and ruled — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).

## Mistaken

- The first draft of the tests typed a curly apostrophe for "Lieutenant's cloak"; the file holds a straight one, and the tests failed until corrected — [rpg-project#1196](https://github.com/KirkDiggler/rpg-project/issues/1196).
