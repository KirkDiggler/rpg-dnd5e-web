# Run — 2026-11-19 — Draw a machine S5 plain words and exact conditions

Slice [rpg-project#1015](https://github.com/KirkDiggler/rpg-project/issues/1015) of story [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993). Base: `rpg-dnd5e-web` `dev` at [`84789fe2`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/84789fe2).

## Shipped

- `@kirkdiggler/rpg-api-protos` is pinned to v0.1.282, and the lock file resolves to `b1b1d65c`. No other call site broke — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- `useMachineWords` asks `GetMachineWords` once per client while the server is live. It keeps a ready answer for the session, keeps no failure, and exports the table typed as `MachineWords` — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- `machineView` reads a step's `condition` connections (`id`, `is`, `op`, `negated`, `at`), says each once, and orders them by `at`. The grouping key carries the whole ordered condition — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- Arrow and box labels use the engine's words (`machineWords.ts`), and with no words or no condition connections they fall back to the ids — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- Tests run over a `GetMachineWords` answer and a castle read-back recorded at encounter v0.225.0 — [353130b1](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/353130b1).

## Decided

- A step's condition is said from `at`, not from `negated`. Leaves at one place, and `all`, are joined by the `all` word's `join` (" and "); `any` by its own (", or "). A part made of several is put in parentheses — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- A negated leaf reads its `label_not` where the table has one. Otherwise it is the engine's word `not` around the plain label, `not (it was a voice)`, which is how the read-back's sentence says it ("NOT (…)"). A bool asked `false` is its own negation — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- The beat comes first, then " · ", then the condition. The " · " is a separator, not a connective. A staying step's lists are joined to it the same way — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- A beat's `label_with` is filled from the step's one `wakes-on` read of the beat's own kind. The one positive condition asking that same thing (`fact:guards-turned` true on a `fact` beat) is then not said again, but it stays in the grouping key — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- When a step has condition connections, its `wakes-on`, `{claim, …, asks}` and `{topic, …, asks}` reads are not said as well, because the conditions say them. Reads the drawing does not know are still said and still keyed — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- Without words, conditions are listed flat in their ids, with the comparison and value as the engine spells them (`within lte 6`, `not (heard.kind voice)`). No joins are invented for them — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- The v0.225.0 read-back is a second fixture beside the v0.220.0 one, not a replacement. The older one is the shape of an engine with no condition connections, which the fallback test and the watch's tests use — [353130b1](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/353130b1).
- The watch's drawings take the session's already-asked words by default (`machinesRunBy`'s new third argument). `StudioWatch*.tsx` belongs to another slice and was not changed — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).

## Found

- At v0.225.0 the castle has no `{claim, …, asks}` connections. The heard claim arrives only as a `heard.claim` condition, and its 21 `routine.wake` statements with a condition carry 24 condition connections (43 with the hub repeats) — [rpg-project#1001 hand-off](https://github.com/KirkDiggler/rpg-project/issues/1001#issuecomment-7003637122).
- Plain words make the castle's boxes and arrows about twice as wide. Before the layout changes, captain-policy laid out 1565 wide and gate-1-policy 1130, against the studio's 1100 — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- Three layout changes bring every machine back under 1100 with every castle label drawn whole: a box whose line would be cut puts its lists on indented lines of their own; an arrow wider than any gap takes a lane; the top channel's outermost lane, which no other stroke crosses, holds the longest words — [80658144](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/80658144).
- `heard.kind`, `heard.claim` and `enemy` have no `label_not`, so a `not` over them reads "not (it was a voice)". `rounds` reads "at least 3 rounds since it marked the moment", which is long for an arrow — [rpg-project#1001](https://github.com/KirkDiggler/rpg-project/issues/1001).

## Mistaken

- A test's `.map(stayLabel)` passed the array index as the new `words` argument and crashed. The test now calls it with the step alone — [353130b1](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/353130b1).
