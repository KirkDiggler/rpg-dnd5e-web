# Run — 2026-11-08 — Courtyard S3 wall choices

## Shipped

- Consumer checkpoint adopts already-merged Kingdom wall models and five masonry resources; early visual integration and final acceptance remain outstanding — [Courtyard S3](https://github.com/KirkDiggler/rpg-project/issues/895).

## Decided

- Reuse Assets fe6b5ee rather than re-ingest the house kit or re-approve published resources; this branch stacks on ground c3af7c0d to keep the approved baseline — [plan](https://github.com/KirkDiggler/rpg-project/blob/a841036/ideas/courtyard-walls/plan.md).
- Keep model/default-look native parity separate from the existing Studio-only alternate finishes; do not turn this into the universal material-editor design — [appearance handoff](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1268).

## Found

- Ten new contract cases failed on the old consumer pin: six missing solid house-wall choices, a missing moving-leaf exclusion example, and three missing masonry resources. Normal catalog regeneration makes the focused 144-test set pass; no production helper changes were needed — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- All 268 prior generated asset rows and both prior material rows remain semantically identical; published catalogs now expose 314 assets and five materials. These are measured preservation results, not frozen collection-count tests — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Eleven native-authoring/ground/control checks and type checking pass. The current-source fixture matches API 9a3896e and the isolated container hash; appearance edit/reset/save/reopen preserves every other parsed source fact, including ground and all scene items — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- Pinned full sync and world/material/ground checks pass. Ground still uses cb2bbb5 and the same manifest digest; geometry and material pins are independently updated to merged fe6b5ee — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).

## Mistaken

- Initial sync invocation assumed an executable shell script; the repository invokes it with bash. Corrected the command, without changing permissions or tooling — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
- The canonical castle does not include the operator's tree placement. It is a current source fixture, not proof of their current authored composition; do not invent or overwrite that placement when folding the wall look — [S3](https://github.com/KirkDiggler/rpg-project/issues/895).
