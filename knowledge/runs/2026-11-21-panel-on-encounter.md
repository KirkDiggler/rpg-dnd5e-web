# Run — 2026-11-21 — no view switching S1 panel on the Encounter side

Slice [rpg-project#1067](https://github.com/KirkDiggler/rpg-project/issues/1067) of story [rpg-project#1065](https://github.com/KirkDiggler/rpg-project/issues/1065). Base: `rpg-dnd5e-web` `dev` at [`0daf4813`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/0daf4813).

## Shipped

- A placed creature or prop chosen on the Encounter side (Cast placement, any creature/prop jump) opens its Inspector beside the page; the Encounter page docks from 1048 px — [rpg-project#1067](https://github.com/KirkDiggler/rpg-project/issues/1067).

## Decided

- Two existing tests that pinned the old Build landing were rewritten to expect Encounter pressed with the inspector open, per the lead's ruling — [gap answer](https://github.com/KirkDiggler/rpg-project/issues/1067#issuecomment-7055029756).
- Test 7 (a carrier's name on Conversations) was not written because the populated fixture has no creature-carried conversation; the issue says not to build one — [rpg-project#1067](https://github.com/KirkDiggler/rpg-project/issues/1067).

## Found

- The slice issue missed two existing tests asserting the old jump landing (refusal-row jump, thread entry on a prop) — [gap](https://github.com/KirkDiggler/rpg-project/issues/1067#issuecomment-7055025434).
- "selecting the captain shows his routine from the check's read-back" failed once in a full run and passes alone, with and without this change; a one-off, not acted on — [gap](https://github.com/KirkDiggler/rpg-project/issues/1067#issuecomment-7055025434).
- The close, leave-Encounter, dock and Move tests pass before the change; each carries an Encounter-pressed assertion so it checks the new behaviour — [rpg-project#1067](https://github.com/KirkDiggler/rpg-project/issues/1067).

## Mistaken

- Ran prettier with an unsplit zsh variable, so it formatted nothing at first; caught by the explicit rerun before commit — [rpg-project#1067](https://github.com/KirkDiggler/rpg-project/issues/1067).
