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

Browser verification is blocked, so no screenshots are attached or claimed.
The active browser session at `http://localhost:3004/?playerId=alice` shows a
different existing encounter whose only monster label is `entrance...`.
The current-worktree Vite server is not running, and the repositories contain
no documented local-stack/content-loading command that imports
`/home/kirk/game-dev/dungeon-content/reference-tomb.yaml` into the listener on
port 8080. Consequently this PR has not yet proven the reference tomb's
Soldier01/Knight standing, moving, and downed sibling rendering in a browser.
