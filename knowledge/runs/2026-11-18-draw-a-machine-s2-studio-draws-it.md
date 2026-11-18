# Run — 2026-11-18 — Draw a machine S2 the studio draws it

Slice [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995) of story [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993). Base: `rpg-dnd5e-web` `dev` at [`5d276f93`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/5d276f93).

## Shipped

- `machineView.ts` reads a routine's machine from the read-back's shape connections alone (`starts`, `is`, `final`, `from`, `to`, `on`, `picks`, `while`) and gives no machine when the shape is missing or does not hold together — [rpg-dnd5e-web#1450](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1450).
- `machineLayout.ts` lays a machine out in two rows with lanes, and `MachineDrawing.tsx` draws it above the Behaviours list; a box or arrow marks and puts its sentences first in the detail pane, and a sentence's "On the drawing" marks its box or arrow — [rpg-dnd5e-web#1450](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1450).

## Decided

- Two rows: the start and every state that can return to it on top, every other state below in step order, sinks last; so every arrow joins neighbouring rows or runs within one, and no stroke crosses a box — [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995).
- A shared step is gathered by beat, target and the ids its guard `wakes-on`, and split by row: the top row's states leave by one bracket, a lower-row state by its own arrow, as the agreed mock draws "the garrison turned" — [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993).
- Arrow and box words are connection ids and role words (`on fact: guards-turned`, `on time: picks post`, `gate-1: holds door gate-wall-door`), never a sentence's quoted reason, because the reason is only in the sentence — [rpg-project#994](https://github.com/KirkDiggler/rpg-project/issues/994).
- "final" is marked only from the engine's `final` connection; "no way out" is read from the graph (no step leaves the state) and said only in a machine of more than one state, so the castle's `turned` carries it and no single-state machine does — [rpg-dnd5e-web#1450](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1450).
- Marked sentences show as a group at the top of the existing Read back, not a new pane, so the detail stays where it is — [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995).

## Found

- The released engine (encounter v0.220.0) says the shape exactly as the contract states, so the reader needed no change; its `fact.ask` / `topic.ask` repeats carry `from`, `to` and `on` too, which is why the machine reads only the routine's own kinds under its own path — [rpg-dnd5e-web#1450](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1450).
- The castle's largest machine (`gate-1-policy`) lays out at 925 × 460 px; every castle machine is at most 1100 px wide with no box or label overlapping — [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995).
- `world-building/bundles.test.ts` "a bundle that uses itself" overflows the stack on this machine (Node 24) on clean `dev` too, while `dev` CI is green — [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995).

## Mistaken

- The first row order followed the breadth-first walk, which put `challenged` before `alert` and broke the straight `posted → alert` arrow; the row now sorts by distance, then the engine's order — [rpg-project#995](https://github.com/KirkDiggler/rpg-project/issues/995).
