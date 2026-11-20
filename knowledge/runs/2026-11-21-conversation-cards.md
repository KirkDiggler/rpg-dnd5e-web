# Run — 2026-11-21 — The Conversations page shows a card per line

Issue [rpg-project#1030](https://github.com/KirkDiggler/rpg-project/issues/1030), follow-up to [rpg-project#1027](https://github.com/KirkDiggler/rpg-project/issues/1027) ([rpg-dnd5e-web#1468](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1468)). Base: `rpg-dnd5e-web` `dev` at [`9fbaf87d`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/9fbaf87d). Engine read: the conversations site's read-back (`rulebooks/dnd5e/encounter` v0.232.1), plus the castle's conversations: `readback.Of` at v0.234.0 on rpg-api `dev` cf3b4125's `the-mad-king.yaml`, trimmed to `conversations.*` paths. Protos unchanged.

## Shipped

- **A card per line, closed by default, a few lines tall.** The headline is what the player says.
  - "Offered when" gives one short clause per distinct requirement: "knows `feast-tonight`", "`front-gate` is `fresh` or `warned-guest`".
  - The check sits on the surface: "Check, best of Performance [13] or Deception [15]". A line with no check says "No check".
  - "On a pass" and "On a miss" each show the listener's words in quotes, then chips for what follows: "advances `front-gate`: `admitted`", "teaches `refused-arrest`", "shouted".
  - Each clause and chip carries its statement's full sentence as a tooltip. All the line's sentences are in "The engine's words", a disclosure on the card.
- **A carrier's own lines are the same cards** (operator, the same day: he could not find the captain's "invited guests" claim). Under the conversation's cards, a heading per carrier ("Only Guard Captain offers") holds that carrier's own lines as closed cards, each difficulty on the surface. Edit opens the carrier's form for that one line. A write goes at the carrier's own `…options[i]` through the new `sharedLines.setOwnLine` (`editCarrierLine`), never at the conversation. This replaces the quote-and-link list under "Said on their own, beside these".
- **Edit opens that one line's form in place.** This is the existing line form (`OptionsEditor`), given `only={k}`. One line is open at a time, and Done closes it. Remove line stays inside the form, and the last line still asks before the conversation goes. A new line opens as soon as it is added, so its words can be written.
- **Applied to.** Each carrier is a chip with a quiet × ("Remove <name> from <conversation>"). "+ apply to…" opens a short picker grouped as Creatures, Things and Factions. Carriers already applied are not offered. Escape or Cancel closes it.
- **Labels in the opened form** sit above their fields, with space between. The list shows the conversation's name and "N carry it · M lines", no longer in monospace. "Said on their own, beside these" is a quiet section after the lines. States and outcomes is unchanged.

## Decided

- **The face is built from the engine's structure, not its sentences** (lead's look at the castle, second pass). The first pass printed the sentences. The troupe card then showed six "Offered when" sentences and a speech-range paragraph under each answer. `lineFace.ts` now builds each clause and chip the way the machine drawing does, from each statement's connections (role, kind, id). Where a connection names a thing but not its value, the card reads the value from the draft at the engine's path: a conversation's asked states (`<requires[k]>.interaction.in`), a step's beat (`<advance>.success`/`.failure`), a row's loudness, and whether a fact or prop is asked under `not`.
- **A card keeps only its owner's statements.** For a carrier's own line, that is the statements about the carrier.
- **Only statements about the conversation are the line's.** At the same `conversations.<id>.lines[k]…` paths, the engine also sets a `place.way.line` per carrier, a `fact.ask` hub statement, and a `conversation.asked` per carrier. Those belong to their own subjects, so `lineReadBackOf` keeps only statements whose `about` is `{shared-lines, <id>}`. Exact duplicate clauses are dropped.
- **An unknown connection is counted, never dropped.** It shows as "+N more", which opens the engine's words. This is the drawing's "also:" policy.

- **Statements are sorted by where they stand, never by what they say.** `lineReadBackOf(readBack, linePath)` sorts each statement by its path under the line: `requires…`, `check…`, `advance`, `success…` and `failure…`. The line's own statement and its check statement sit in "How the engine reads this line". `lines[1]` never takes `lines[10]`'s statements.
- **Sentences show only while the read-back is of this draft.** While the check is behind the draft, every card says "checking…" where a sentence would be. A just-added line still shows its words from the draft. A line's index can shift after a remove, so the last compiled draft's sentence at `lines[k]` may be another line's.
- **A difficulty on a closed card is one `setLines`.** It changes only `lines[k].check[j].dc` and goes through the same writer as the form.
- **Ability words** come from `speakSkillName`, the play screen's one skill display path.

## Found

- The engine marks a negated topic ask with `not`/`negated`, but not a negated fact or prop ask (`triggerWords`, `TriggerNot`). Its connection is the same as the positive one. The card reads `<requires[k]>.not` from the draft to tell them apart. An engine `negated` on those connections would make that read unnecessary.
- The Go read-back's JSON spells a connection's flag `not`, and the proto spells it `negated`. A fixture taken from `json.Marshal` must rename it, as the api does.
- In jsdom, `StudioListDetail` stacks only through `matchMedia`, so a static render never stacks. The narrow check set `data-stacked` by hand.

- The engine's row sentence (`line.row`) carries the whole hearing rule, so it now lives in the tooltip and the details, not on the card.
