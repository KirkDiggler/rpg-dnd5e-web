# Run — 2026-11-05 — hair attachment visibility

processed: 2026-11-12T165555Z

## Shipped

- Added a per-instance raycast opt-out before mounting skinned accessories, with scalp/facial-hair regressions covering initial mounts and replacements — [web#1391](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1391).

## Decided

- Kept picking on the existing entity proxy, matching body meshes, rather than disabling frustum culling or adding per-frame bounds computation; the separate arm/hand animation-bounds finding is outside this fix — [web#1391](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1391).

## Found

- A pointer event between accessory mount and world-matrix update can make `SkinnedMesh.raycast` cache world-positioned bounds as mesh-local bounds; subsequent rendering transforms them again and rejects centered hair — [web#1391](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1391).
- In the original Human Fighter fixture, hair draws at zoom 35/50/80/140 were 1/1/0/0; with the actual fix, Human and Half-Orc Fighter/Bard each drew hair at all four zooms while pointer events fired during delayed accessory loading, with culling still enabled — [web#1391](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1391).

## Mistaken

- The first browser fixture omitted pointer interaction during loading and reproduced only arm/hand edge culling; exercising the mount-to-frame interval exposed the distinct hair failure, now represented by a deterministic component regression — [web#1391](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1391).
