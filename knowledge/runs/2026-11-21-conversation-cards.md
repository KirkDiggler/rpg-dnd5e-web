# Run — 2026-11-21 — The Conversations page shows a card per line

Issue [rpg-project#1030](https://github.com/KirkDiggler/rpg-project/issues/1030), follow-up to [rpg-project#1027](https://github.com/KirkDiggler/rpg-project/issues/1027) ([rpg-dnd5e-web#1468](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1468)). Base: `rpg-dnd5e-web` `dev` at [`9fbaf87d`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/9fbaf87d). Engine read: the conversations site's read-back already pinned (`rulebooks/dnd5e/encounter` v0.232.1). Protos unchanged.

## Shipped

- **A card per line, closed by default.** The headline is what the player says. "Offered when", "On a pass", "On a miss" and "Then" are the engine's sentences at the line's path. The check sits on the card's surface as ways, each with its difficulty in a number input. A line with no check says "No check".
- **Edit opens that one line's form in place.** This is the existing line form (`OptionsEditor`), given `only={k}`. One line is open at a time, and Done closes it. Remove line stays inside the form, and the last line still asks before the conversation goes. A new line opens as soon as it is added, so its words can be written.
- **Applied to.** Each carrier is a chip with a quiet × ("Remove <name> from <conversation>"). "+ apply to…" opens a short picker grouped as Creatures, Things and Factions. Carriers already applied are not offered. Escape or Cancel closes it.
- **Labels in the opened form** sit above their fields, with space between. The list shows the conversation's name and "N carry it · M lines", no longer in monospace. "Said on their own, beside these" is a quiet section after the lines. States and outcomes is unchanged.

## Decided

- **Statements are sorted by where they stand, never by what they say.** `lineReadBackOf(readBack, linePath)` sorts each statement by its path under the line: `requires…`, `check…`, `advance`, `success…` and `failure…`. The line's own statement and its check statement sit in "How the engine reads this line". `lines[1]` never takes `lines[10]`'s statements.
- **Sentences show only while the read-back is of this draft.** While the check is behind the draft, every card says "checking…" where a sentence would be. A just-added line still shows its words from the draft. A line's index can shift after a remove, so the last compiled draft's sentence at `lines[k]` may be another line's.
- **A difficulty on a closed card is one `setLines`.** It changes only `lines[k].check[j].dc` and goes through the same writer as the form.
- **Ability words** come from `speakSkillName`, the play screen's one skill display path.

## Found

- The engine's row sentence (`line.row`) carries the whole hearing rule: who hears the answer, through which doorway, and what a watcher sees. On a closed card it is the longest text by far. A shorter row sentence would make the cards more compact, but that change belongs in the engine, not the client.
