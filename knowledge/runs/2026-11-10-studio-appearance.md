# Run — 2026-11-10 — Courtyard S5 shared appearance

Work [Project #919](https://github.com/KirkDiggler/rpg-project/issues/919), implementation [Web #1402](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1402), design [Project #915](https://github.com/KirkDiggler/rpg-project/pull/915).

## Shipped

- Reader/model checkpoint only: strict schema3 atlas compatibility, actual prepared-provider pin, typed appearance sheets and owner-draft patches. The shared panel and masonry capture/play are not yet implemented — [checked plan](https://github.com/KirkDiggler/rpg-project/blob/design/1402-studio-appearance/ideas/studio-appearance/plan.md).

## Decided

- Technical atlas families are mandatory provider declarations, separate from suggested collections; incompatible choices refuse at rendering resolution even if the UI is bypassed — [provider PR](https://github.com/KirkDiggler/rpg-game-assets/pull/345).
- NPC field option values are complete published destination appearance refs, while labels retain family/style/skin vocabulary. Resolve choices against the staged look so a second palette edit cannot discard the first; no ref-suffix parsing or second global lookup — [owner contract](https://github.com/KirkDiggler/rpg-project/pull/915).
- Edit validation re-derives current fields from the owner/scene/catalog context because selection identity alone does not prove that a previously rendered choice fits a newly staged asset. The original scene supplies prop material intent; it is not reconstructed from flattened UI values — [owner contract](https://github.com/KirkDiggler/rpg-project/pull/915).

## Found

- Reader compatibility tests RED→GREEN; rendering refusal RED→GREEN; original reader/render regression set113pass. Sheet/edit tests15pass after RED runs, including explicit missing state, non-Cartesian NPC tuples, staged refs, stale selections, target changes, detached opaque fields and both-face reset — [slice](https://github.com/KirkDiggler/rpg-project/issues/919).
- Normal sync adopts actual prepared Assets8e9c518c6a8ba2aefff98a7e5b59a77a8931a2dc and catalog47317921e30bef460446599745f60c445646dd6f337bac434d1abe293e74b5ea. Normal material check, whole pinned-runtime assembly and typecheck pass; every other provider pin stays unchanged — [provider evidence](https://github.com/KirkDiggler/rpg-game-assets/pull/345).

- Full local `npm run ci-check` passes formatting, lint, types, build and tests: 10,223 passed / five skipped, 793 files / one skipped. Detailed test log `/tmp/rpg-dnd5e-web-ci-check.ZdNbKZ/tests.log` confirms the counts despite the npm-log notice in the wrapper output; this is the reader/model checkpoint, not the final feature gate — [slice](https://github.com/KirkDiggler/rpg-project/issues/919).

- First bounded panel preview wires the shared fields into the real Arrange owner: NPC looks now stage behind Apply/Cancel like wall/prop choices; existing nonappearance pickers retain their policy. Focused owner/model/integration checks: 221 passed; types and scoped lint pass. A single hardware-browser load/render check has no page exceptions. Human usability/appearance feedback is the next gate; masonry playback is explicitly labeled unfinished — [slice](https://github.com/KirkDiggler/rpg-project/issues/919).

- The operator accepted the panel preview (“looks good”); do not repeat that visual approval. The publication gate passes 10,227 tests / five skipped, plus formatting, lint, types and build. Masonry play/cold-host acceptance remains separate — [operator look](https://github.com/KirkDiggler/rpg-project/issues/919#issuecomment-6775787958).

- Operator-merged Protos#427 is verified at sourcea10de131; its successful CI42881363486 publishes generated98190d4164e8e7704b6378edec4a1c85e619de20 / TSv0.1.264. Web adopts that exact release rather than unrelated newer tags; typecheck and 24 focused adapter tests pass. Generated Go resolves to v0.0.0-20261110190446-98190d4164e8; API adoption remains separate — [wire publication](https://github.com/KirkDiggler/rpg-api-protos/pull/427).

## Mistaken

- The first panel publication gate found an inspector test still sending the retired style token instead of choosing its visible option. Updated the test to select by label and assert the exact resulting appearance plus sibling isolation. That test edit initially used a Playwright-only `exact` option in Testing Library; typecheck caught it. Removed the option, ran typecheck before the next full gate, then confirmed the complete gate green — [slice](https://github.com/KirkDiggler/rpg-project/issues/919).
- The first reader checkpoint could not typecheck the still-generated schema2 bindings against required compatibility metadata. Actual source-bound provider publication and ordinary sync resolve it; no unsafe cast, hand-edited generated module or fictitious provider SHA is used — [provider PR](https://github.com/KirkDiggler/rpg-game-assets/pull/345).
