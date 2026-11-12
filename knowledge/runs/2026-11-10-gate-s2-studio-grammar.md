# Run — 2026-11-10 — the-world-runs Gate S2 studio grammar

processed: 2026-11-12T165555Z

Slice [rpg-project#922](https://github.com/KirkDiggler/rpg-project/issues/922) of story [rpg-project#769](https://github.com/KirkDiggler/rpg-project/issues/769). Base: `rpg-dnd5e-web` `dev` at [`3be3c439`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/3be3c439).

## Shipped

- The studio loads an option `requires` list, the `{ interaction: { id, in } }` requirement, an option `advance` and a root `interactions:` map, and writes each back as written — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).

## Decided

- `advance` stays out of `OPTION_KEYS` and rides `carryUnknownKeys`, because the studio does not edit it in this slice and the carry already keeps it through option edits — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).
- A list or an interaction read is shown read only in the requires picker, so an edit can never collapse a list into one mapping — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).
- Whether an interaction id is declared and its states exist is left to the compiler; the studio judges only the shape, as `InteractionPredicateSpec.UnmarshalYAML` does — [rpg-toolkit#2358](https://github.com/KirkDiggler/rpg-toolkit/pull/2358).

## Found

- The compiler refuses `requires: []` by name ("this requires lists nothing"), so the studio refuses it too — [rpg-toolkit#2358](https://github.com/KirkDiggler/rpg-toolkit/pull/2358).
- The `author/dungeonYaml.ts` option writer read only the first key of `requires` and would have written a list or an interaction wrong; it now writes every form — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).
- `roomDraft.test.ts` pinned the old `optionRequiresForms` sentence word for word; the engine changed it, so the pin moved with it — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).

## Mistaken

- none observed
