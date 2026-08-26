# Task 10 — fix round 3/5

## Status

Approved custom-cache removal completed. No accessibility, Task 11, docs,
screenshots, push, PR, subagents, or reviewer work included.

## Production fix

Deleted `src/components/session/dungeonShellResourceCache.ts` and removed all
production imports, remember APIs, clear APIs, and render-time rejection
catching. `ProfileResources` now performs one ordinary `useGLTF(leafUrl)`
read, passes its fulfilled scene through `profileLeafScene` to `AtlasWalls`,
and supplies it to `GlbInstance.sourceScene`; the profile door does not issue
a second leaf hook. Pending resources remain under Suspense, rejected resources
reach `ErrorBoundary`, and both loading and failed legacy fallbacks suppress
door leaves so they do not re-request the pending/rejected leaf.

## Test coverage

`DungeonShell.test.tsx` now models test-only drei URL cache states as pending,
fulfilled, and rejected. Pending states settle explicitly to fulfilled or
rejected; rejected URLs remain rejected across the same URL/profile reset;
explicit mocked `useGLTF.clear(leafUrl)` followed by a changed profile key is
the deliberate recovery path. The suite verifies one URL-loader attempt before
leaf failure and no leaf loader in the failed fallback, plus the actual shell,
floor, walls, door frame/gap/click, and callback behavior.

`DungeonShell.provider.test.tsx` now runs the real catalog hook and shell
through a deferred old fetch, provider reset, new valid fetch, then old
malformed settlement. It proves the hook/shell remains on the new snapshot and
the stale owner cannot overwrite it. Malformed, network, HTTP failure, and
valid byte paths remain covered. Existing builder/game shell, lighting, and
banner/callback parity tests remain intact.

## Verification

- Focused Task 10 + Task 9 + provider/parity: 13 files, 202 passed.
- Full suite: 231 files passed, 1 skipped; 3,635 passed, 1 skipped.
- `npm run ci-check`: passed (format, lint, typecheck, build, asset guards, tests).
