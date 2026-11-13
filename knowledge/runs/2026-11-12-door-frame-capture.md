# Run — 2026-11-12 — Courtyard S4 native and captured doorway appearance

Slice [Project #906](https://github.com/KirkDiggler/rpg-project/issues/906), story [Project #867](https://github.com/KirkDiggler/rpg-project/issues/867).

## Shipped

- Web implementation checkpoint combines the accepted Studio aperture-fit interaction with typed native frame capture and independent play rendering; real-stack verification and release remain pending — [continuation](https://github.com/KirkDiggler/rpg-project/issues/906#issuecomment-6844016998).

## Decided

- Refresh affected frame facts inside the existing owner/history transaction because movement and appearance must not gain a second save path; preserve unrelated or unknown existing intent and refuse a newly unresolvable phase — [contract](https://github.com/KirkDiggler/rpg-api-protos/pull/436).
- Fill only missing capture facts on native export, outside the retained source's comparison baseline, because an imported legacy file must actually gain those fields rather than have the source-splice layer erase the addition — [continuation](https://github.com/KirkDiggler/rpg-project/issues/906#issuecomment-6844016998).
- Render captured spans and fixed-face phases without a parent lookup because doors are independently permitted; unknown mutable state hides leaves, not a known fixed surround — [contract](https://github.com/KirkDiggler/rpg-api-protos/pull/436).
- Keep the accepted Studio origin/worktree separate from capture work because an implementation edit must not reload the operator's accepted preview — [acceptance](https://github.com/KirkDiggler/rpg-project/issues/906#issuecomment-6843793552).

## Found

- The generated SDK tag v0.1.273 contains the published frame contract; normal metadata/resource paths can carry it without another registry or source-scene fetch — [generated SDK](https://github.com/KirkDiggler/rpg-api-protos/tree/v0.1.273).
- Full local Web gate passes: 10480 tests passed, five skipped; format, lint, typecheck, build and production-asset guards passed. Existing fixture warnings and the npm script-listing diagnostic are not hidden; the retained test transcript confirms the run completed — [slice](https://github.com/KirkDiggler/rpg-project/issues/906).
- The current API castle imports and exports byte-identically through all 59 served-castle tests, including its upstream shout annotations — [API adoption](https://github.com/KirkDiggler/rpg-api/pull/1236).

- Adopted Assets `e4e493b99a2d` through normal world-assets sync/check after the approved two-container custody repair; only provider/recipe/catalog identities and two GLB hashes/sizes change in the generated catalog, while bounds, fit facts, surfaces and material pins stay identical — [bounded approval](https://github.com/KirkDiggler/rpg-project/issues/906#issuecomment-6861377166).

## Mistaken

- The provider-pin gate exposed a flaky pre-existing NPC sync fixture: `Stat.mtime` rounds the final half-millisecond into the next second, allowing rsync to repair the corrupt destination before the rejection check. Reproduced at timestamp `1700000000.9996`; setting both filesystem timestamps directly restores the intended independent hash-refusal test without changing production sync — [consumer PR](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1425).

- Reusing the legacy whole-assembly unknown-state return would remove the fixed frame while cutting its full visual span; failing role-visibility and fitted-frame tests led to hiding only moving leaves for captured aperture kits — [independent-frame contract](https://github.com/KirkDiggler/rpg-api-protos/pull/436).
