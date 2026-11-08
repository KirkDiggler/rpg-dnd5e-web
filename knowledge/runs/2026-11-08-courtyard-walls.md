# Run — 2026-11-08 — Courtyard S3 wall choices

## Shipped

- Consumer checkpoint adopts already-merged Kingdom wall models and five masonry resources; a native saved-copy Studio/play preview is running on isolated :3182, with final visual acceptance and PR gates still outstanding — [Courtyard S3](https://github.com/KirkDiggler/rpg-project/issues/895).

## Decided

- Reuse Assets fe6b5ee rather than re-ingest the house kit or re-approve published resources; this branch stacks on ground c3af7c0d to keep the approved baseline — [plan](https://github.com/KirkDiggler/rpg-project/blob/a841036/ideas/courtyard-walls/plan.md).
- Keep model/default-look native parity separate from the existing Studio-only alternate finishes; do not turn this into the universal material-editor design — [appearance handoff](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1268).

- Reuse the existing schema2 authored-UV collection/bindings for 01_A–04_C; the operator corrected my masonry-face interpretation. Independent A/B stays required but deferred, and mixed feature/door wall sections follow selectable textures — [direction](https://github.com/KirkDiggler/rpg-project/issues/895#issuecomment-6726761156).

- Adopt the operator-merged/generated proto v0.1.262 (generated commit c23b703c7d2bc42fc181c5bd9587b1c9104d999c); package and lock move together and type checking passes. No other merge authorization is inferred — [wire PR](https://github.com/KirkDiggler/rpg-api-protos/pull/425).

## Found

- Ten new contract cases failed on the old consumer pin: six missing solid house-wall choices, a missing moving-leaf exclusion example, and three missing masonry resources. Normal catalog regeneration makes the focused 144-test set pass; no production helper changes were needed — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- All 268 prior generated asset rows and both prior material rows remain semantically identical; published catalogs now expose 314 assets and five materials. These are measured preservation results, not frozen collection-count tests — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Eleven native-authoring/ground/control checks and type checking pass. The current-source fixture matches API 9a3896e and the isolated container hash; appearance edit/reset/save/reopen preserves every other parsed source fact, including ground and all scene items — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Pinned full sync and world/material/ground checks pass. Ground still uses cb2bbb5 and the same manifest digest; geometry and material pins are independently updated to merged fe6b5ee — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

- Native Studio import → Save a copy → Play renders Castle Wall Fit01 and House Wall05; actual fetched GLB hashes match the merged provider. The fighter was moved normally beside the timber frontage for the early look; settled Studio/play screenshots were inspected with no page exceptions — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

- Strict mixed-catalog reader passes 100 focused reader/generator/sync/preview checks and types. It keeps masonry/atlas typed views under one digest; still-unupgraded generation and preview paths explicitly refuse v2 rather than silently publish only masonry — [atlas plan](https://github.com/KirkDiggler/rpg-project/blob/design/867-courtyard-ground/ideas/courtyard-walls/atlas-implementation.md).
- Read the actual source-built candidate: five masonry looks, twelve atlas packs, 193 exact asset bindings, including the served House Wall05. Its catalog digest is 1f86a2f1ed5a4a2e7265202dd5ea56d938dd8bc91529852b984b23c32d76f7a3. It remains staged-unapproved; no runtime/publication change — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Real rebuild revealed one red-channel value differing by one in one brick-image pixel from the historical/live resource; all atlas bindings and other material rows match. Resolve derivation custody before any provider apply; reader acceptance is not artistic/publication acceptance — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

- The authored-UV adapter and existing masonry adapter pass 36 focused tests plus types. A real hardware-browser test loads the exact House Wall05 GLB, applies 01_A and 04_C independently, preserves geometry/UVs, and resets Original pixel-exactly. Both production modules and verified source-built image bytes are used; no API calls or persistent viewer. This is renderer evidence, not the missing Studio/native/play integration — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

- Generated and private-preview projections now retain the complete atlas view alongside masonry under the same digest; the pure schema validator is shared by Node/browser boundaries. 123 focused catalog/adapter checks and types pass. The actual 193-binding candidate stages through the existing private preview transaction after matching real model bytes; the live v1 pin remains unchanged — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

## Mistaken

- The initial reader plan allowed empty suggested collections; the agreed provider wire requires a nonempty recommendation list. Corrected the plan/tests: recommendations are not exhaustive permissions, so an uncurated valid atlas material is retained, but malformed recommendation metadata still refuses — [atlas law](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/assets/pack-material-profiles/atlas-provider-design.md).
- The earlier isolated stack and state files were already absent; restart refused before mutation. Created a fresh isolated stack rather than claiming the old run resumed; operator :3030 and Lab :3180 were not changed — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- A private SSR fixture-capture attempt hit the API client's browser-only window dependency. Captured through the normal browser-like test environment instead; no production workaround. Initial screenshots were too early for model/camera settling and were replaced by inspected settled views — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Initial sync invocation assumed an executable shell script; the repository invokes it with bash. Corrected the command, without changing permissions or tooling — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- The canonical castle does not include the operator's tree placement. It is a current source fixture, not proof of their current authored composition; do not invent or overwrite that placement when folding the wall look — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
