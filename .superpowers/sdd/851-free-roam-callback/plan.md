# Free-Roam Callback Authority Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this session only; user explicitly prohibited subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the free-roam Move callback authority transition deterministic for #851 without weakening the empty-selector assertion.

**Architecture:** Investigate whether `session-combat-free-roam` is only a display condition or an execution-authority condition. If evidence shows production already fails closed until Turn/Afford freshness returns, change only the integration test to wait for the actual callback-authority condition before clicking.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Connect RPC proto mocks.

**Spec:** KirkDiggler/rpg-dnd5e-web#851 and Actions run `33226684501` job `99031689046`.

## Global Constraints

- Own only #851 in this worktree/branch.
- No subagents, no push, no PR.
- No arbitrary sleeps, timeout increases, weakened `declarationId: ''` assertion, or hard-coded encounter actors.
- Production changes only if evidence proves a production atomicity defect; otherwise test-only.

---

### Task 1: Prove the boundary mismatch

**Files:**

- Modify: `src/components/session/SessionEncounterView.test.tsx`

**Interfaces:**

- Consumes: existing mocked `SessionCanvas` `lastCanvasProps`, `turnFn`, `affordFn`, `moveFn`, `deferred()` helper.
- Produces: deterministic RED showing free-roam display can exist before callback authority is fresh.

- [ ] Add deferred third Turn/Afford refreshes after `FIGHT_ENDED` while retaining WORLD/WORLD display clocks.
- [ ] Run focused test and capture RED where the test clicks after free-roam but before callback authority.

### Task 2: Apply the minimal fix

**Files:**

- Modify: `src/components/session/SessionEncounterView.test.tsx`

**Interfaces:**

- Consumes: `lastCanvasProps.current.turnLocked` as the callback-authority observable exposed to `SessionCanvas`.
- Produces: deterministic test that clicks only after WORLD/WORLD snapshots are fresh (`turnLocked === false`) and still asserts `declarationId: ''`.

- [ ] Keep the free-roam display assertion to prove the UI condition.
- [ ] Resolve deferred Turn/Afford WORLD refreshes.
- [ ] Wait for `lastCanvasProps.current?.turnLocked` to be `false` before invoking `onHexClick`.
- [ ] Run focused test and capture GREEN.

### Task 3: Verify and report

**Files:**

- Create/modify: `.superpowers/sdd/851-free-roam-callback/report.md`

**Interfaces:**

- Consumes: RED/GREEN/repeated/full-suite/CI command outputs.
- Produces: committed #851 fix and report with root cause, proof, verification, commit SHA, concerns.

- [ ] Run `SessionEncounterView.test.tsx` repeatedly (target 10 runs / 450 tests).
- [ ] Run full suite 3 consecutive times.
- [ ] Run `npm run ci-check`.
- [ ] Run `git diff --check origin/dev...HEAD`.
- [ ] Commit without `--no-verify`.
- [ ] Confirm worktree clean.
