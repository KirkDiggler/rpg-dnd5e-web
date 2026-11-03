# Run — 2026-11-03 — Castle NPC activity consumer

## Shipped

- Candidate catalog adds the separate55-joint profile for48 guard/peasant looks, preserving the original72 goblin-camp bindings and283 appearance entries — [slice](https://github.com/KirkDiggler/rpg-project/issues/845).

## Decided

- Reuse the existing generic default/reply editors and native playback; no player customization, runtime retargeting, new schema or controller — [story](https://github.com/KirkDiggler/rpg-project/issues/844).

## Found

- Before adoption, four actual Studio inspector tests fail because Default activity is disabled for kingdom soldiers/peasants; the exact-profile test also fails. Adding generated provider data resolves the missing support without production logic changes — [slice](https://github.com/KirkDiggler/rpg-project/issues/845).
- Shared reply vocabulary is already deduplicated across profiles; the new test preserves that behavior — [editor](../../src/concepts/world-building/SayActivityFields.test.tsx).

## Mistaken

- Older social/six-idle tests selected every profile containing an activity and assumed there could be only one globally; scope those preservation assertions to the original named profile while separately checking all48 new bindings — [coverage](../../src/npc-activities/kingdomActivities.test.ts).
