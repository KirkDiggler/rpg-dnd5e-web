# Run — 2026-11-16 — studio today S7 threads

Slice [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`40d34d84`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/40d34d84).

## Shipped

- The Encounter side's Facts section is Threads: every fact and topic the engine says, with counts from its own entries and a mark for taught-never-asked or asked-never-taught; a hub opens to its thread, the Read back of that hub — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- A fact or topic connection in the Read back or the join inspector opens that hub's thread — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- `world-building/factIndex.ts` and `StudioFacts` are retired — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).

## Decided

- A thread is the existing Read back with a hub as its selection: the fold says the thread in the engine's own headings ("Taught by:", "Granted by:", "Asked by:", "Wakes:"), so the studio adds no heading; Full is the hub's group in the engine's order with every entry's path a jump — [design R25/R32](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).
- The row counts and mark are a presence check over the hub group's entries by kind (`fact.teach`/`topic.grant` against `fact.ask`/`topic.ask`); the engine's own count sentence heads the thread — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- Records and concealments get no thread in this slice: the engine has no hub group for them, and the statements about them carry no connection to what they reveal or hide, so a thread would need the studio to chase and infer across statements — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The draft-derived fact index retires; with a stale read-back Threads shows the last compiled hubs with the stale notice, as the Read back does under R25 — [design R25](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).

## Found

- The castle's read-back at toolkit `main` cdefe89a has 5 topic and 16 fact hub groups; each begins with a statement of kind `fact`/`topic` that says its counts ("It is taught in 3 places and asked for or woken on in 1 place"); `king-in-throne-room`, `king-is-cultist`, `loyalists-yielded`, `sergeant-holds-keys` and the topic `jailed` are taught or granted and never asked — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The statement about the record `kitchen-way` ("whoever comes to hold it learns the secret `kitchen-passage`") and the one about the concealment `kitchen-passage` ("hides the prop Grate by the Hearth (grate)") carry no connections; the record and the concealment are linked only by both appearing as `by` on the two `place.way.told` statements — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).

## Mistaken

- The first commit kept the hub helpers in the component file, which the fast-refresh lint rule refuses; split before the PR — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
