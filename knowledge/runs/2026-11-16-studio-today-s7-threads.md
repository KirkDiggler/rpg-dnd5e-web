# Run — 2026-11-16 — studio today S7 threads

Slice [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`40d34d84`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/40d34d84).

## Shipped

- The Encounter side's Facts section is Threads: every fact and topic the engine says, with counts from its own entries and a mark for taught-never-asked or asked-never-taught; a hub opens to its thread, the Read back of that hub — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- A fact or topic connection in the Read back or the join inspector opens that hub's thread — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- `world-building/factIndex.ts` and `StudioFacts` are retired — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).

## Decided

- A thread is the existing Read back with a hub as its selection: the fold says the thread in the engine's own headings ("Taught by:", "Granted by:", "Asked by:", "Wakes:"), so the studio adds no heading; Full is the hub's group in the engine's order with every entry's path a jump — [design R25/R32](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).
- The row counts and mark are a presence check over the hub group's entries by kind (`fact.teach`/`topic.grant` against `fact.ask`/`topic.ask`); the engine's own count sentence heads the thread — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- Records and concealments first had no thread: the engine had no hub group for them and their statements carried no connection to what they reveal or hide. The engine added both (rpg-toolkit#2447, encounter v0.219.0), and they now list and read like facts — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- Hub sections are every section from "Topics" on, because the wire has no marker of its own for a hub section and the engine puts them last; an unknown later hub section lists with counts only — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- Marks per hub kind, each a presence check over the engine's entry kinds: a fact taught and never asked (or the reverse), a topic granted and never asked (or the reverse), a record with no `record.hold` and no `record.tell`, a secret with no `secret.reveal`; other hub kinds show counts only — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- A `{record|concealment, id}` connection opens that hub's thread, not Intel or Concealments; the thread links to its editing home. A `{way, id, is}` pointer opens the way's join, found by the way statement's own `through`; the pointer is never itself a way — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The draft-derived fact index retires — the operator ruled "live facts can wait for a compile, at least for now it is ok" (recorded on rpg-project#973); with a stale read-back Threads shows the last compiled hubs with the stale notice, as the Read back does under R25 — [design R25](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).

- A thing with a group of its own (a creature, a routine, a hub) is said by that group alone; a hub's site statement (`place.intel`, `place.concealment`) stays the place's — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1441#pullrequestreview-5915719891).
- Record and secret rows say their counts in the fold's words ("told by 1, lifts 2"); "no record reveals it" is a neutral note, since a secret found only by search is normal; links from a hub's thread to the hub itself are dropped; the edit link goes through the path map to the hub's own form; a way pointer the studio cannot open is text — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1441#pullrequestreview-5915719891).

## Found

- The castle's read-back at toolkit `main` cdefe89a has 5 topic and 16 fact hub groups; each begins with a statement of kind `fact`/`topic` that says its counts ("It is taught in 3 places and asked for or woken on in 1 place"); `king-in-throne-room`, `king-is-cultist`, `loyalists-yielded`, `sergeant-holds-keys` and the topic `jailed` are taught or granted and never asked — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The statement about the record `kitchen-way` ("whoever comes to hold it learns the secret `kitchen-passage`") and the one about the concealment `kitchen-passage` ("hides the prop Grate by the Hearth (grate)") carry no connections; the record and the concealment are linked only by both appearing as `by` on the two `place.way.told` statements — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).

- A secret's `secret.bar` entries (the joins it hides) carry no `{join, id}` connection, only the passage's regions and prop; their path is the grate's relocate row, so their jump selects the grate. The joins are reached through the `secret.need` way pointers — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- On the castle at toolkit `main` bb5806f7 the hub sections are Topics 5, Facts 16, Records 5, Secrets 1 — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).

## Mistaken

- The first commit kept the hub helpers in the component file, which the fast-refresh lint rule refuses; split before the PR — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The first chain jump to a join called the map's clear-selection from the Encounter home, where it is refused, so the join did not take the inspector; the join is now selected once Build is the home — [rpg-project#973](https://github.com/KirkDiggler/rpg-project/issues/973).
- The first chain test emptied `folded` and so walked only the Full view; a hub selection took the site group's statement about the hub too, which in the default Folded view showed "Said in full only" repeating the hub's own sentence. The chain test now runs the engine's real fold and asserts each disclosure's state — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1441#pullrequestreview-5915719891).
