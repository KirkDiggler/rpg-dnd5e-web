# Crypt Monsters PR #594 Evidence

## Inputs

- Private asset main: `05f33a7cd1d8ab0bbe530519d46dcfbde2191ac0`
  (`Merge pull request #31 from KirkDiggler/asset/128-crypt-monsters-export`).
- Asset manifest: all seven standing entries contain exactly
  `Idle_Relaxed`, then `Walk_Forward`; the required
  `skeleton-soldier-01.glb` and `skeleton-knight.glb` paths are present.
- Resolver scope: `skeleton` deterministically selects Soldier01 and
  `skeleton-captain` selects Knight. Slave, ghosts, and Tormented Soul remain
  unselectable. Authoritative `monsterRefId` precedence and the #595
  missing-downed fallback boundary remain unchanged.

## Asset Sync

`npm run assets:sync` cloned private `rpg-game-assets` at the asset SHA above
and mirrored `harness/models/synty/` into ignored
`public/models/synty/`. Both required standing GLBs exist locally.
`git check-ignore -q public/models/synty/npcs/skeleton-soldier-01.glb` exited
zero; `git status --short --ignored public/models/synty/npcs` reported only
`!! public/models/synty/`. No public model files are committed.

## Automated Checks

- `npm run test:run -- src/components/hex-grid/monsterModels.test.ts src/components/hex-grid/HexEntity.test.ts`: 20 passing tests.
- `npm run test:run`: 76 files and 1310 tests passing.
- `npm run typecheck`: passing.
- `npm run build`: passing (the established chunk-size warning remains).
- `npm run ci-check`: passing.

## Reference Tomb Browser Result

The local content runtime is configured with `RPG_DUNGEON_KEY=reference-tomb`
and `/home/kirk/game-dev/dungeon-content` mounted at `/content`. A PR-worktree
Vite server was started on port 3004 with `VITE_API_HOST=http://localhost:8080`.
Using Alice through the normal lobby flow (create, ready, Start) created a new
local encounter; `StartEncounter` and `StreamEncounter` returned HTTP 200.

The user-provided runtime screenshot showed both skeletons sunk by about 0.15,
matching `CHARACTER_Y_OFFSET=0.05` below the default Synty floor top of 0.20.
The shared placement offset is now 0.21, above both Synty (0.20) and shaded
(0.15) floor tops, with clearance for slightly negative GLB foot minima.

No post-fix browser screenshot or dynamic movement/death observation is
claimed: the browser screenshot capture timed out before a reload. The
resolver's mappings, downed behavior, and two-clip asset contract remain
covered by their existing unit and export checks.
