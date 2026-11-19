# Run — 2026-11-19 — Shared wall-kit height fitting

## Shipped

- Initial implementation checkpoint: a pure declared-height planner and the existing upper-row renderer use one bounded layout; the wider kit is still unfinished — [Courtyard S6](https://github.com/KirkDiggler/rpg-project/issues/1022).

- First-pair integration now routes structural walls, doorway assemblies and generated props through the common height assembly; repeated parts get placement-local binding aliases so all courses receive the same finish/chart. The normal Studio visual checkpoint is still pending — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Decided

- Bound repeat-row allocation, not a valid requested height: residual scale belongs to the upper rows actually created, never to the fixed opening or leaf — [agreed fitting direction](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Keep the old proportional-input minimum behavior at its legacy adapter while the new explicit-height contract refuses targets below the fixed region — [implementation plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).

- Build each height revision as a fresh detached hierarchy before UV/material treatment, rather than append rows to a live object after chart preparation; preserve source slot identities in saved data and expand only placement-local aliases — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
- Keep Castle Wall 01's corner policy unchanged with body fitting separate from optional miter opt-in, and key GLTF loading by content hash so new configured bytes cannot reuse an older cached hierarchy — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Found

- The old clone cap could render height 66 while reporting 120; the actual-geometry regression now reaches 120 with 64 upper courses and an unchanged 1.8-height leaf, then shrinks back to native height — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Residual scaling about a centred mesh pivot shifted the row base; anchoring the lower face removes the gap without moving fixed geometry — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The planner, loaded-model and generator checks pass (86 focused tests), plus 16 adjacent fit/catalog checks, targeted lint and typecheck; this is not a full-gate, whole-kit or screenshot-reproduction claim — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- The actual pushed provider `19056c4` supplies measured height profiles through normal sync; strict parsing refuses incompatible roles/dimensions and the loaded upper-row path checks those metrics against its geometry. No new model/image bytes or material enrollment are part of this checkpoint — [provider work](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Focused checks now measure actual structural wall/door geometry at the requested height, continuous UVs across repeated masonry, unchanged leaf height, source/instance isolation, disposal and owner-side refusal below the fixed minimum — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Mistaken

- First whole-Web gate found an old unversioned-URL assertion, a door fixture below its protected opening height, and material-only updates rebuilding geometry because equivalent metadata arrays had different identities. Updated the assertions/fixture and keyed the instance by metadata values; focused regressions pass — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The initial plan proposed rejecting row-count overflow before reconciling the base renderer's documented pool policy; corrected it to preserve requested height with bounded allocation instead — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
