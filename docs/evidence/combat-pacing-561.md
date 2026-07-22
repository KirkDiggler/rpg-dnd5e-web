# Real-route evidence: combat-pacing round-one bench (#561)

Verifies the round-one `/concepts` → Combat Pacing bench (design.md §8's
acceptance bar): token-anchored vs. center-stage placement compared
against identical fixtures at the 1024×768 floor, a genuinely larger
real browser viewport, and a non-breaking narrow fallback below the
floor. **Updated after a PR #579 Copilot review** — see "PR #579 review
round" below for a real code fix (reduced-motion Cue-pulse suppression,
TDD'd) and an evidence correction (the original "larger frame" claim
was captured inside a single fixed 1024×768 real viewport and did not
actually demonstrate any spacing change; re-verified with genuinely
different real viewports).

## Environment

`npm run dev` from this branch's worktree (`feat/561-combat-pacing-concept`,
base `8579e47`), served at `http://localhost:3001/` (Vite picked 3001; port
5173 was in use). No backend required — the bench is fixture-first
(design.md §7); nothing here touches `rpg-api`/the live encounter route.
The route is not URL-addressable (`/concepts` in `App.tsx` is a
`currentView` state, not a router path) — reached the same way a human
would: load `/`, click the floating 🧪 "Open Concepts Lab" dev-tools
button (bottom-right, dev-only), then click the "Combat Pacing" sub-nav
button.

**Browser MCP tooling was unavailable in this session** ("Could not
connect to Chrome" — no `chrome-devtools` browser reachable at
`127.0.0.1:9222`). Fell back to this workspace's approved
Playwright harness (`game-dev/tools/browser/`, already used for prior
evidence docs — see `wall-fittings-536.md`), writing a dedicated driver
script (`game-dev/tools/browser/_job_combat_pacing_561.mjs`) that opens a
real headless Chromium page, clicks through the concept's own
`data-testid` hooks (scenario/pace/frame/reduced-motion buttons, Throw,
Skip), reads back computed DOM state (class lists, text content,
`data-placement`/`data-beat` attributes), and screenshots each step. This
is a real, driven browser session — not code inspection — but it is
worth being explicit that a person did not manually watch a live browser
window; a scripted Chromium instance did, and I (the agent) read back
its screenshots and captured DOM state directly rather than eyeballing a
GUI in real time. Console messages were captured via Playwright's
`page.on('console'/'pageerror')` for the full session.

## What I viewed

All 8 of Step 5's checks were exercised on the 1024×768 floor frame
(default) unless stated otherwise, on the `player-hit`/`player-crit`/
`player-nat1`/`player-miss` scenarios (SCENARIOS[0..3]):

1. **Die tumble (Throw beat).** `player-hit`, advanced to `armed` (the
   sequencer's own cue timer got there automatically), clicked the 🎲
   Throw button. Immediately after (80ms into the 600ms cinematic throw
   window) the die element's class was `beat-die beat-die--tumbling` —
   confirmed via both the computed class (not just the unit-test's
   assertion that the class exists) and a screenshot
   (`01-player-hit-throw-tumbling.png`) showing the 🎲 mid-animation.
   `base.css` confirms `.beat-die--tumbling` applies the same
   `@keyframes dice-roll` animation `DiceRoller.tsx` already ships, so
   this is a real spin/scale, not a static emoji.

2. **Crit gold (Verdict/Impact).** Clicked `player-crit`, let the
   sequencer auto-advance from `cue`→`armed`→(auto-throw or a single
   Skip click while in `armed`, which per `useBeatSequencer.ts` jumps
   straight to `verdict`)→`verdict`. Verdict class was
   `beat-verdict beat-verdict--crit`, text `CRIT (20+5 vs AC 16)`.
   Screenshot `02-player-crit-verdict.png` shows a gold stamp with a
   visible glow (matches `.beat-verdict--crit`'s `box-shadow` +
   `animation: glow`). Then — **without a second Skip click** — waited
   for the sequencer's own verdict-duration timer to auto-advance to
   `impact` (a hit's `runVerdict` calls `runImpact` on its own timeout;
   clicking Skip again while still in `verdict` would instead call
   `finishGroup()` per the hook's own branching and jump PAST impact to
   `done`, since this fixture has exactly one correlation group — this
   is a real behavior of the state machine I had to work around in the
   driver script, not a discrepancy in the concept itself). At `impact`,
   damage class was `beat-damage beat-damage--crit`, text `-14`,
   rendered visibly larger and gold in the screenshot
   (`02-player-crit-impact.png`), not the plain red `beat-damage` color.

3. **Nat-1 red-crack (Verdict).** Clicked `player-nat1`, one Skip click
   from `cue`/`armed` reached `verdict`. Class
   `beat-verdict beat-verdict--nat1`, text `NAT-1 (1+5 vs AC 16)`.
   Screenshot `03-player-nat1-verdict.png` shows a flat red stamp,
   visually distinct from both the crit's gold glow (different color,
   no box-shadow glow) and from a plain miss's gray (below). `base.css`
   confirms `.beat-verdict--nat1` uses `#ef4444` (red) with a
   `nat1-crack` wobble keyframe, vs. crit's `#facc15` (gold) glow and
   miss's `#9ca3af` (gray) — three genuinely distinct treatments.

4. **Hit vs. miss differentiation.** Re-checked `player-hit` (class
   `beat-verdict--hit`, screenshot `04-player-hit-verdict.png`) then
   `player-miss` (class `beat-verdict--miss`, text
   `MISS (8+5 vs AC 16)`, screenshot `04-player-miss-verdict.png`).
   `base.css`'s own header comment and the color values
   (`--hit: #f87171`, `--miss: #9ca3af`, `--crit: #facc15`) are stated to
   match `CombatLog.tsx`'s `lineStyle()` exactly — confirmed by reading
   `CombatLog.tsx` directly (`#facc15`/`#f87171`/`#9ca3af`, same hexes).
   Visually, HIT renders in the same red-ish tone as MISS's neighbor-gray
   is clearly not — the two screenshots side by side make the
   differentiation obvious (red-ish HIT badge vs. flat gray MISS badge).

