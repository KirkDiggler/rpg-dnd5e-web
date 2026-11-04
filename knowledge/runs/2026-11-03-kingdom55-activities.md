# Run — 2026-11-03 — Castle NPC activity consumer

## Shipped

- Catalog adds the separate55-joint profile for204 Kingdom looks, preserving the original72 goblin-camp bindings and283 appearance entries — [slice](https://github.com/KirkDiggler/rpg-project/issues/845).

## Decided

- Kirk expanded the same-rig batch to all17 Kingdom body families and accepted the full preview before frontend publication; pin the actual merged provider `fe6b5ee22c43f4ab01d2c295c3fd09cb5e587241` — [provider](https://github.com/KirkDiggler/rpg-game-assets/pull/340).
- Reuse the existing generic default/reply editors and native playback; no player customization, runtime retargeting, new schema or controller — [story](https://github.com/KirkDiggler/rpg-project/issues/844).

## Found

- Before adoption, four actual Studio inspector tests fail because Default activity is disabled for kingdom soldiers/peasants; the exact-profile test also fails. Adding generated provider data resolves the missing support without production logic changes — [slice](https://github.com/KirkDiggler/rpg-project/issues/845).
- Shared reply vocabulary is already deduplicated across profiles; the new test preserves that behavior — [editor](../../src/concepts/world-building/SayActivityFields.test.tsx).

- Native Studio edit/save/server reopen, four live defaults, counted2 reply, count20 interrupted by actual NPC movement with default recovery and old50-joint lifecycle passed; expanded17-body fit accepted with unchanged clips — [native receipt](https://github.com/KirkDiggler/rpg-game-assets/tree/fe6b5ee22c43f4ab01d2c295c3fd09cb5e587241/evidence/npc-activities/kingdom55-v1/walk).

## Mistaken

- Two older identity-test loaders assumed the merchant loaded no activity library. Once it is enrolled, fixtures supply named clips and the body-failure probe fails only the body URL; exact body/library requests and diagnostic assertions remain strict — [slice](https://github.com/KirkDiggler/rpg-project/issues/845).

- Older social/six-idle tests selected every profile containing an activity and assumed there could be only one globally; scope those preservation assertions to the original named profile while separately checking all204 Kingdom bindings — [coverage](../../src/npc-activities/kingdomActivities.test.ts).
