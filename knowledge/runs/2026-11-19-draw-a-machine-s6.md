# Run — 2026-11-19 — Draw a machine S6 the editor speaks the engine's words

Slice [rpg-project#1018](https://github.com/KirkDiggler/rpg-project/issues/1018) of story [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993). Base: `rpg-dnd5e-web` `dev` at [`b991d719`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b991d719).

## Shipped

- "What fires it" lists the engine's beats by label, an open beat (`deed:`, `clock:`) offers its part, an authored beat the table lacks is kept — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A flat condition is edited row by row (word allowed on the beat, inputs from `args`, not, remove, add); a nested one is kept as written with a note — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A step's other acts are added, edited and removed in order from the act words; unknown acts are kept — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A refused step marks its row (and the condition or act it names), its arrow or box, with a visible "refused" mark that opens the row in Edit — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).

## Decided

- After the lead's look at `e0100f9a`: each step is a card headed by its number, its drawn line in the engine's words (`→ <state>` for a moving step) and "Remove step"; "+ condition" / "+ act" sit inline and rows open only for what the step has; the no-flags note is said only on a flag act's row; marking an arrow (or a staying step's sentence) opens Edit on that step's state at its card, revealed — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).

- Every input is placed by the arg's `goes` (`open`, `value`, `field`, `implied`) and typed by `kind` / `kind_of`; the only words the web knows are the guard tree's `all` / `any` / `not` and the `pick` that "Does one of" already edits — [stepWords.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A leaf spelled by its key alone (`scope`, `rounds`, `flag`) is the one candidate whose field args the node holds and nothing else; a `scope` with both `within` and `regions` matches neither and is kept as written — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- The "not" toggle wraps the leaf in `not` and is offered wherever the table has the `not` word, not only where a word has a `label_not` — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A one-node `when` stays one node until a second is added (then `all`); an authored `all` stays `all`; the last condition removed removes `when` — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- Things an input names: states, lists and flags are closed selects; facts, topics and clocks are free text with the read-back's connected ids as suggestions — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- With no words the editor keeps `STATE_BEATS` as its fallback list; the constant's other user is the states dialect parser in `world-building/creatureStates.ts` — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A refused edit stays committed, as before; the drawing is the last read-back that compiled, so a refusal of a step it does not draw marks its state's box — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).

- From the review of `86062dc8`: a refused step marks its arrow only while the drawn step at that path has the document's beat and target, else its state's box; step marks wait while a check is out; a number input commits only a whole number; a `set` whose flag changes takes that flag's starting value; one condition is written bare unless the file wrote `all` of one and the count is unchanged — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463#pullrequestreview-5975560358).

## Found

- Beat words carry `written.part = on` and their open part's arg says `goes: open` with no `field`; the beat's own spelling is `on`'s value, which the arg contract does not name — [proto v0.1.282 MachineWritten](https://github.com/KirkDiggler/rpg-api-protos/blob/v0.1.282/dnd5e/api/authoring/v1alpha1/service.proto).
- `flag:` is an open word whose id arg `goes: value` (`flag: <id>`), not `open`, so its condition id `flag:<id>` is not where its word is written — [recorded words v0.225.0](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
- A label template for a dropdown has no slot-free form for open words (`{id} is done`); the editor shows the slot as "…" — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).

## Mistaken

- The refusal marks matched the last compiled drawing by step index alone, so after removing an earlier step the wrong arrow was marked; no test removed a step before refusing one; the reviewer's probe is now a test (mutant fails) — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463#pullrequestreview-5975560358).

- The first cut repeated "This machine declares no flags" under every step and made each step three rows tall, so the pane showed two steps; seen on the live stack by the lead, not by a test — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).

- A new node's first draft filled every input from the document's first choice, so a fact's bool `value` took a fact name and wrote `false`; only an input that names a thing takes a choice now, and a test pins it — [rpg-dnd5e-web#1463](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1463).
