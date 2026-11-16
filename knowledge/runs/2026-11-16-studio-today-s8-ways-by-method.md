# Run — 2026-11-16 — Studio today S8 ways by method

Slice [rpg-project#974](https://github.com/KirkDiggler/rpg-project/issues/974) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`40d34d84`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/40d34d84).

## Shipped

- A "Ways by method" panel in Places mode: one row per method with its count of ways and range of difficulties, sorted by count then name; a method row marks its joins in the list and on the map; a selected place lists the ways into it — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The places fixture re-recorded from rpg-toolkit `main` f3deb20f (encounter v0.218.1); a way's tool is now a part of its approach in the join inspector too ("Dexterity 13 with thieves-tools") — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).

## Decided

- The unit is a way as a player names it: ways with the same join, bars, line option id, approaches (methods, difficulties, parts) and the same `needs` and `on-miss` connections are one, and their carriers are listed as who it is said to; ways with no line are each their own. Sentences are never compared. Including `needs`/`on-miss` keeps two same-named lines apart when they ask or cost different things — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- Each approach is counted once by its `by` method; a `with` method is never a row, as the engine says (rpg-toolkit#2444) — [rpg-toolkit#2445](https://github.com/KirkDiggler/rpg-toolkit/pull/2445).
- `free` is a row like any method, since the engine says it as one; the castle's doors and floors make it the largest — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- A door or open floor is "into" both its places; a passage only into its `to`; the panel says so in one line — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The marks are a dashed outline on a list row and a heavier dashed stroke on a map mark, with a status sentence the rows point to, so the mark is not colour alone — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).

## Found

- The castle's table, folded: free 10; Persuasion 3 (DC 11–15); Deception 2 (DC 15); Dexterity 2 (DC 13); Investigation 2 (DC 18); knowledge 2; Intimidation 1 (DC 14); Performance 1 (DC 13); Strength 1 (DC 15); the fight 1 — 23 ways from the engine's 29 statements — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The engine says no Religion way on the castle, so the checklist's "Religion shows one" cannot hold on the castle as served; Persuasion leads among the checked methods, `free` leads overall — [rpg-project#981](https://github.com/KirkDiggler/rpg-project/issues/981).
- Re-recording changed exactly two connections, the thieves'-tools methods `by` → `with` — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).

## Mistaken

- none observed
