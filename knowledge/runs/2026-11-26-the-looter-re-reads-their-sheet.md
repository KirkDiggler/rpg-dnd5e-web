# Run — 2026-11-26 — The looter re-reads their sheet

Slice [rpg-project#1174](https://github.com/KirkDiggler/rpg-project/issues/1174) of story [rpg-project#850](https://github.com/KirkDiggler/rpg-project/issues/850). Base: `rpg-dnd5e-web` `dev` at `bbb2cd62`.

## Shipped

- A `loot` act by the viewer answers `['characterData']` in `refreshKeysForAct`; by anyone else `[]` — [rpg-project#1174](https://github.com/KirkDiggler/rpg-project/issues/1174).
- One sentence in the `handleLoot` comment saying an equipped item lands on the looter's sheet, re-read on their own `loot` act — [rpg-project#1174](https://github.com/KirkDiggler/rpg-project/issues/1174).

## Decided

- The key is returned for every loot by the viewer, whatever the body held, so a loot looks the same whether or not the body had anything — [rpg-project#1174](https://github.com/KirkDiggler/rpg-project/issues/1174).

## Found

- F1 to F4 held at `origin/dev` `bbb2cd62`; `LootAct.by` is a `Party` with `.id`; the funnel adds `turn` and `afford` at `SessionEncounterView.tsx:1484` — [Rests on comment](https://github.com/KirkDiggler/rpg-project/issues/1174#issuecomment-7175287218).
- Returning `[]` again failed the new "own loot" row; restored.

— cross-team agent, on behalf of KirkDiggler
