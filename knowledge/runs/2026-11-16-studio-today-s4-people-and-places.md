# Run — 2026-11-16 — studio today S4 people and places

processed: 2026-11-25T190427Z

Slice [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`ae7f2a15`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae7f2a15).

## Shipped

- The Encounter side is four groups as ruled — People (Cast, Sides, Party, Conversations), Places (Secrets, Ways out), What is known (Records, Threads), Pieces (Behaviours, Bundles) — opening on People → Cast; Tables and Scenarios have no section — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Behaviours lists every behaviour the engine's read-back says, with its fold and who runs it; a creature's inspector picks one the file defines — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- No control writes a faction's or a creature's `table`, `on` or `states`; a form that still carries one says so in one line — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).

- The Encounter side's two rows are tab bars (rpg-project#982): the groups a primary bar, the chosen group's sections a secondary bar attached under it, the section's panel attached under that — [rpg-project#982](https://github.com/KirkDiggler/rpg-project/issues/982).

## Decided

- Section keys stay as they were (`factions`, `intel`, `concealments`, `endings`, `interactions`, `facts`) and only the screen's words change, so every jump keeps landing; `dispositions` is shown inside Sides, and a new key `behaviours` is added — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Sides puts the factions first and their dispositions under them, because how the sides stand is read after who they are — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Who runs a behaviour is the engine's `{creature, id, runs}` connections on the routine's own statement, as said; a creature whose faction supplies its behaviour is listed when and as the engine says it runs it, and the studio infers no runner — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The picker writes `behaviors: [{ id, use }]` (the id the creature already used, else `policy`) and `behaviorState` set to that id; never `with` or `items`, which the engine refuses on a concrete definition. A concrete (`recipe`) definition is assignable; a sequence needs cells and is listed with "needs cells to walk: edit in the file"; a creature running several behaviours is edited in the file — [rpg-toolkit `dungeonspec/behaviors.go` bindBehaviorSource](https://github.com/KirkDiggler/rpg-toolkit/blob/bb5806f7/rulebooks/dnd5e/encounter/dungeonspec/behaviors.go).
- A refusal at a root `tables` path is a sentence with no jump, since Tables has no section; a refusal at `behaviorDefinitions.<id>` opens Behaviours on it — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The Scenarios component and its test are deleted, since nothing mounts them; `scenarios` still round-trips through `siteScope` — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).

- The toolbar strip reads "Encounter configuration" with no suffix: the bars show the group and section, and a breadcrumb would say it twice — [rpg-project#982](https://github.com/KirkDiggler/rpg-project/issues/982).
- Each bar is a `tablist` of `tab`s with roving tabindex (Left/Right move and select, Home/End to the ends, Tab leaves); the group bar controls a `tabpanel` holding the section bar and the section's own `tabpanel`, each labelled by its selected tab — [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

- The picker checks a creature's own `posts` keys and `blockingStates` against each definition's `recipe.states`, and lists a definition missing one disabled with the states named ("gate-1 holds posts or blocks in `alert`, `challenged`, `posted`; `captain-policy` has no state …"), because the engine refuses that pair ("body \"policy\" has no source state \"alert\""); this compares names the document holds and is no rule about what runs. A recipe naming no states inline cannot be checked and stays offered — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1443#pullrequestreview-5921919791).
- Behaviours also lists a definition no creature runs, which the engine says under not-yet-said (kind `routine`), with the engine's own sentence and no "Run by", since the picker still offers it — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1443#pullrequestreview-5921919791).
- The editors the retired keys no longer need are deleted with their tests: `StatesEditor`, `statePostEdits`, `setMonsterTable`, the faction answer-entry edits, `FactionInherits`, `AnswerTableReadout`, `TableNameSelect` — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1443#pullrequestreview-5921919791).

## Found

- All ten castle behaviour definitions are concrete (`recipe` + `table`), each run by the one creature it is named for, and each creature binds it as `{ id: policy, use: <name> }`; `hall-1`, `keep-*`, `reserve-*`, `sergeant` and `turnkey` carry no `behaviorState` — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The engine inherits a faction's `behaviors`, `behaviorState`, `blockingStates` and `posts` for a member that writes none of its own — [rpg-toolkit `dungeonspec/behaviors.go` roomBehaviorInput](https://github.com/KirkDiggler/rpg-toolkit/blob/bb5806f7/rulebooks/dnd5e/encounter/dungeonspec/behaviors.go).

- The picker's output compiles: hall-1 → `keep-1-policy` and the king → `keep-1-policy`, written exactly as the tests pin them, read back clean with rpg-toolkit `main` bb5806f7 `cmd/readback --full` ("The routine `keep-1-policy` is run by Knight (keep-1) and The Mad King (king)"); gate-1 → `captain-policy` is refused by the engine, which the picker now prevents — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1443#pullrequestreview-5921919791).

## Mistaken

- The first head's picker offered definitions the engine refuses for a creature with posts, and Behaviours dropped a definition no creature runs; the claim that a pick compiles had no evidence. Review ran the picks through the engine and found both — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1443#pullrequestreview-5921919791).
