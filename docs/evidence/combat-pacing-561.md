# Real-route evidence: combat-pacing round-one bench (#561)

Verifies the round-one `/concepts` → Combat Pacing bench (design.md §8's
acceptance bar): token-anchored vs. center-stage placement compared
against identical fixtures at the 1024×768 floor, a larger frame, and a
non-breaking narrow fallback below the floor.

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
   show the ABSENCE of animation directly, so this claim rests on: (a)
   the DOM class list confirming `beat-stage--reduced-motion` is applied
   during the crit verdict (`06-reduced-motion-crit-verdict.png`), and
   (b) reading the CSS rule that scopes `animation: none` to exactly that
   combination. Toggled reduced motion back off, re-ran `player-hit`'s
   Throw: die class reverted to `beat-die--tumbling`
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

8. **Frame checks.** Clicked each of `floor`/`typical`/`full`/`narrow` in
   turn on `player-hit`: at 1024×768 (`08-frame-floor.png`) and the two
   larger frames (`08-frame-typical.png` 1440×900,
   `08-frame-full.png` 1920×1080) the two `BeatStage` columns get more
   breathing room, no fixed/clipped elements. At the 480×640 narrow
   fallback (`08-frame-narrow.png` /
   `combat-pacing-561-narrow.png`) both columns still render
   side-by-side without clipping or overlap — the concept's own flex
   layout (`flex: 1, minWidth: 160`) keeps both stages visible rather
   than collapsing one behind the other. (Note: these "frames" are the
   concept's own internal simulated viewport box, not an actual browser
   window resize — this matches how `CombatPanelConcept.tsx`'s existing
   FRAMES pattern already works, and is what the component under test is
   designed to be exercised through.)

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
  `useBeatSequencer.ts`, or `fixtures.ts` during any of the above.
- `opportunity-attack`, `npc-grunt-swing`, `npc-boss-swing`, and
  `repeated-attacks` scenario buttons exist and were visible in every
  screenshot's scenario row but were not individually driven through a
  full beat cycle in this pass — Step 5's 8 checks are all scoped to
  `player-hit`/`player-miss`/`player-crit`/`player-nat1`, and this
  evidence doc follows that scope rather than exercising all 8 fixtures.
- No regression, clipping, stuck-at-cue, or missing-color defect was
  found in any of the 8 checks above; nothing here required a code fix.

## Screenshots

- `combat-pacing-561-token-anchored.png` — `player-hit` at `verdict`:
  left column plain-bordered (token-anchored, not promoted), right
  column accent-bordered (pure center-stage).
- `combat-pacing-561-center-stage.png` — `player-crit` at `verdict`:
  both columns accent-bordered (token-anchored promoted to match pure
  center-stage).
- `combat-pacing-561-narrow.png` — 480×640 (below-floor) frame, both
  `BeatStage` columns still rendering side by side, no clipping/overlap.

Additional screenshots from the same driven session (not required by the
brief's file list, kept only as the underlying evidence trail for this
doc's claims) live under
`/tmp/opencode/combat-pacing-evidence/` (not committed —
`game-dev`'s own workspace, outside this repo).
