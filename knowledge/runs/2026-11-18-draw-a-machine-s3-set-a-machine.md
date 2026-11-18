# Run — 2026-11-18 — draw a machine S3 set a machine

Slice [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996) of story [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993). Base: `rpg-dnd5e-web` `dev` at [`b051e418`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b051e418).

## Shipped

- A marked state's box opens the Behaviours detail pane on Read back and Edit; Edit sets the state's steps (`on`, `to`, one `pick`, `reason`, Remove, Add a step) and adds a state — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- "List" on a step opens a focus-trapped pop-up of that list's rows, edited with the Bundles page's `AnswerEntryRow`/`EntryList`, where a new list can be made and is then offered on every step — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- `machineEdit.ts` pure helpers and `commitBehaviorDefinition`, one undoable commit of the whole definition through `commitRoomDocument` — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- `STATE_BEATS` gains `turn` and `approached`, with a note that it is the studio's copy until the engine publishes its words — [rpg-project#997](https://github.com/KirkDiggler/rpg-project/issues/997).

## Decided

- The session method sets one definition whole (`commitBehaviorDefinition(id, definition)`), not one method per edit, because the outcome cards set their interaction's outcomes whole the same way and every edit here is a pure definition-to-definition function — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- A step's first `pick` act is the one the form edits; a step with none gains its pick first in `do`; a second pick is kept as written, because the engine refuses two picks and the form never makes one — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- A key a step lacks (`to`, `do`, `reason`) is inserted at its hand-written place (`on, when, to, do, reason`), so a new `to` reads as an author would write it — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- A beat, state or list the file writes that the dropdown does not know is offered first as written, never dropped — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- The pick dropdown offers every list on every beat; the engine's "pick only on time, turn, barred, approached" stays the engine's refusal, because this slice builds no new refusal routing — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- The pop-up is a small studio dialog (role dialog, aria-modal, Tab cycles inside, Escape closes, focus returns) rendered in place, not `components/ui/Modal`, which neither traps focus nor wears the studio's panel style — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- A `use:` row in the pop-up is the Bundles row editor's own use line, marked "shared bundle" with "Open in Bundles" (the existing home-section jump); its inner rows are not edited here — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- A kept condition or act is said with the engine's sentence at the step's path only while the read-back is current, because a removed step renumbers the paths until the engine checks again — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).

## Found

- The yaml splice writes a single-field step edit on the castle back as exactly one changed line, and removing a step as exactly its own lines; the helper tests pin those diffs — [rpg-project#996](https://github.com/KirkDiggler/rpg-project/issues/996).
- `STATE_BEATS` lacked `turn` and `approached`, both used in every castle state and both in the toolkit's `encounter.MachineBeats` — [rpg-project#997](https://github.com/KirkDiggler/rpg-project/issues/997).

## Mistaken

- none observed
