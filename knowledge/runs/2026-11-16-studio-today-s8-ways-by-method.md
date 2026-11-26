# Run — 2026-11-16 — Studio today S8 ways by method

processed: 2026-11-25T190427Z

Slice [rpg-project#974](https://github.com/KirkDiggler/rpg-project/issues/974) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`40d34d84`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/40d34d84).

## Shipped

- A "Ways by method" panel in Places mode: one row per method with its count of ways and range of difficulties, sorted by count then name; a method row marks its joins in the list and on the map; a selected place lists the ways into it — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The places fixture re-recorded from rpg-toolkit `main` f3deb20f (encounter v0.218.1); a way's tool is now a part of its approach in the join inspector too ("Dexterity 13 with thieves-tools") — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).

## Decided

- The unit is a way as a player names it: ways through one join are one when every connection is the same with only the carrier's identity taken out (its own line read by option, a connection naming the carrier as a star); carriers are listed as who it is said to; ways with no line are each their own; sentences are never compared. The first key (bars, option, approaches, needs, on-miss) folded lines that grant or draw off different things; review caught it with a probe, now a test — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- Each approach is counted once by its `by` method; a `with` method is never a row, as the engine says (rpg-toolkit#2444) — [rpg-toolkit#2445](https://github.com/KirkDiggler/rpg-toolkit/pull/2445).
- `free` is a row like any method, since the engine says it as one; the castle's doors and floors make it the largest — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- A door or open floor is "into" both its places; a passage only into its `to`; the panel says so in one line — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The marks are a dashed outline on a list row and a heavier dashed stroke on a map mark, with a status sentence the rows point to, so the mark is not colour alone — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- A way is a statement whose kind begins `place.way.` and that goes through a join; a join one whose kind begins `place.join.`; a hub repeat of a way under any other kind is never a way, whatever it connects (the engine's contract, not its current shape) — [`7eec955b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/7eec955b).
- The engine's `free` is labelled "no check", with two sub-counts from connections (on a join with no bar needing nothing; carrying `needs`), and a total line sits above the table so rows that sum to 26 square with 23 ways — [`56b9f6ef`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/56b9f6ef).

## Found

- The castle's table, folded: free 10; Persuasion 3 (DC 11–15); Deception 2 (DC 15); Dexterity 2 (DC 13); Investigation 2 (DC 18); knowledge 2; Intimidation 1 (DC 14); Performance 1 (DC 13); Strength 1 (DC 15); the fight 1 — 23 ways from the engine's 29 statements — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The engine says no Religion way on the castle, so the checklist's "Religion shows one" cannot hold on the castle as served; Persuasion leads among the checked methods, `free` leads overall — [rpg-project#981](https://github.com/KirkDiggler/rpg-project/issues/981).
- Re-recording changed exactly two connections, the thieves'-tools methods `by` → `with` — [`ae228c0b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae228c0b).
- The full castle read-back on encounter v0.218.1 (toolkit `main` f3deb20f) has 29 statements with `{join, through}`, all of `place.way.` kinds in "The place"; no fact or topic hub repeats a way, so dev counts the gate's 11 ways as the engine says, not more — [`7eec955b`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/7eec955b).

## Mistaken

- The first grouping key named some connections instead of all but the carrier, so lines that grant or draw off different things would fold; review's probe caught it before merge — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1442#pullrequestreview-5915694790).