5. **Placement/promotion.** On `player-crit` at `verdict`, both
   `beat-stage` elements reported `data-placement="center-stage"` (read
   via `evaluateAll` against the DOM, not inferred from a screenshot
   alone) — screenshot `02-player-crit-verdict.png`/
   `combat-pacing-561-center-stage.png` shows the LEFT (token-anchored)
   and RIGHT (pure center-stage) columns with the SAME blue accent
   border treatment (`.beat-stage--center-stage`'s
   `border-color: var(--accent-primary)`), i.e., a real visual match, not
   just a matching attribute. Repeated for `player-nat1` — same result
   (`05-nat1-promotion-both-columns.png`, both `center-stage`). Then
   switched to `player-hit` (no promotion): DOM read back
   `["token-anchored", "center-stage"]` — the LEFT column visibly lost
   the accent border in `combat-pacing-561-token-anchored.png` while the
   RIGHT column (which never moves) kept it, exactly the "left now reads
   differently from right" the brief asks to confirm.

6. **Reduced motion.** Toggled "Reduced motion: on", re-ran `player-crit`
   through Throw: die class during what would have been `throw` was
   `beat-die beat-die--settled` (not `--tumbling`) —
   `06-reduced-motion-throw.png`. The `beat-stage` element's class
   gained `beat-stage--reduced-motion`, and `base.css` confirms
   `.beat-stage--reduced-motion .beat-verdict--crit { animation: none; }`
   (same for `--nat1`) — i.e., the crit glow/nat-1 wobble keyframes are
   suppressed by this class while the gold/red color and box-shadow
   (non-animated parts) remain, matching design.md §4's "nothing about
   what happened is lost, only the motion." A static screenshot cannot
   show the ABSENCE of animation directly, so this claim originally
   rested only on the DOM class list + reading the CSS text. **PR #579
   review round found this incomplete — see "PR #579 review round"
   below**: the Cue beat's `armed-pulse` text pulse was NOT suppressed by
   `.beat-stage--reduced-motion` (no such CSS rule existed), a real gap
   a reviewer caught and this round fixed with a computed-style check,
   not just a class-list check. Toggled reduced motion back off, re-ran
   `player-hit`'s Throw: die class reverted to `beat-die--tumbling`
   (`06-reduced-motion-off-again-throw.png`) — animations returned.

7. **Manual pace-control verification.** Clicked each of `default`,
   `cinematic`, `brisk`, `instant` in turn on `player-hit`, waited 1.5s,
   and read the "Group N / M — beat: X" line each time:
   `default` → `beat: done`, `cinematic` → `beat: armed`, `brisk` →
   `beat: armed`, `instant` → `beat: done`. None were stuck at `cue` —
   this is the by-eye (screenshotted:
   `07-pace-default.png`/`07-pace-cinematic.png`/`07-pace-brisk.png`/
   `07-pace-instant.png`) confirmation that Task 4's `useMemo` fix for
   the scenario-object-identity bug holds: before that fix, every
   non-default override would have re-triggered `useBeatSequencer`'s
   scenario-changed effect on every render and re-frozen the display at
   `cue` forever.

8. **Frame checks — ORIGINAL CLAIM WAS NOT ACTUALLY VERIFIED, corrected
   below.** Clicked each of `floor`/`typical`/`full`/`narrow` in turn on
   `player-hit` and claimed "the layout breathes upward at larger
   frames." **This was wrong to state as verified**: the entire
   Playwright session ran inside a single real browser viewport fixed at
   1024×768 (`newPageAt(1024, 768)`, never resized). The concept's
   in-page frame buttons set an inner box's CSS `width` with
   `maxWidth: '100%'` — inside a real 1024px-wide viewport, requesting a
   1920×1080 or 1440×900 inner frame cannot render wider than the real
   viewport allows, so `08-frame-typical.png`/`08-frame-full.png` show
   the IDENTICAL layout as `08-frame-floor.png` (confirmed by re-running
   this exact comparison in the PR #579 review round — see below: at a
   real 1024×768 viewport, selecting the `full` frame button produces a
   pixel-identical 960px-wide frame box, not a wider one). This is
   corrected in "PR #579 review round" below with genuinely different
   real browser viewports. The narrow-fallback half of this claim
   (480×640 not clipping/overlapping) remains valid on its own terms —
   480 is smaller than the 1024 real viewport this session used, so no
   viewport-vs-frame conflation affected it — but was independently
   re-verified at a real 480×640 viewport below anyway, for rigor.

## PR #579 review round (2026-07-22, commit after `89fda43`)

A Copilot review on PR #579 caught two real issues, both addressed here
with fresh, honest verification rather than papering over the original
evidence's gaps:

### 1. Reduced-motion cue pulse (code bug, fixed with TDD)

**The bug**: `.beat-cue`'s `armed-pulse` animation had no
`.beat-stage--reduced-motion` override in `base.css` — reduced motion
suppressed the die tumble and the crit/nat-1 verdict animations but NOT
the Cue beat's own pulsing text, contradicting design.md §4's "nothing
about what happened is lost, only the motion" (motion should stop
everywhere, not selectively).

