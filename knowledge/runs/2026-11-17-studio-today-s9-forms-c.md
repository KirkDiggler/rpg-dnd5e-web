# Run — 2026-11-17 — studio today S9 forms (C): a conversation's arrest and jail

processed: 2026-11-25T190427Z

Slice [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966), PR C of four, stacked on PR B (branch `studio-forms-line-wiring`).

Shapes read from rpg-toolkit `origin/main` [`bb5806f7`](https://github.com/KirkDiggler/rpg-toolkit/commit/bb5806f7):

- `dungeonspec/spec.go`: `OutcomeSpec`, `ArrestSpec`, `ArrestAreaSpec`, `JailSpec`
- `dungeonspec/interactions.go`: `outcomesOf`, `arrestOf`, `kinds`
- `encounter/interaction.go` and `encounter/arrest.go`: `validateOutcomes`, `validateArrestShape`, `validateArrests`

## Shipped

- **One kind per outcome entry.** "This state" is one select: Recognises, Arrests or Jails. Changing it replaces the entry whole. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **Arrest form.** "Held in" is the relocation's Region field, writing `arrest.cell`. "Seized in" has a checkbox per region (`area.regions`), plus the count of seized cells and **Pick on map** (`area.cells`). — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **Jail form.** It uses the relocation's Words and Rounds fields, plus "Fact when they escape" (`jail.escaped`). — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **Recognition outcome as fields.** It now uses the same `RecognitionFields` as a line's row grant. The sentences it used to write ("the creature the line was said to recognises …") are gone, and so are the JSON read-outs for arrest and jail. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **A `cells` mode for Pick on map.** Each click adds or removes a cell; the picked cells are drawn as plain discs with no legs and no numbers. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **Reveal and place names.** Every outcome registers for reveal at `interactions.<id>.outcomes.<state>[i]`, and `placeName` reads "conversation `front-gate` · on entering `arrested` · arrest". — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)

## Decided

- **What R33 can share, given the decoder's shapes.** The relocation splits into `RegionField`, `WordsField` and `RoundsField`, and each outcome uses only the parts it truly shares:
  - A jail's words and rounds are the relocation's. A jail names no region: it moves the taken into the arrest's cell.
  - An arrest's cell is the relocation's region. An arrest has no words and no rounds of its own.
  - The file's shape is not bent to fit the form. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **What the form prevents by construction.** Each matches an engine refusal:
  - one kind per entry;
  - Jails is offered only when the conversation has another entry that is an arrest ("a jail takes the taken of the interaction's own arrest");
  - the last place an arrest seizes in cannot be taken away, and a pick that would leave the area empty writes nothing ("an area names its regions or its cells");
  - states are offered from the recipe.

  — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)

- **Defaults and ordering.**
  - A new arrest is held in, and seizes in, the site's first region.
  - A new jail starts with empty words; the engine's refusal shows until they are written.
  - A state not yet in `outcomes` is inserted in the recipe's order.
  - Seized regions are written in the site's region order.

  — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)

- After review: the only arrest of a conversation that jails is held (Remove and kind disabled, with the reason as the title); the add control falls back from Jails when nothing arrests; a cells pick ignores off-floor clicks (the map's floor; the engine's launch-only refusal of an off-floor area cell is noted on [rpg-toolkit#2449](https://github.com/KirkDiggler/rpg-toolkit/issues/2449)); Seized in keeps the authored region order; anything the form cannot fully read is shown as written. A new jail's empty words remain a refusal on purpose: the form does not invent the words — [rpg-dnd5e-web#1448 review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1448).

## Found

- **`sceneMove` is a fourth consequence kind.** It is in `OutcomeSpec` but is not one of the slice's words, so an entry of it stays shown as written. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
- **The arrest carries no message.** The slice's checklist reads "an arrest … is offered as a relocation with a message". In the decoder, the message is the jail's `words`. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)

## Mistaken

- Done picking cells from Conversations wrote nothing on the real studio: the section unmounted when the pick switched to Build, and its `onDone` held a commit the switch had retired. The round-trip test called `onDone` on a fake session with no fence, so it could not see it. Conversations now stays mounted, hidden, and writes through `useLatest`; a workspace test picks on the real Layout — [rpg-dnd5e-web#1448 review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1448).
- An arrest with no `area` crashed the section; the only arrest could be removed while a jail remained; ticking a region rewrote the list in site order — [rpg-dnd5e-web#1448 review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1448).
- **The wrong first region.** The first expected YAML assumed the castle's first region was `region-courtyard`; it is `room-1-region`. — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975)
