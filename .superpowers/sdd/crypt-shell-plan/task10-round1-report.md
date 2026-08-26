# Task 10 — fix round 1/5

## Status

Critical leaf-failure/integration finding fixed. No accessibility, Task 11,
fixtures, docs, screenshots, push, or PR work included.

## Fix

`AtlasWalls.suppressDoorLeaves` is an optional, default-false control. The
resource-error `DungeonShell` legacy fallback alone enables it. It suppresses
only shut legacy door leaf instances; legacy floor, wall runs, frames, door
state/gaps, and click handling remain mounted. Loading and named legacy paths
retain their closed leaf. A failed profile resource therefore cannot be
re-requested by the fallback, including `SM_Env_Door_01.glb`.

## Coverage

`DungeonShell.test.tsx` now uses real `SyntyHexFloor`, `AtlasWalls`,
`WallRunMesh`, `GlbInstance`, and shell components, with only loader/cache
mocks. It proves:

- exact six profile resource URLs and shared cache identity with leaf consumers;
- profile floor/wall pair mounts only after readiness;
- loading/pending keeps the legacy pair and cache transition reaches profile;
- each six-resource rejection atomically mounts actual legacy floor/walls;
- the rejected door leaf loader is attempted once, no failed leaf is mounted or retried;
- nested Suspense/cache behavior, StrictMode loading/profile-key reset;
- provider `manifest-unavailable` and `invalid-profile` cases.

AtlasWalls directly proves the suppressed fallback preserves wall runs, frame,
door state/gap and click id. Rendered builder/game parity coverage proves the
same built scene, builder omission of door props, game forwarding of doors/click,
legacy banner callback transition, and one builder light mount. No direct
floor/wall callsites were added.

## Verification

- Focused Task 10 + Task 9 + parity: 11 files, 134 passed.
- Full: 230 files passed, 1 skipped; 3,628 passed, 1 skipped.
- `npm run ci-check`: passed (format, lint, typecheck, build, tests).