**TDD**: added
`src/concepts/combat-pacing/reducedMotionCss.test.ts`, a focused test
that reads `public/themes/base.css` directly (this repo's theme CSS is a
static file, not a CSS module — there's no compiled artifact to import
into jsdom, so reading the source text and asserting the reduced-motion
selector's declaration block is the most direct contract check
available, matching this repo's existing CSS-guard convention of
grep-checking `dist/themes/base.css` in `scripts/ci-check.sh`, web#563).

- **RED**: `npx vitest run src/concepts/combat-pacing/reducedMotionCss.test.ts`
  — 1 of 4 tests failed: `.beat-stage--reduced-motion .beat-cue rule must
exist: expected undefined to be defined`. The other 3 (crit/nat1
  suppression regression guards, base `.beat-cue` still animated)
  already passed, confirming the test correctly isolated only the real
  gap.
- **Fix**: added
  `.beat-stage--reduced-motion .beat-cue { animation: none; }` to
  `base.css`, next to the existing crit/nat1 reduced-motion rules.
- **GREEN**: same command, 4/4 passed.
- Also corrected the same CSS block's header comment, which claimed
  "this codebase has none [`@media` queries] (verified)" — false; the
  reviewer pointed out `src/character/sheet/dnd-sheet.css` has three
  (`max-width: 1024px`/`768px`/`print`), confirmed by grep. Reworded to
  "this change adds no new `@media` query" (true) instead of the
  repo-wide claim (false).

**Real-browser confirmation** (not just the CSS-text test): opened a
fresh Playwright page and, in-page-JS, rendered the exact class
combinations `BeatStage.tsx` produces and read `getComputedStyle`
directly against the app's own loaded `base.css`:

```
Cue computed animation-name, normal:         armed-pulse
Cue computed animation-name, reduced motion: none
Verdict computed animation-names: { critNormal: 'glow', critReduced: 'none',
  nat1Normal: 'nat1-crack', nat1Reduced: 'none' }
```

Then confirmed the same thing in the LIVE running sequencer (not a
synthetic DOM injection): toggled "Reduced motion: on" before selecting
`player-crit`, read `getComputedStyle(cueElement).animationName`
immediately after the click (within the 150ms cinematic cue window) —
result: `none`. Screenshot: `reduced-motion-cue-live.png` (not
committed — see "Screenshots" below for what's committed vs. kept as
scratch evidence).

### 2. Real browser viewport vs. in-page simulated frame (evidence correction)

Re-ran verification using genuinely different **real Playwright browser
viewports**, not just the in-page frame selector, to check whether
spacing actually changes:

| Real viewport | In-page frame clicked | `beat-stage` width    | frame box width       |
| ------------- | --------------------- | --------------------- | --------------------- |
| 1024×768      | `floor` (1024×768)    | 450px                 | 960px                 |
| 1024×768      | `full` (1920×1080)    | 450px (**unchanged**) | 960px (**unchanged**) |
| 1920×1080     | `full` (1920×1080)    | 610px                 | 1280px                |
| 1440×900      | `typical` (1440×900)  | 610px                 | 1280px                |
| 480×640       | `narrow` (480×640)    | 178px                 | 416px                 |

This confirms the original evidence's claim ("the layout breathes upward
at larger frames") was **not actually demonstrated** — row 2 proves
that inside the SAME 1024×768 real viewport the original session ran in
the whole time, clicking `full` changes nothing. Rows 3-4 prove the
layout genuinely does get more room, but only when the REAL browser
viewport is also larger (1280px is the app's own `max-w-7xl` content-width
cap, not the frame's literal 1920px request — a real, if unsurprising,
ceiling). Row 5 confirms the narrow fallback holds at a genuinely narrow
real viewport too (both `BeatStage` columns still side by side, no
clipping — screenshot below), not just an inner box inside a spacious
1024-wide window.

Command: `node game-dev/tools/browser/_job_combat_pacing_561_viewport.mjs`
— launches 5 separate Playwright pages, each at a different real
`viewport: { width, height }`, drives to Combat Pacing, clicks the
stated frame button, measures `boundingClientRect()` on the rendered
`beat-stage` elements and their frame-box ancestor, and screenshots each.
Console: 0 non-backend errors across all 5 pages (30 total console
entries per page, all `ERR_CONNECTION_REFUSED`/"Failed to fetch" from
the same pre-existing lobby/character API calls noted below — none from
combat-pacing code).

**Corrected screenshots** (see "Screenshots" below): the previous
`combat-pacing-561-narrow.png` (captured at a real 1024×768 viewport with
only the in-page frame set to narrow) is replaced with a full-page
screenshot from a genuinely narrow real 480×640 viewport. A new
`combat-pacing-561-large-viewport.png` is added, captured at a real
1920×1080 viewport with the in-page frame also set to `full` — this is
the first evidence in this doc that actually demonstrates the layout
getting more breathing room at a larger size, both by measurement (table
above) and visually (wider gap between the two `BeatStage` columns,
more surrounding whitespace).

**Honest limitations:**

- This verifies the round-one fixture-driven `/concepts` bench only. It
  proves nothing about production stream/reconnect behavior, the live
  `EncounterView` route, or how a real `AttackResolved`/`EntityDamaged`
  pair would reassemble outside this concept's closed, authored fixture
  list (`CONTRACT.md` §1 already flags this explicitly).
  No changes were made to `rpg-api`, `encounterStreamDispatch.ts`, or any
  live-encounter component in this task.
- The pre-existing `ERR_CONNECTION_REFUSED` console errors seen during
  the driven session are all from the app's OWN header/lobby/character
  API calls (`GetMyActiveLobby`, `ListRaces`, `ListClasses`,
  `ListBackgrounds`, `ListCharacters`, `ListDrafts`) firing because no
  backend was running — expected and unrelated to `/concepts` or
  combat-pacing, which needs no backend. No console errors or warnings
  originated from `CombatPacingConcept.tsx`, `BeatStage.tsx`,
  `useBeatSequencer.ts`, or `fixtures.ts` during any of the above,
  including the PR #579 review round's additional sessions.
- `opportunity-attack`, `npc-grunt-swing`, `npc-boss-swing`, and
  `repeated-attacks` scenario buttons exist and were visible in every
  screenshot's scenario row but were not individually driven through a
  full beat cycle in this pass — Step 5's 8 checks are all scoped to
  `player-hit`/`player-miss`/`player-crit`/`player-nat1`, and this
  evidence doc follows that scope rather than exercising all 8 fixtures.
- The original pass of this doc claimed item 8's larger-frame spacing
  claim was verified when it was not (see "PR #579 review round" above)
  — corrected here rather than removed, so the mistake and its fix are
  both on the record.
- The reduced-motion Cue-pulse gap (see "PR #579 review round" above) was
  a real, if minor, regression: only found by a reviewer, not by the
  original verification pass. Fixed with a failing test first
  (`reducedMotionCss.test.ts`, RED→GREEN), then confirmed against real
  computed styles in a live browser session, not just the CSS text.
- Screenshots in this doc/repo are all real Playwright captures of a
  real rendered page; the additional computed-style checks in the PR
  #579 review round used `page.evaluate`/`getComputedStyle` against the
  live DOM in the same real browser, not a mock or jsdom simulation.

## Screenshots

- `combat-pacing-561-token-anchored.png` — `player-hit` at `verdict`:
  left column plain-bordered (token-anchored, not promoted), right
  column accent-bordered (pure center-stage). (Real viewport 1024×768,
  in-page frame `floor` — no viewport/frame conflation, since 1024
  matches the frame's own request exactly.)
- `combat-pacing-561-center-stage.png` — `player-crit` at `verdict`:
  both columns accent-bordered (token-anchored promoted to match pure
  center-stage). (Same 1024×768 real viewport / `floor` frame.)
- `combat-pacing-561-narrow.png` — **replaced in the PR #579 review
  round**: now a full-page screenshot from a genuinely narrow REAL
  480×640 browser viewport (previously: a real 1024×768 viewport with
  only the in-page frame set to narrow — not wrong per se, since 480 <
  1024 needs no viewport help to render correctly, but re-captured at a
  real narrow viewport anyway for consistency with the large-viewport
  fix and to match what an actual narrow device would show). Both
  `BeatStage` columns still render side by side, no clipping/overlap;
  measured bounding boxes: left column `x:40,width:178`, right column
  `x:242,width:178` (24px gap between them, matching the CSS `gap`).
- `combat-pacing-561-large-viewport.png` — **new in the PR #579 review
  round**: a real 1920×1080 browser viewport with the in-page frame also
  set to `full`. This is the evidence that actually demonstrates the
  layout getting more room at a genuinely larger size (frame box
  960px→1280px, `beat-stage` 450px→610px vs. the 1024×768/`floor`
  screenshots above — see the measurement table in "PR #579 review
  round").
- `combat-pacing-561-instant-persisted.png` — **new in the PR #579
  final-review fix**: `player-crit` with `Pace: instant` clicked — both
  columns show the gold `CRIT (20+5 vs AC 16)` verdict and `-14` gold
  damage, no die/cue theater. Confirms `persistResult` (see above).
- `combat-pacing-561-instant-scenario-switch.png` — **new in the PR
  #579 second final-review fix**: `Pace: instant` selected on
  `player-hit` FIRST, then switched to `player-crit` via the scenario
  buttons WITHOUT re-clicking the pace override — both columns
  immediately show `CRIT (20+5 vs AC 16)` / `-14`, proving the
  `useBeatSequencer` groups-as-state root fix (see below): no stale
  `HIT`/`-7` from the previous scenario.

Additional screenshots from the same driven sessions (not required by
the brief's file list, kept only as the underlying evidence trail for
this doc's claims) live under
`/tmp/opencode/combat-pacing-evidence/` (not committed —
`game-dev`'s own workspace, outside this repo).

## PR #579 final-review fix (2026-07-22, Instant-mode persisted result)

A broad-review "Important" finding on PR #579: `pace='instant'` drove
`useBeatSequencer` straight to `beat='done'` (unchanged, correct — see
`startGroup()` in `useBeatSequencer.ts`), but `BeatStage` rendered
NOTHING for `done` — Instant mode showed a blank stage instead of the
authoritative verdict/damage, violating design.md §8: "the authoritative
outcome is always shown, even in Instant mode." Instant is meant to be
"log-only ... a real escape hatch that always shows a readable result"
(design.md §4), not a silent one.

**Fix scope, explicitly presentation-only**: `useBeatSequencer.ts`,
`fixtures.ts`, the production stream, and game rules were NOT touched.
`BeatStage.tsx` gained a `persistResult?: boolean` prop (default
`false`) — when `true` and `beat === 'done'`, it renders the same
verdict block `verdict`/`impact`/`release` already render, plus the
damage block for a hit, instead of nothing. `CombatPacingConcept.tsx`
computes `isInstant = effectiveScenario.pace === 'instant'` and passes
`persistResult={isInstant}` to BOTH `BeatStage`s, preserving the
existing exactly-one-announces split unchanged (token-anchored
announces, center-stage does not).

**TDD, `BeatStage.test.tsx`** (RED first, confirmed failing for the
right reason — "Unable to find an element by: `[data-testid="beat-verdict"]"`
— before any implementation, then GREEN):

- default `done` with `persistResult` omitted (false) still renders
  nothing — the existing "renders no beat-specific content during done"
  test is unaffected; a new explicit test names the default case
  directly.
- `done` + `persistResult` shows the HIT verdict AND its damage (`-7`).
- `done` + `persistResult` shows the CRIT verdict AND oversized/gold
  damage (`beat-damage--crit`).
- `done` + `persistResult` on a MISS shows the verdict with NO damage
  element (misses never carry an `EntityDamaged`).
- `done` + `persistResult` renders no `beat-cue`/`beat-die` — no
  tumble/cue theater, matching the finding's wording exactly.
- the persisted verdict still announces (`role=status`) by default and
  respects `announce={false}`, unchanged from every other beat.

RED: `npx vitest run src/concepts/combat-pacing/BeatStage.test.tsx` — 5
failed (`Unable to find an element by: [data-testid="beat-verdict"]`) /
24 passed before implementation. GREEN after adding `persistResult`:
29/29.

**TDD, `CombatPacingConcept.test.tsx`**: one new failing test —
"Instant pace still shows the authoritative verdict/damage on both
placements, with exactly one announcement" — asserts, after clicking
`pace-override-instant` on the default `player-hit` scenario, both
`beat-stage` elements report `data-beat="done"`, both render a
`beat-verdict` containing `HIT` and a `beat-damage` containing `7`, zero
`beat-cue`/`beat-die` elements exist anywhere, and exactly one of the two
verdicts carries `role="status"`. RED: failed at
`screen.getAllByTestId('beat-verdict')` finding zero elements (both
stages were empty, as expected pre-fix) — 1 failed / 12 passed. GREEN
after wiring `persistResult={isInstant}`: 13/13.

**Full targeted + suite verification**: `npx vitest run
src/concepts/combat-pacing` → 76/76 (68 pre-existing + 8 new: 6 in
BeatStage.test.tsx, 1 in CombatPacingConcept.test.tsx, plus the existing
instant-override test unaffected). Full repo suite: `npx vitest run` →
1119/1119 (64 test files), no new failures. `npm run build` succeeds.
`npm run ci-check` → format, lint, typecheck, build, and the full test
suite all pass.

**Real-browser confirmation** (`game-dev/tools/browser/
_job_combat_pacing_561_instant_persist.mjs`, a fresh driver in this
workspace's approved Playwright harness — `chrome-devtools` browser MCP
was still unavailable this session, same "Could not connect to Chrome"
as the original evidence pass): opened `/concepts` → Combat Pacing at a
real 1024×768 viewport, selected `player-hit` (default scenario, hit +
`-7` damage), clicked `Pace: instant`, and read back the live DOM —
both `beat-stage` elements report `data-beat="done"`; both render
`beat-verdict` text `HIT (14+5 vs AC 16)`; only the token-anchored
stage's verdict carries `role="status"` (`[status, null]`); both render
`beat-damage` text `-7`; zero `beat-cue`/`beat-die` elements exist
anywhere on the page. Separately, selected `player-crit` FIRST (letting
its own cue/armed/etc. beats run under the still-`cinematic` pace),
THEN clicked `Pace: instant` — both stages show `CRIT (20+5 vs AC 16)`
with class `beat-verdict--crit`, and `-14` damage with class
`beat-damage--crit` (oversized/gold), confirming the fix also carries a
crit's full styling into Instant mode, not just a plain hit. Screenshot:
`combat-pacing-561-instant-persisted.png` (committed below) shows the
crit case — gold `CRIT (20+5 vs AC 16)` stamp and `-14` gold damage on
BOTH columns, no die/cue visible anywhere on the page.

**A real bug found while writing the prior evidence pass — now FIXED,
not just flagged** (see "PR #579 second final-review fix" below for the
full RED/GREEN root-cause fix): switching scenarios via the scenario
buttons WHILE a `Pace: instant` override is already active previously
did not update the displayed verdict/damage — the stage kept showing the
PREVIOUS scenario's attack data even though the event inspector (which
reads `scenario.events` directly, not through the sequencer) correctly
showed the new scenario's fixture events.

**Honest limitations:**

- Same scope as every other section of this doc: fixture-driven
  `/concepts` bench only, nothing about the production stream or a live
  `AttackResolved`/`EntityDamaged` reassembler.
- This fix only changes what `BeatStage` renders for a terminal `done`
  beat under `persistResult` — it does not change `useBeatSequencer`'s
  timing, `fixtures.ts`, or any game rule, per the task's explicit scope
  fence.
- Console messages during this pass: same pre-existing
  `ERR_CONNECTION_REFUSED` lobby/character API noise as every prior
  session (no backend running); zero errors from
  `CombatPacingConcept.tsx`/`BeatStage.tsx`/`useBeatSequencer.ts`/
  `fixtures.ts`.

## PR #579 second final-review fix (2026-07-22, Instant scenario-switch staleness — root-caused and fixed)

The concern flagged above was re-scoped as IN-SCOPE ("the concept
exposes both scenario selection and persistent pace override, so it
must be fixed before final approval") and root-caused rather than left
as a note.

### Root cause

`useBeatSequencer`'s `group`/`groupCount` (returned to consumers) were
derived by reading `groupsRef.current[groupIndex]` at render time —
`groupsRef` is a plain `useRef`, mutated directly
(`groupsRef.current = groupByCorrelation(scenario.events)`) whenever the
scenario changes. A ref mutation is invisible to React; it only becomes
visible to a component's next render if SOMETHING ELSE triggers that
render. The scenario-changed effect also calls `setBeat('done')` (via
`startGroup`'s `pace === 'instant'` branch) and `setGroupIndex(0)` —
normally these are real value changes that trigger a render on their
own. But when the PREVIOUS scenario was ALSO already `pace: 'instant'`
at `beat: 'done'`, `groupIndex: 0`, both `setBeatState('done')` and
`setGroupIndexState(0)` are same-value updates; React bails them via
`Object.is` and schedules NO render at all — so the freshly mutated
`groupsRef.current` (correctly holding the new scenario's groups) is
never re-read, and the component keeps showing the OLD group's
verdict/damage indefinitely, until some unrelated state change finally
forces a render.

Confirmed via a `renderHook` probe against the **unmodified** pre-fix
`useBeatSequencer.ts` (verified with `git stash` before writing any of
this task's code, to be certain the bug predates every earlier fix in
this doc): rendering with a `pace: 'instant'` `player-hit` scenario,
then rerendering with a DIFFERENT `pace: 'instant'` `player-crit`
scenario, left `result.current.group?.attack?.critical` at `false`
(should be `true`) and `attackRoll` at `14` (should be `20`) — the
returned `group` never updated.

### Fix — clear state ownership, not a force-render hack

`groups` (the scenario's events split into correlation groups) is now
real `useState`, following the SAME dual ref+state pattern the file
already uses for `beat`/`beatRef` and `groupIndex`/`groupIndexRef`:

```ts
const [groups, setGroupsState] = useState<BeatGroupResult[]>(() =>
  groupByCorrelation(scenario.events)
);
const groupsRef = useRef<BeatGroupResult[]>(groups);
const setGroups = (g: BeatGroupResult[]) => {
  groupsRef.current = g;
  setGroupsState(g);
};
```

The scenario-changed effect branch now calls `setGroups(...)` instead of
a bare `groupsRef.current = ...` mutation; the hook's return statement
reads `groups[groupIndex]`/`groups.length` (state) instead of
`groupsRef.current[groupIndex]`/`.length` (ref). `groupsRef` is kept
alongside, in lockstep, purely for the engine functions
(`startGroup`/`runVerdict`/`runImpact`/`runRelease`/`finishGroup`/
`skip`/`throwDie`) that run synchronously from timer callbacks and need
the CURRENT groups at call time — a ref mutation is visible immediately;
a `useState` setter's new value is only visible on the NEXT render, too
late for those callers. This is the same reason the file already keeps
`beatRef`/`groupIndexRef` alongside `beat`/`groupIndex` state — `groups`
now follows the identical, already-established pattern rather than
introducing a new one.

Why this actually fixes it: `groupByCorrelation()` always returns a
FRESH array (`.map()` over a `Map`), never `Object.is`-equal to the
previous array — so `setGroupsState(newGroups)` can never be bailed by
React's same-value short-circuit, regardless of what `beat`/`groupIndex`
happen to do in the same pass. A render is now guaranteed on every
genuine scenario change.

**Explicitly rejected alternative**: an unexplained force-render
counter (e.g. `const [, bump] = useState(0); bump((n) => n + 1);`) would
also have "worked," but would hide WHY behind an opaque tick with no
real ownership — the chosen fix instead gives `groups` its own honest
piece of state, on its own independent axis of change from
`beat`/`groupIndex`, matching the file's existing ownership model.

### TDD

**`useBeatSequencer.test.ts`** (hook-level, isolates the exact
same-value-state mechanism): new test "rerendering with a DIFFERENT
scenario that also lands on the SAME beat/groupIndex values
('done'/0, both Instant) still returns the NEW group — not a stale
prior one." RED (confirmed by temporarily `git checkout`-ing the
pre-fix hook, running the test, then restoring the fix from a backup
copy — not by inspection): 14 passed / **1 failed** —
`expected false to be true` on `result.current.group?.attack?.critical`
(still `false`, i.e. still the player-hit fixture, after switching to
player-crit). GREEN after the fix: **15/15**.

**`CombatPacingConcept.test.tsx`** (integration-level, the exact
user-facing repro from the task): two new tests —

1. "switching scenarios while Instant remains selected immediately
   shows the NEW scenario's verdict/damage, not a stale prior one" —
   selects Instant on the default `player-hit`, confirms `HIT`/`-7` on
   both stages, then clicks `scenario-button-player-crit` WITHOUT
   touching the pace override, and asserts both stages immediately show
   `CRIT`/`-14` (`beat-verdict--crit`/`beat-damage--crit`), with the
   `HIT (14`/`7` text gone, no `beat-cue`/`beat-die` anywhere, and
   exactly one `role=status` announcement.
2. "switching scenarios while Instant remains selected also updates
   correctly for a scenario with NO damage (player-miss)" — same
   pattern, switching to `player-miss` (no `EntityDamaged` fixture at
   all) and asserting the damage element disappears entirely, not just
   changes value.

RED (before the hook fix, with only the two new tests + old hook):
**2 failed / 13 passed** — `expected 'HIT (14+5 vs AC 16)' to contain
'CRIT'` and `expected 'HIT (14+5 vs AC 16)' to contain 'MISS'`, both the
right failure for the right reason (stale prior verdict, exactly the
reported bug). GREEN after the fix: **15/15**.

### Full verification

- Targeted: `npx vitest run src/concepts/combat-pacing` → **79/79**
  (76 prior + 3 new: 1 hook test, 2 concept tests).
- Full repo suite: `npx vitest run` → **1122/1122** (64 test files), no
  regressions — explicitly re-confirmed the pre-existing
  `reducedMotion`-restart tests (timer cleanup, "never replay an
  already-completed earlier correlation group") still pass unchanged,
  since those are the tests most likely to catch a state-ownership
  refactor breaking something subtle.
- `npm run build` → succeeds.
- `npm run ci-check` → format/lint/typecheck/build/tests all pass
  (format failed once on a doc-comment line length; `npm run format`
  fixed it, reconfirmed passing before commit).

### Browser re-verification (real Playwright session)

`chrome-devtools` browser MCP unavailable again this round ("Could not
connect to Chrome") — same fallback, a new driver script
`game-dev/tools/browser/_job_combat_pacing_561_instant_switch.mjs`
(untracked scratch file, this directory's existing convention) against
the live `npm run dev` app. Sequence, WITHOUT ever re-clicking the pace
override after the first click:

1. `player-hit` + click `Pace: instant` → both stages `HIT (14+5 vs AC 16)`
   / `-7`.
2. Click `scenario-button-player-crit` (pace override untouched, still
   `instant`) → both stages IMMEDIATELY read
   `CRIT (20+5 vs AC 16)` / `-14`, `beat-verdict--crit` /
   `beat-damage--crit` — no stale `HIT`/`-7` anywhere. Screenshot:
   `combat-pacing-561-instant-scenario-switch.png` (committed below).
3. Click `scenario-button-player-miss` → both stages immediately read
   `MISS (8+5 vs AC 16)`, zero `beat-damage` elements (miss has no
   `EntityDamaged` at all — not just a `0` value, the element itself is
   absent, matching `BeatStage`'s existing damage-gating).
4. Click `scenario-button-player-nat1` → both stages immediately read
   `NAT-1 (1+5 vs AC 16)`, `beat-verdict--nat1`, zero damage.

Every step: `data-beat="done"` on both stages, exactly one
`role="status"` (`[status, null]`), zero `beat-cue`/`beat-die` elements.
Console: only the same pre-existing `ERR_CONNECTION_REFUSED`
lobby/character API noise every session logs (no backend running) —
zero errors from any combat-pacing file.

### Concerns

None outstanding for this specific finding — it is fixed, tested at
both the hook and integration level, and confirmed live. General
honest-limitations notes from the rest of this doc still apply
(fixture-driven `/concepts` bench only, no live-stream reassembler).

## Kirk's first interactive-review iteration (2026-07-22, faceted d20 + suspenseful reveal)

Two pieces of approved feedback from Kirk's first live look at PR #579:
replace the generic 🎲 emoji with a recognizable faceted d20, and make
the reveal substantially more suspenseful (routine Cinematic hit ≈5s,
miss ≈4s, crit 6–7s; Brisk stays proportionally shorter; Instant stays
immediate). `AUTO_THROW_TIMEOUT_MS` (the `armed` agency-pause timeout)
is explicitly UNCHANGED this round — Kirk asked to tune it separately.

### 1. Timing — exact new targets (TDD, hook-level)

**RED**: rewrote `useBeatSequencer.test.ts`'s per-beat assertions to the
new exact millisecond targets (Cinematic 300/2000/1600/900/300,
Brisk exact-half 150/1000/800/450/150, crit extras Verdict+1000/
Impact+500) before touching `useBeatSequencer.ts` — `npx vitest run
src/concepts/combat-pacing/useBeatSequencer.test.ts` failed 9/17 for
exactly the expected reason (old low-end-of-range constants still in
place: e.g. "expected 'armed' to be 'throw'" at the new 300ms cue mark,
"expected 'done' to be 'verdict'" for the new exact-half Brisk-total
tests).

**GREEN**: updated `CINEMATIC`/`BRISK`/`CRIT_IMPACT_EXTRA_MS` in
`useBeatSequencer.ts` (`CRIT_VERDICT_EXTRA_MS` stays `1000`, already
correct) — `17/17` passed, including two brand-new exact-total Brisk
tests (2550ms hit / 2100ms miss) that didn't exist before this
iteration. `CombatPacingConcept.test.tsx`'s own timing-dependent
`advanceTimersByTime` calls (cue/throw waits for the pace-override and
reduced-motion regression guards) were updated to the same new values —
RED confirmed first (5/15 failed against the old test values once the
hook's constants had changed), then GREEN (15/15) after updating the
test file's numbers to match.

### 2. Faceted d20 component (TDD, new file)

**RED**: wrote `D20Die.tsx`'s test file, `D20Die.test.tsx`, FIRST — 12
tests covering a recognizable polygon silhouette + facet lines,
`currentColor`/no hardcoded color, responsive `viewBox` sizing (no fixed
`width`/`height`), hidden `?` face while `revealed=false`, the
authoritative face once `revealed=true`, tumble-class gating (only when
`tumbling && !reducedMotion`), `aria-hidden` decorative semantics, and
"the same face renders identically regardless of when it's revealed."
`npx vitest run src/concepts/combat-pacing/D20Die.test.tsx` failed to
even resolve — `Failed to resolve import "./D20Die"` — confirmed RED for
the right reason (component didn't exist yet).

**GREEN**: implemented `D20Die.tsx` — a flat-top hexagon `<polygon>`
silhouette plus six center-to-vertex `<line>` facets (all
`stroke="currentColor"`), a `<text>` face showing `?` while hidden or
the authoritative `face` prop once revealed, `viewBox="0 0 100 100"`
with no `width`/`height` attribute (sizing delegated to `.d20-die`'s
CSS `clamp()`), and `aria-hidden="true"` on the root `<svg>`. First run:
10/12 passed, 2 failed — both false negatives from reading `.className`
on an `SVGAnimatedString` (SVG elements' `.className` is NOT a plain
string in the DOM, unlike HTML elements) rather than a real component
bug; fixed the TEST to read `.getAttribute('class')` instead — 12/12
green after that correction, no component code changed for those two.

### 3. Wiring into `BeatStage` (TDD, integration)

**RED**: updated `BeatStage.test.tsx` — replaced the emoji-glyph
assertions with `D20Die`-aware ones (facet/silhouette presence, hidden
`?` during armed/throw, landed face at verdict/impact/release), added
new tests for "d20 stays visible and settled through impact/release"
and "never renders during cue," and — deliberately breaking an
EXISTING round-one test — rewrote "renders no cue/die theater when done
with persistResult" into "renders no cue theater ... but shows the
landed d20 face immediately, settled," since Kirk's brief explicitly
asks Instant to reveal the die too, not just the verdict/damage text.
`npx vitest run src/concepts/combat-pacing/BeatStage.test.tsx` — 7
failed / 29 passed, all failures the expected `Unable to find an
element by: [data-testid="d20-silhouette"/"beat-die"]` (component still
rendering the old 🎲 emoji).

**GREEN**: `BeatStage.tsx` now renders `<D20Die>` inside the existing
`beat-die` wrapper across `armed`/`throw`/`verdict`/`impact`/`release`/
persisted-`done` (previously: `armed`/`throw` only, and NEVER during
verdict/impact/release/persisted-done) — `dieRevealed = beat !== 'armed'
&& beat !== 'throw'`, `dieTumbling = beat === 'throw'`. `36/36` passed.
Two `CombatPacingConcept.test.tsx` Instant-mode assertions
(`queryAllByTestId('beat-die')).toHaveLength(0)`) were similarly
rewritten to assert the die IS present with the correct landed face
(`14` for player-hit, `20` for player-crit) — this is the same
deliberate round-one-behavior-change Kirk's brief calls for, not a
regression.

### 4. `Roll d20` button label (TDD)

**RED**: added "labels the throw button 'Roll d20', not the generic 🎲
emoji" to `CombatPacingConcept.test.tsx` — failed with `expected '🎲
Throw' to contain 'Roll d20'`.

**GREEN**: changed the button's text from `🎲 Throw` to `Roll d20` in
`CombatPacingConcept.tsx`. One line.

### Full verification

- Targeted: `npx vitest run src/concepts/combat-pacing` → **101/101**
  (81 prior-in-this-iteration + a new `D20Die.test.tsx` file's 12 + the
  `Roll d20` label test + the die-integration tests above).
- Full repo suite: `npx vitest run` → **1144/1144** (65 test files, up
  from 64/1122 at the start of this iteration) — no regressions.
- `npm run typecheck` → passes.
- `npm run lint` → passes.
- `npm run format:check` → passes (three files needed `prettier --write`
  after the BeatStage/D20Die edits; re-ran clean before commit).
- `npm run ci-check` → format/lint/typecheck/build/tests all pass; the
  built theme CSS still carries the combat-HUD block guard.

### Real-browser confirmation (chrome-devtools MCP, this session — unlike every prior round in this doc, the browser MCP WAS available)

Restarted the worktree's `npm run dev` (a stale Vite HMR module graph
from mid-edit briefly 404'd `BeatStage.tsx`'s export — a fresh `npm run
dev` process cleared it; unrelated to any code correctness question).
Reached Combat Pacing via the same `/` → 🧪 "Open Concepts Lab" →
"Combat Pacing" path every prior round used.

**Observed timing** (real wall-clock, `performance.now()` deltas read
via an in-page JS driver — not fake timers, and not the tool round-trip
latency, which this driver runs independently of):

| Scenario                   | Beat                     | Target     | Observed   |
| -------------------------- | ------------------------ | ---------- | ---------- |
| player-hit, Cinematic      | cue                      | 300ms      | 312ms      |
| player-hit, Cinematic      | throw                    | 2000ms     | 2002ms     |
| player-hit, Cinematic      | verdict                  | 1600ms     | 1603ms     |
| player-hit, Cinematic      | impact                   | 900ms      | 904ms      |
| player-hit, Cinematic      | release                  | 300ms      | 302ms      |
| player-hit, Cinematic      | **total**                | **5100ms** | **5130ms** |
| player-miss, Cinematic     | **total** (skips impact) | **4200ms** | **4229ms** |
| player-crit, Cinematic     | verdict (+crit)          | 2600ms     | 2605ms     |
| player-crit, Cinematic     | impact (+crit)           | 1400ms     | 1402ms     |
| player-crit, Cinematic     | **total**                | **6600ms** | **6629ms** |
| player-hit, Brisk override | **total**                | **2550ms** | **2582ms** |

All within ~0.5-1.3% of target — ordinary `setTimeout` jitter in a real
browser tab, not a systematic drift. Every total lands in Kirk's stated
band (hit ≈5s, miss ≈4s, crit 6-7s, Brisk visibly shorter than
Cinematic).

**Hidden-face contract, confirmed live, not just in jsdom**: during the
crit run above, `d20-face` textContent was read at `armed`, twice mid-
`throw` (once right as `throw` started, once 500ms later), and never
showed anything but `?` — the authoritative `20` first appeared exactly
at the `verdict` transition and stayed through `impact`/`release`. Tap
timing on "Roll d20" was varied across runs (immediate vs. several
seconds into the `armed` window) and never changed the eventual face.

**Visual verification** — screenshots at every state the brief asks
for (armed/mid-throw/landed-hit/crit/reduced-motion/1024-floor/
larger/narrow), most driven through a temporary in-page `setTimeout`
scaling technique (multiplying the app's own timer delays by 50x for
the duration of a single screenshot capture, then restoring the
original `setTimeout`) rather than racing the several-second latency
between one MCP tool call finishing and the next one starting — without
that, beats kept auto-advancing past the exact moment being screenshot
between one tool call and the next (confirmed directly: several early
attempts landed on `verdict`/`throw`/`done` instead of the intended
`armed` because 3-5+ real seconds elapsed between the reset script
returning and the screenshot tool actually capturing). This technique
only ever changed _when a screenshot was taken_, never any application
code or the timing numbers verified numerically above (which used real,
unscaled timers).

- `combat-pacing-561-iter1-d20-armed-hidden.png` (committed) —
  `beat: armed`, "Roll d20" button visible, both `BeatStage` columns
  show the hexagonal d20 with a hidden `?` face — confirmed via DOM read
  (`d20-face` textContent `?`) at capture time.
- `combat-pacing-561-iter1-d20-verdict-crit.png` (committed) — `player
— crit`, `beat: verdict`, d20 shows the landed `20` face, gold `CRIT
(20+5 vs AC 16)` verdict, both columns promoted to center-stage
  (accent border) — clearly recognizable hexagon-plus-facets silhouette,
  not a generic dice emoji.
- `combat-pacing-561-iter1-d20-1920-large.png` (committed) — real
  1920×1080 browser viewport, `Pace: instant` on `player-crit`: the d20
  and its facet lines scale up visibly larger than the 1024-floor
  screenshot, still crisp (vector SVG, not a raster emoji glyph).
- `combat-pacing-561-iter1-d20-480-narrow.png` (committed) — real
  480×640 browser viewport, full-page capture: both `BeatStage` columns
  stack vertically (existing `flex-wrap` layout, unchanged), the d20
  scales down and stays legible, no clipping/overlap.
- Additional captures from the same session (`throw` mid-tumble with
  the hidden `?` face, the plain-hit landed face, a reduced-motion pass,
  and the 1024×768 floor by itself) were taken and inspected but not
  committed — kept as scratch evidence outside this repo (this
  workspace's existing convention, see "Additional screenshots" note
  earlier in this doc), since the four above already cover every state
  the brief lists at least once between them.

**Console**: zero errors from `CombatPacingConcept.tsx`/`BeatStage.tsx`/
`D20Die.tsx`/`useBeatSequencer.ts` across the entire session (armed/
throw/verdict/impact/release/done, all four scenarios driven, all four
viewports). The only console entries are the same pre-existing
`ERR_CONNECTION_REFUSED` lobby/character-API noise every prior session
in this doc has also logged (no backend running) — confirmed by reading
each message's source, not assumed.

### Honest limitations

- `AUTO_THROW_TIMEOUT_MS` (3000ms, the `armed`-beat agency pause before
  an un-thrown die auto-throws) is UNCHANGED this iteration, per Kirk's
  explicit instruction to tune it separately — the "≈5s hit" total
  above is measured from Cue through Release, i.e. AFTER a throw
  begins/commits (via an explicit "Roll d20" click in every timed run
  above), not inclusive of however long a player waits at `armed`
  before throwing.
- Same fixture-driven-`/concepts`-bench-only scope as every prior
  section of this doc — nothing here touches the production stream, a
  live `AttackResolved`/`EntityDamaged` reassembler, or `rpg-api`.
- The observed-timing table above is a SINGLE representative run per
  scenario, not a statistical distribution — the ~0.3-1.3% deltas from
  target are consistent with ordinary browser timer jitter (confirmed:
  every delta is a small POSITIVE overshoot, not scattered above/below,
  which is the expected signature of `setTimeout`'s "fires no earlier
  than" guarantee plus real event-loop/paint overhead, not a
  miscalibrated constant).
- This iteration does not touch `rpg-project` PR #99 (the source design
  doc) — Kirk asked to hold that update for a later visual-review pass.

## Kirk's live visual review (2026-07-22, concept-stage acceptance)

Kirk reviewed the faceted d20 iteration (previous section) live in a
browser session on 2026-07-22. Decision: **he can get behind it for the
current stage.** His perceived miss timing — counted from when rolling
starts, i.e. his own subjective sense of elapsed time watching the beat
play out, not a stopwatch or `performance.now()` reading — was **just
under approximately 3 seconds, and felt right**. No timing constants or
behavior changed as a result of this review; `useBeatSequencer.ts`'s
`CINEMATIC`/`BRISK`/`CRIT_*_EXTRA_MS` constants and `AUTO_THROW_TIMEOUT_MS`
are exactly as landed in the "faceted d20 + suspenseful reveal timing"
commit above — untouched by this section.

**Subjective vs. objective — these are two different measurements, not
a contradiction to reconcile:** the "Observed timing" table earlier in
this doc (real-browser confirmation, "Kirk's first interactive-review
iteration" section above) is `performance.now()`-measured wall clock,
Cue-through-Release, and reports a Cinematic miss **total** of 4200ms
target / 4229ms observed. Kirk's ~3-second impression is a human's felt
sense of a single live playthrough, not a re-measurement of that total,
and the two numbers are not expected to match: a stopwatch counts every
millisecond of every beat uniformly, while a person's felt sense of
"how long until I knew" plausibly weights the earlier, more
attention-grabbing beats (cue/throw) more heavily than the later
settle/release tail — a plausible explanation for the gap, not a
claim verified by any measurement in this doc. Both numbers stay in this
doc, clearly labeled: the table above is the objective evidence for
CI/regression purposes; this paragraph is the subjective evidence for
Kirk's product-feel judgment call. Neither supersedes the other, and
this section does not attempt to "correct" the measured table to match
the felt number, or vice versa.

**Scope of this acceptance:** this is **concept-stage acceptance of the
`/concepts` bench's pacing feel, not production choreography approval.**
It clears the current round-one fixture-driven bench to stand as-is on
timing; it is not a sign-off on however this pacing model eventually
gets wired into the live `EncounterView` route, real stream events, or
any future choreography pass. The existing honest-limitations notes
throughout this doc (fixture-driven bench only, no live-stream
reassembler) still apply unchanged.

**Outcome:** current constants remain unchanged. No code, test, or
behavior changes accompany this section — it is a record of a live
review decision only.
