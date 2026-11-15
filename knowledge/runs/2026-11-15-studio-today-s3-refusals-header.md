# Run — 2026-11-15 — Studio today S3 refusals header

Slice [rpg-project#969](https://github.com/KirkDiggler/rpg-project/issues/969) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`285152a2`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/285152a2).

## Shipped

- The header counts the current refusals ("1 refusal", "N refusals") on Build and Encounter, Layout and 3D, absent at zero; activating it lists each in the engine's words with its jump, without opening Site — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
- The row-refusal provider wraps the whole workspace; faction table rows, faction lines and creature and prop lines in the inspector show their own refusal, and a faction holding one opens on it — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
- The Save panel's list stays; it and the header share one `RefusalList` — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).

## Decided

- The list opens as its own band under the header (`Current refusals`), not inside the Site panel, because R34 says a refusal must be seen without opening Save — [design R34](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md#law).
- The count's text is its accessible name (`1 refusal`), so tests and screen readers read the same words — [rpg-project#969](https://github.com/KirkDiggler/rpg-project/issues/969).
- A line shows the refusals under `<owner>.options[i]` except those under a verdict row (`…success[j]`, `…failure[j]`), which the row shows itself, so no sentence shows twice — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
- The warning band's two existing colour literals became tokens (`--es-warning-text`, `--es-warning-bg`) that the count reuses, so the slice adds no colour value — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
- The provider wraps the workspace from the return site (`surface` variable), so the 1600-line JSX does not reindent and the parallel T3 builder's diff in `EncounterStudioWorkspace.tsx` stays mergeable — [plan sequence](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/plan-places-and-ways.md#header).
- The record sits at the repo root `knowledge/runs/`, the only knowledge level the web repo has, as earlier studio records do — [knowledge README](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/knowledge/README.md).

## Found

- Widening the provider alone showed nothing on Factions or in the inspector: only Tables and Bundles rows passed a path (`at`) to `useRowRefusalsAt`; faction rows and every `OptionsEditor` line passed none — [SitePolicies at base](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/285152a2/src/concepts/world-building/SitePolicies.tsx).
- The engine addresses lines at `room.room.monsterBindings.<id>.options[i]`, `room.room.propBindings.<id>.options[i]` and `factions[i].options[j]`, and faction rows at `factions[i].on.<trigger>[k]`; say-and-do is refused at `….options[i].do` — [grammar.go options](https://github.com/KirkDiggler/rpg-toolkit/blob/main/rulebooks/dnd5e/encounter/dungeonspec/grammar.go#L571-L600).
- The studio's line editor cannot make a line with both `say` and `do` (Said/Done is a radio), so the checklist's first step needs a hand-edited draft file — [rpg-project#969](https://github.com/KirkDiggler/rpg-project/issues/969).
- `bundles.test.ts > a bundle that uses itself` overflows the stack locally on untouched `dev` 285152a2 while dev CI is green — [dev CI](https://github.com/KirkDiggler/rpg-dnd5e-web/actions?query=branch%3Adev).

## Mistaken

- The first move of the provider to the root reindented the whole workspace JSX (1480 changed lines); redone at the return site before commit — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
- The first header tests used the fake session's empty draft, where `goblin-1` is not placed, so its refusal was a sentence and not a jump; the tests now place it from the populated fixture — [`16dd84d1`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/16dd84d1).
