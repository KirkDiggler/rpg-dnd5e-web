# Session Combat Experience Concept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an iterative fixture-first Concepts Lab proposal for the complete session combat turn.

**Architecture:** A new `session-combat` concept owns provisional typed fixtures and composes focused render-only components for initiative, map targets, dock, story/debug log, dice drawer, and contract annotations. The concept reuses `DiceTrayPresentation` for the actual d20 ritual and never adapts the old encounter wire into the session wire.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, CSS modules, existing dice presentation components.

**Spec:** `docs/superpowers/specs/2026-08-25-session-combat-experience-concept-design.md`

## Global Constraints

- This remains a detached local proposal until Project 19 is available and a proper slice exists.
- Fixtures provide all legality, targeting, cost, status, and result facts; the client performs no D&D calculations.
- Provisional fields are visibly classified and are not claimed as current proto fields.
- Dice gestures affect presentation only; `DiceTrayPresentation` settles the fixture's authoritative result.
- Debug remains exhaustive and separate from the player-facing Story log.

---

### Task 1: Structure checkpoint

**Files:**

- Create: `src/concepts/session-combat/sessionCombatTypes.ts`
- Create: `src/concepts/session-combat/fixtures.ts`
- Create: `src/concepts/session-combat/SessionCombatConcept.tsx`
- Create: `src/concepts/session-combat/SessionCombatConcept.module.css`
- Create: `src/concepts/session-combat/SessionCombatConcept.test.tsx`
- Modify: `src/concepts/ConceptsView.tsx`

**Interfaces:**

- Produces: `SessionCombatFixture`, `SESSION_COMBAT_FIXTURES`, and `SessionCombatConcept`.
- The fixture includes `viewer`, `initiative`, `offers`, `effects`, `story`, `debug`, and `fieldSources`.

- [x] **Step 1: Write the failing structure test**

Render `SessionCombatConcept` and assert the default review contains `session-combat-initiative`, `session-combat-map`, `session-combat-dock`, `session-combat-dice-drawer`, and `session-combat-log`, plus the fresh-turn fixture label.

- [x] **Step 2: Verify the focused test fails**

Run: `npx vitest run src/concepts/session-combat/SessionCombatConcept.test.tsx`

Expected: FAIL because `SessionCombatConcept` does not exist.

- [x] **Step 3: Implement the fixture and five-region shell**

Create one fresh-turn fighter fixture. Render the dominant map, top initiative ribbon, two-row bottom dock, compact lower-left dice drawer, and right log. Register `session-combat` as `Session Combat` in `ConceptsView` so `?concept=session-combat` deep-links to it.

- [x] **Step 4: Verify the focused test passes**

Run: `npx vitest run src/concepts/session-combat/SessionCombatConcept.test.tsx`

Expected: PASS.

- [x] **Step 5: Capture checkpoint 1**

Run Vite on a dedicated port and capture `?concept=session-combat` at 1280×800 using `tools/browser/screenshot.mjs`. Preserve the screenshot outside the public repository as local review evidence.

### Task 2: Server-offer turn flow checkpoint

**Files:**

- Create: `src/concepts/session-combat/sessionCombatSelection.ts`
- Create: `src/concepts/session-combat/sessionCombatSelection.test.ts`
- Create: `src/concepts/session-combat/ActionDock.tsx`
- Create: `src/concepts/session-combat/TargetSurface.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.tsx`
- Modify: `src/concepts/session-combat/fixtures.ts`

**Interfaces:**

- Consumes: `SessionCombatFixture.offers`.
- Produces: `selectOffer(fixture, offerId)` and `selectTarget(selection, targetId)`, where candidates always come from the chosen offer.

- [x] **Step 1: Write failing selector tests**

Assert that selecting `attack:longsword` returns only its fixture-declared candidates, that an unavailable candidate keeps the fixture reason, and that an unknown target cannot become selected.

- [x] **Step 2: Verify selector tests fail**

