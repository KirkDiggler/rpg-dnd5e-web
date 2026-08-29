# #851 Free-Roam Callback Authority Transition Report

## Root cause and evidence/data-flow trace

Root cause: the failing test waited for a display condition (`session-combat-free-roam`) but then exercised an execution-authority callback. Those are intentionally different boundaries.

Trace:

1. `FIGHT_ENDED` is delivered by `useSessionEventStream` to `SessionEncounterView.handleSessionEvent`.
2. `handleSessionEvent` immediately calls `combat.invalidateAuthority()` and schedules a coalesced refresh for `turn` and `afford` plus event-specific keys.
3. `useSessionTurn.invalidate()` and `useSessionAfford.invalidate()` synchronously set `fresh: false` while retaining last-good display snapshots.
4. `SessionEncounterView` renders `CombatExperience` with `experienceClock = turnClock === affordClock ? turnClock : ClockKind.UNSPECIFIED`; this display clock does **not** require freshness.
5. `CombatExperience` renders `data-testid="session-combat-free-roam"` when `clock === ClockKind.WORLD`.
6. Move execution authority is stricter: `moveDeclarationId` is `''` only when `authorityFresh` is true and Turn/Afford coherently report `WORLD`; otherwise it is `undefined`.
7. `SessionCanvas` receives `turnLocked=true` until callback authority is fresh; `useSessionWalk.walkTo` also refuses when `declarationId === undefined` or `!isAuthorityFresh()`.

Actions failure `33226684501` / job `99031689046` showed exactly that mismatch: DOM contained `session-combat-free-roam` / `World clock` / `Free roam`, but the last recorded `moveFn` call still had `declarationId: "v1.move"` at `SessionEncounterView.test.tsx:702`.

## Production or test-only?

Test-only synchronization defect.

Production already separates stale display from execution authority and fails closed: after invalidation, `fresh=false`, `turnLocked=true`, and `walkTo` will not dispatch a Move until Turn/Afford freshness returns. The UI may continue showing retained WORLD/WORLD display state during a refresh, but that is not authority to execute. No production atomicity defect was proven, so no production code was changed.

## RED change / command / output

RED change: made the existing test deterministic by deferring the post-`FIGHT_ENDED` Turn/Afford refresh after WORLD/WORLD display was already visible, then preserving the old click-before-callback-authority behavior.

Command:

```bash
npm run test:run -- src/components/session/SessionEncounterView.test.tsx -t "clears the turn Move selector"
```

RED output excerpt:

```text
❯ src/components/session/SessionEncounterView.test.tsx (45 tests | 1 failed | 44 skipped) 1491ms
× clears the turn Move selector when authority transitions to world clock before the next free-roam request 1487ms
AssertionError: expected last "vi.fn()" call to have been called with [ ObjectContaining{…} ]
-     "declarationId": "",
+     "declarationId": "v1.move",
...
❯ src/components/session/SessionEncounterView.test.tsx:715:30
Test Files  1 failed (1)
Tests  1 failed | 44 skipped (45)
Command exited with code 1
```

The failure DOM also showed both `session-combat-free-roam` and the stale-authority copy `Actions may be out of date / Waiting for current Turn and Afford authority`, proving the UI condition was not callback authority.

## Minimal fix

Changed only `src/components/session/SessionEncounterView.test.tsx`:

- Keep asserting/observing `session-combat-free-roam` to prove the display state.
- Keep the `declarationId: ''` assertion.
- Add deferred post-`FIGHT_ENDED` Turn/Afford WORLD refreshes.
- Assert the deterministic stale window with `lastCanvasProps.current?.turnLocked === true`.
- Resolve the deferred Turn/Afford WORLD refreshes.
- Wait for the actual callback-authority condition, `lastCanvasProps.current?.turnLocked === false`, before invoking `onHexClick`.
- Assert the second Move call happened and was last called with `declarationId: ''`.

No sleeps, no timeout increases, no hard-coded encounter actors, no production changes.

## GREEN / repeated / full-suite / CI outputs

Focused GREEN:

```text
npm run test:run -- src/components/session/SessionEncounterView.test.tsx -t "clears the turn Move selector"
Test Files  1 passed (1)
Tests  1 passed | 44 skipped (45)
Duration  3.49s
```

Repeated `SessionEncounterView.test.tsx` 10 runs / 450 tests:

```text
run 1/10: Test Files 1 passed; Tests 45 passed
run 2/10: Test Files 1 passed; Tests 45 passed
run 3/10: Test Files 1 passed; Tests 45 passed
run 4/10: Test Files 1 passed; Tests 45 passed
run 5/10: Test Files 1 passed; Tests 45 passed
run 6/10: Test Files 1 passed; Tests 45 passed
run 7/10: Test Files 1 passed; Tests 45 passed
run 8/10: Test Files 1 passed; Tests 45 passed
run 9/10: Test Files 1 passed; Tests 45 passed
run 10/10: Test Files 1 passed; Tests 45 passed
```

Full suite, 3 consecutive runs:

```text
run 1/3: Test Files 275 passed | 1 skipped (276); Tests 4153 passed | 2 skipped (4155)
run 2/3: Test Files 275 passed | 1 skipped (276); Tests 4153 passed | 2 skipped (4155)
run 3/3: Test Files 275 passed | 1 skipped (276); Tests 4153 passed | 2 skipped (4155)
```

`npm run ci-check`:

```text
✓ Format check passed
✓ Lint check passed
✓ Type check passed
✓ Build passed
✓ Built theme CSS carries the combat-HUD block
✓ Production assets exclude Toolkit Contributor Sandbox code
✓ Tests passed
✅ All CI checks passed! Safe to push.
```

`git diff --check origin/dev...HEAD` before commit produced no output.

## Files changed

- `src/components/session/SessionEncounterView.test.tsx` — deterministic callback-authority synchronization fix.
- `.superpowers/sdd/851-free-roam-callback/plan.md` — SDD plan produced by required process.
- `.superpowers/sdd/851-free-roam-callback/report.md` — this report.

## Commit SHA

Fix commit: `e32526ded00bd43f0f6caacbc3b192c27e7d550d` (`test: make free-roam callback authority deterministic`).

This report is finalized in a follow-up docs commit because a commit object cannot contain its own final SHA before it exists.

## Self-review and concerns

Self-review:

- Scope is test-only, matching the demonstrated root cause.
- The empty `declarationId: ''` assertion remains intact.
- The test now proves display can be free-roam while callback authority is stale, then waits for callback authority before clicking.
- No arbitrary sleeps or timeout increases were added.
- No Wave D production/weapon code was touched.

Concern: the requested `/home/kirk/game-dev/rpg-dnd5e-web/AGENTS.md` path does not exist. I verified the path with `ls`; the repo has `CLAUDE.md` at that location, which I read instead.
