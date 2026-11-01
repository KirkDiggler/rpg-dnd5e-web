# Run — 2026-11-01 — NPC social activities consumer

Slice [web#1370](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1370) of [project#784](https://github.com/KirkDiggler/rpg-project/issues/784). Base: web dev at [b5cc3417](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b5cc341703ddfb614d8ab495a091906d069bb6f6).

## Shipped

- Candidate delivered, not yet merged: three approved social activities in existing default/count-response pickers, with unchanged283 appearance entries and72 supported body hashes — [web#1371](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1371).
- Native save/reopen/custom-look launch and both-client playback completed; provider publication and released-SHA re-pin remain explicit merge prerequisites — [private native receipt](https://github.com/KirkDiggler/rpg-game-assets/blob/870461919edad58588f2ba080e2d80363d3d192f/evidence/npc-activities/social-activities-v1/walk/README.md).

## Decided

- Kirk approved the existing lab motions and integrated Studio outcome on2026-11-01; no patrol feature or additional backend contract is introduced, because the existing activity refs/counts already express the agreed behavior — [goal](https://github.com/KirkDiggler/rpg-project/issues/784).
- Adopt provider candidate bd40748 through generated metadata, not animation-specific UI or mixer branches, because the existing profile map owns available choices and clips — [provider candidate](https://github.com/KirkDiggler/rpg-game-assets/pull/335).
- Keep one cursor, mixer and movement writer; update the failed-body test asset fixture to include the complete declared library rather than weakening its no-replay assertions — [consumer diff](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1371).

## Found

- Nine new-choice assertions failed before adoption; the actual default/history and counted-response editors pass afterward, and full local gate is9534 passed/5 skipped with hosted checks green at3c0af682 — [tested head](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/3c0af682f1672b824f54281f1f938964304371a0).
- Three native default/reply permutations preserve03/B, complete Enter/Sustain/Exit/count2, return to a different default and discard count20 through NPC movement on both clients — [native evidence](https://github.com/KirkDiggler/rpg-game-assets/blob/870461919edad58588f2ba080e2d80363d3d192f/evidence/npc-activities/social-activities-v1/walk/README.md).

## Mistaken

- Explicit old profile/hash/choice expectations and a three-clip mock failed the full gate; update publication expectations and complete the mock from provider data, preserving real lifecycle assertions — [consumer diff](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1371).
- Changing an env manifest did not retarget restart, which preserves its stored worktree; the exact candidate was checked out into the served detached tree and its pinned assets synced before successful QA — [driver corrections](https://github.com/KirkDiggler/rpg-game-assets/blob/870461919edad58588f2ba080e2d80363d3d192f/evidence/npc-activities/social-activities-v1/walk/README.md).
- Driver assumptions about Back implying a live seat, JSON instead of gRPC-web GetSeat, and saving over an existing key were wrong; native seat status and explicit Replace confirmation now govern setup, without product changes — [driver corrections](https://github.com/KirkDiggler/rpg-game-assets/blob/870461919edad58588f2ba080e2d80363d3d192f/evidence/npc-activities/social-activities-v1/walk/README.md).
- The older root checkout lacked the newer scoped run-record policy; the reviewer supplied its tracked authority and this record addresses the finding — [review R1](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1371#pullrequestreview-5726631660).
