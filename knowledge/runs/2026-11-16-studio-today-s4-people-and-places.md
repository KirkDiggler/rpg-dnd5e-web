# Run — 2026-11-16 — studio today S4 people and places

Slice [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`ae7f2a15`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ae7f2a15).

## Shipped

- The Encounter side is four groups as ruled — People (Cast, Sides, Party, Conversations), Places (Secrets, Ways out), What is known (Records, Threads), Pieces (Behaviours, Bundles) — opening on People → Cast; Tables and Scenarios have no section — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Behaviours lists every behaviour the engine's read-back says, with its fold and who runs it; a creature's inspector picks one the file defines — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- No control writes a faction's or a creature's `table`, `on` or `states`; a form that still carries one says so in one line — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).

## Decided

- Section keys stay as they were (`factions`, `intel`, `concealments`, `endings`, `interactions`, `facts`) and only the screen's words change, so every jump keeps landing; `dispositions` is shown inside Sides, and a new key `behaviours` is added — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Sides puts the factions first and their dispositions under them, because how the sides stand is read after who they are — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- Who runs a behaviour is the engine's `{creature, id, runs}` connections on the routine's own statement, as said; a creature whose faction supplies its behaviour is listed when and as the engine says it runs it, and the studio infers no runner — [plan on rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The picker writes `behaviors: [{ id, use }]` (the id the creature already used, else `policy`) and `behaviorState` set to that id; never `with` or `items`, which the engine refuses on a concrete definition. A concrete (`recipe`) definition is assignable; a sequence needs cells and is listed with "needs cells to walk: edit in the file"; a creature running several behaviours is edited in the file — [rpg-toolkit `dungeonspec/behaviors.go` bindBehaviorSource](https://github.com/KirkDiggler/rpg-toolkit/blob/bb5806f7/rulebooks/dnd5e/encounter/dungeonspec/behaviors.go).
- A refusal at a root `tables` path is a sentence with no jump, since Tables has no section; a refusal at `behaviorDefinitions.<id>` opens Behaviours on it — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The Scenarios component and its test are deleted, since nothing mounts them; `scenarios` still round-trips through `siteScope` — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).

## Found

- All ten castle behaviour definitions are concrete (`recipe` + `table`), each run by the one creature it is named for, and each creature binds it as `{ id: policy, use: <name> }`; `hall-1`, `keep-*`, `reserve-*`, `sergeant` and `turnkey` carry no `behaviorState` — [rpg-project#970](https://github.com/KirkDiggler/rpg-project/issues/970).
- The engine inherits a faction's `behaviors`, `behaviorState`, `blockingStates` and `posts` for a member that writes none of its own — [rpg-toolkit `dungeonspec/behaviors.go` roomBehaviorInput](https://github.com/KirkDiggler/rpg-toolkit/blob/bb5806f7/rulebooks/dnd5e/encounter/dungeonspec/behaviors.go).

## Mistaken

- none observed
