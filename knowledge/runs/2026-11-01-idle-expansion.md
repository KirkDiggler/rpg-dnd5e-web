# Run — 2026-11-01 — Six-idle expansion consumer

Slice [web#1373](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1373) of [project#797](https://github.com/KirkDiggler/rpg-project/issues/797), based on [web12bc58d3](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/12bc58d37b7fbdd6a328efe7ad8b386cba7310cf).

## Shipped

- Candidate only, not merged: six additional choices in the existing default/count-response pickers through generated provider data; native acceptance remains the next integration step — [consumer slice](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1373).

## Decided

- Kirk approved all six auditioned idles and authorized the existing Studio path, not combat or new locomotion, because the current use case is NPC presentation — [goal](https://github.com/KirkDiggler/rpg-project/issues/797).
- Replace the selected profile with one expanded hash-bound profile while preserving283 appearance entries, because duplicate profile owners and per-animation controller branches are unnecessary — [checked plan](https://github.com/KirkDiggler/rpg-project/blob/docs/npc-idle-expansion/ideas/npc-activities/idle-expansion-plan.md).
- Keep candidate pins explicit until private provider publication; released-SHA re-pin and new-wave merge approval remain required — [provider PR](https://github.com/KirkDiggler/rpg-game-assets/pull/338).

## Found

- The real default and reply editor cases plus generated-data tests produced18 failures for the absent choices before catalog adoption; existing generic picker/mixer paths require no production code change — [consumer slice](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1373).
- The expanded library retains all twelve old tracks exactly and all72 supported body hashes, at3,919,040 shared bytes rather than per-body duplication — [provider proof](https://github.com/KirkDiggler/rpg-game-assets/blob/97c7064c899f85c128b5acaff3d5409c9aae091a/evidence/npc-activities/idle-expansion-v1/README.md).

## Mistaken

- None observed in consumer implementation so far; explicit publication/profile custody expectations are updated alongside the new provider, rather than weakening lifecycle assertions — [consumer slice](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1373).
