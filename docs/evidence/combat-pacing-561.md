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

**A real, pre-existing, OUT-OF-SCOPE bug found while writing this
evidence** (not fixed here — filed as a concern, not touched, per this
task's explicit "do not alter the sequencer" scope): switching scenarios
via the scenario buttons WHILE a `Pace: instant` override is already
active does not update the displayed verdict/damage — the stage keeps
showing the PREVIOUS scenario's attack data even though the event
inspector (which reads `scenario.events` directly, not through the
sequencer) correctly shows the new scenario's fixture events. Root
cause, isolated with a `renderHook` probe against the UNMODIFIED
pre-fix `useBeatSequencer.ts` (confirming this is not something this fix
introduced): `startGroup()`'s `pace === 'instant'` branch calls
`setBeat('done')` and the scenario-changed effect calls
`setGroupIndex(0)` — when the PREVIOUS scenario was also Instant and
already at `beat='done'`/`groupIndex=0`, both of these are same-value
state updates; React bails the re-render (`Object.is` short-circuit), so
the component never re-reads the mutated `groupsRef.current` the effect
already rebuilt with the new scenario's groups. This only manifests
across a scenario SWITCH while Instant is already active — selecting
Instant on an already-displayed scenario (the fix's actual use case, and
every test/browser check above) works correctly, because that is a real
`beat` value change (e.g. `cue`→`done`) and React does not bail. Filed
as a concern for a future task; `useBeatSequencer.ts` was not modified
here.

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