Run: `npx vitest run src/concepts/session-combat/sessionCombatSelection.test.ts`

Expected: FAIL because the selector module does not exist.

- [x] **Step 3: Implement minimal pure selectors**

Look up offers and candidates by stable IDs. Do not calculate target validity or costs.

- [x] **Step 4: Verify selector tests pass**

Run: `npx vitest run src/concepts/session-combat/sessionCombatSelection.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing interaction tests**

Assert clicking Attack marks it armed, exposes only declared target buttons, clicking an affordable skeleton enters `awaiting-roll`, and spent/unavailable actions expose the server reason.

- [x] **Step 6: Verify interaction tests fail**

Run: `npx vitest run src/concepts/session-combat/SessionCombatConcept.test.tsx`

Expected: FAIL because the shell is not interactive.

- [x] **Step 7: Implement ActionDock and TargetSurface**

Group offers by fixture source, render costs verbatim, arm targeted offers, and transition the local concept state only from offer/target IDs already present in the fixture.

- [x] **Step 8: Verify focused tests pass and capture checkpoint 2**

Run both session-combat test files, then capture 1280×800 screenshots for fresh and armed-target states.

### Task 3: Story, Debug, and contract checkpoint

**Files:**

- Create: `src/concepts/session-combat/StoryLog.tsx`
- Create: `src/concepts/session-combat/ContractInspector.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.test.tsx`
- Modify: `src/concepts/session-combat/fixtures.ts`

**Interfaces:**

- Consumes: structured `story` exchanges, raw `debug` lines, and `fieldSources`.
- Produces: separate Story and Debug views plus a concept-only contract overlay.

- [x] **Step 1: Write failing log tests**

Assert Story renders one grouped attack exchange without raw sequence metadata, Debug renders every raw fixture line, switching modes does not destroy either history, and reconnect fixtures restore both.

- [x] **Step 2: Verify the log tests fail**

Run: `npx vitest run src/concepts/session-combat/SessionCombatConcept.test.tsx`

Expected: FAIL because Story/Debug mode controls do not exist.

- [x] **Step 3: Implement StoryLog**

Render structured actor/action/roll/verdict/damage/effect facts as grouped rows with expandable details. Render Debug as selectable monospace fixture lines.

- [x] **Step 4: Write and verify a failing contract-annotation test**

Assert enabling `Show contract` marks at least one current session field and one provisional field and gives each a readable source label.

- [x] **Step 5: Implement ContractInspector**

Render the fixture's field-source manifest without deriving schema status from names.

- [x] **Step 6: Verify tests pass and capture checkpoint 3**

Capture Story, Debug, and contract-overlay states at 1280×800.

### Task 4: Real dice presentation checkpoint

**Files:**

- Create: `src/concepts/session-combat/DiceDrawer.tsx`
- Create: `src/concepts/session-combat/diceFixture.ts`
- Create: `src/concepts/session-combat/diceFixture.test.ts`
- Modify: `src/concepts/session-combat/SessionCombatConcept.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.test.tsx`

**Interfaces:**

- Consumes: the selected fixture outcome's authoritative d20 result and `DiceTrayPresentation`.
- Produces: a compact idle drawer and expanded `awaiting-roll` drawer whose release appends one valid presentation release event.

- [x] **Step 1: Write failing dice-fixture tests**

Assert the request contains the fixture result, release append is idempotent, and no event lets gesture data alter the result.

- [x] **Step 2: Verify dice-fixture tests fail**

Run: `npx vitest run src/concepts/session-combat/diceFixture.test.ts`

Expected: FAIL because the fixture adapter does not exist.

- [x] **Step 3: Implement the minimal presentation-event adapter**

Build one validated request for `dice.original.carved.d20` and append only the first compatible release, following the existing attack-die concept pattern.

- [x] **Step 4: Verify dice-fixture tests pass**

Run the focused test and confirm PASS.

- [x] **Step 5: Write failing drawer interaction tests**

Assert the drawer is compact before targeting, expands after the target is accepted, exposes explicit Roll through the real presentation component, and reveals the Story outcome only after release delivery.

- [x] **Step 6: Verify interaction tests fail**

Run the session-combat component test and confirm expected failures.

- [x] **Step 7: Implement DiceDrawer and release-driven story reveal**

Compose `DiceTrayPresentation`, pass reduced-motion state, and keep the result concealed in surrounding copy until a release event is delivered.

- [x] **Step 8: Verify all concept tests and capture checkpoint 4**

Run: `npx vitest run src/concepts/session-combat`

Capture idle, armed, awaiting-roll, and settled frames at 1280×800 and the settled frame at 1024×768.

### Task 5: Hard-state matrix checkpoint

**Files:**

- Create: `src/concepts/session-combat/fixtures.test.ts`
- Modify: `src/concepts/session-combat/sessionCombatTypes.ts`
- Modify: `src/concepts/session-combat/fixtures.ts`
- Modify: `src/concepts/session-combat/SessionCombatConcept.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.test.tsx`
- Modify: `src/concepts/session-combat/ActionDock.tsx`
- Modify: `src/concepts/session-combat/StoryLog.tsx`
- Modify: `src/concepts/session-combat/SessionCombatConcept.module.css`

**Interfaces:**

- Consumes: complete `SessionCombatFixture` states; no state derives legality from a neighboring fixture.
- Produces: reviewable `fresh-turn`, `spent-turn`, `spectating`, `free-roam`, and `reconnected` scenarios.

- [x] **Step 1: Write failing fixture-state tests**

Assert spent economy carries server shortfalls, spectator state names the active participant and offers no commands, free roam carries no turn economy, and reconnect retains ordered Story/Debug history.

- [x] **Step 2: Verify fixture-state tests fail**

Run: `npx vitest run src/concepts/session-combat/fixtures.test.ts`

Expected: FAIL because only the fresh-turn fixture exists.

- [x] **Step 3: Implement complete typed scenario fixtures**

Add explicit mode, viewer-turn, economy, stream-state, and action-offer facts. Reuse immutable base facts without mutating one scenario from another.

- [x] **Step 4: Write failing rendered-state tests**

Assert scenario controls render spent shapes/reasons, spectator waiting state, free-roam guidance, and caught-up Story/Debug state without exposing illegal actions.

- [x] **Step 5: Verify rendered-state tests fail**

Run: `npx vitest run src/concepts/session-combat/SessionCombatConcept.test.tsx`

Expected: FAIL because scenario selection is not wired.

- [x] **Step 6: Implement scenario selection and render rules**

Reset transient selection/dice state on scenario changes. Render only fixture-supplied economy/actions, active participant, mode, and stream state.

- [x] **Step 7: Verify and capture the state matrix**

Run all session-combat tests and capture the four added states at 1280×800, plus free roam at the 1024px floor.

### Task 6: Proposal verification

**Files:**

- Modify only files required by verification findings, with a failing regression test before each behavioral correction.

**Interfaces:**

- Consumes: the completed concept.
- Produces: verified local proposal and a concise observed contract-gap report.

- [x] **Step 1: Run focused and full verification**

Run `npx vitest run src/concepts/session-combat`, `npm run test:run`, and `npm run ci-check`.

- [x] **Step 2: Inspect the rendered deep link**

Review `?concept=session-combat` at 1280×800 and 1024×768 for overlap, action visibility, focus visibility, scroll behavior, and result concealment.

- [x] **Step 3: Produce the contract-gap report**

List only fixture fields used by the accepted interaction, grouped into current session wire, existing other wire, presentation-only, and missing provider contract. Do not propose exact proto messages until this report is reviewed.

- [x] **Step 4: Preserve detached state**

Do not commit or publish. Report the worktree path, test evidence, screenshot paths, and diff summary so the proposal can be modified or discarded safely.
