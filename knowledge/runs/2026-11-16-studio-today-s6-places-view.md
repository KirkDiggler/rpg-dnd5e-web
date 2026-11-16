# Run — 2026-11-16 — studio today S6 places view

Slice [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`f7ec1869`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/f7ec1869).

## Shipped

- A Places mode of the Layout view draws every join the engine says over the regions, shaped by the bars its ways lift, with a keyboard list of joins under the rooms; protos pinned at `v0.1.281` — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- A join is a selection: its inspector gives the engine's join sentence and its ways under each bar, with method chips, needs and carrier jumps; a door's inspector links to its join — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).

## Decided

- A way belongs to the join its `{join, id, through}` connection names and sits under each bar its `{bar, id, lifts}` names; it is set apart only by the engine's kinds `place.way.partial` and `place.way.none`. A way of an unknown kind is listed by the same connections — [design R30/R31](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).
- The join selection lives beside the map selection (workspace state through `usePlacesView`), not in the document's arrange state, because a join is the engine's statement, not a document entity; selecting a join clears the map selection and any map selection clears the join — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- In Places mode the join marks draw on top, so a click at a door selects its join; the door stays selectable outside the mode and by the lock ways' door jump, and its inspector links back to the join — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- A passage with a placed prop carrier draws from the prop; the arrest, carried by a conversation with two `from` regions, draws one arrow from each — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- Bars are told apart by shape (square lock, diamond holders, dashed ring hiding, triangle for an unknown bar, plain ring for none), never colour alone; the join's accessible name says the state in words — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- The hidden bar's heading reads "To pass the hiding, any of:", by analogy with the lead's lock and holders headings — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).

## Found

- On the castle at toolkit `main` cdefe89a: 12 joins (7 door, 2 open, 3 passage) and 29 ways; bars: the gate `hold`, the kitchen and cells doors `lock`, the grate's two passages `hidden`, the rest none; no sight seam, door-within, door-edge or unjoined region — [rpg-project#981](https://github.com/KirkDiggler/rpg-project/issues/981).
- The engine says the gate's line ways once per carrier: 10 lines (gate-1 and gate-2 each vouch, straggler and troupe; the captain guest, troupe, stand-aside and turn) and the fight, 11 ways under the holders — [rpg-project#981](https://github.com/KirkDiggler/rpg-project/issues/981).
- A line way carries both `{line, carrier/line, by}` and `{creature|prop, carrier, by}`; the jump uses the creature or prop — [rpg-project#981](https://github.com/KirkDiggler/rpg-project/issues/981).

## Mistaken

- The first commit kept the list component and the hook in one file, which the lint rule for fast refresh refuses; split before the PR — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
- The first method-chip label split method ids on `:` by hand; `refs.guard.test.ts` refused it, and the tool's ref now goes through `refId` — [rpg-project#972](https://github.com/KirkDiggler/rpg-project/issues/972).
