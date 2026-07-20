# Real-route evidence: wall corner/end fittings (#536 phase 2)

Verifies the phase-2 fix for #536's diagnosis (defects #1-#3: no corner/vertex
fitting at direction changes, isolated single-cell wall hexes rendering as
free-standing "rubble" rings, and unterminated wall-run ends) by classifying
every hex-grid vertex a wall boundary passes through and placing the
manifest's `wall-corner-outer`/`wall-corner-inner`/`wall-end` fittings there.

**This doc has been updated after a QA round found the first version of this
fix was NOT ready to ship** — see "QA correction round" below before the
original before/after writeup. The before/after PNGs in this directory are
the corrected (post-QA) renders.

## QA correction round (required before merge)

A reviewer viewed the first version's `wall-fittings-536-wide-before/after.png`
directly and rejected it: the "after" read as cluttered slab-stacks, with
grey corner fittings appearing along entire wall boundaries rather than only
at direction changes. Two root causes, both fixed:

1. **Placement was correct per the diagnosis's literal per-VERTEX rule, but
   that rule doesn't match human-perceived "straightness."** Every hex-grid
   vertex along even a dead-straight run technically has a 1-of-3 or 2-of-3
   touching-hex count, because consecutive rendered edges in a hex-tiled wall
   are never literally collinear at single-hex granularity (hex corners are
   always ~60 degrees apart by construction — verified analytically and
   still true, see the unit tests). The original implementation followed
   that literal rule and put a fitting at every one of those technically-
   correct micro-turns, which is geometrically defensible but reads as
   clutter once a run is more than 2-3 hexes long. **Fix**: added
   `isStraightThroughHex` — a hex-level (not vertex-level) gate. A wall hex
   with exactly 2 wall neighbors in OPPOSITE directions (the run passes
   straight through it) now contributes NO fittings at any of its own
   vertices; only hexes that are isolated, true ends, genuine
   (non-opposite-neighbor) bends, or 3+-way junctions still do. A vertex only
   gets a fitting if at least one of its 1-2 touching wall hexes still
   qualifies. Verified: a straight run's total fitting count is now constant
   regardless of how many extra straight hexes are added to its middle (12
   for both a 3-hex and a 6-hex straight run in the unit tests), instead of
   scaling linearly with run length as it did before.

   **Important honest caveat**: in the SPECIFIC real dungeon layout used for
   this evidence, this fix alone did not visibly change the wide-shot
   screenshot — re-rendered and compared pixel-for-pixel identical crops
   before concluding this. This real layout's corridors are a winding maze
   with essentially no long straight stretches, so nearly every wall hex in
   it genuinely IS a bend and correctly still gets treated. The
   straight-through gate is still correct and load-bearing (proven by the
   unit tests, and it will matter for straighter layouts/rooms), but it was
   NOT the fix that made this specific evidence set look better — fix #2
   below was.

2. **Fitting scale was the actual dominant problem in this layout.** Measured
   raw GLB bounding boxes directly with Blender (`bbox_glb.py` against
   `rpg-game-assets/harness/models/synty/env/*.glb`) rather than trusting the
   original "uniform SYNTY_SCALE (0.75) on X/Z" assumption. Found: the
   `plain` wall variant's actual rendered thickness is ~0.327 world units
   (raw depth 0.4357 × its own SYNTY_SCALE), but `wall-corner-outer` at the
   old flat 0.75 scale rendered to ~0.622 — nearly DOUBLE the wall's own
   thickness. That's exactly why fittings looked like dominant slabs instead
   of slim caps. **Fix**: `fittingScale` now scales each fitting's own raw
   width/depth (measured per-variant, matching `WALL_VARIANTS`' existing
   convention) by a dedicated `FITTING_FOOTPRINT_SCALE = 0.4`, chosen so
   `wall-corner-outer` renders at ~0.33 — matching the wall's own thickness
   almost exactly — with `wall-corner-inner`/`wall-end` landing close behind
   in the same order of magnitude, not SYNTY_SCALE's flat 0.75.

Both fixes are covered by updated/new unit tests in
`syntyHexWallHelpers.test.ts` (24 tests total, up from 14 pre-fix / 22 in the
first version of this PR). The before/after PNGs in this repo were
**re-rendered after both fixes** — the ones referenced below are the
corrected set, not the originally-submitted (rejected) ones.

## Environment (real route, per house rule)

Reused the already-running local stack from this job's environment rather
than rebuilding it: Go-built `rpg-api` (port 50051), Redis (port 16379),
`grpcwebproxy` (port 8080, matches this repo's `.env` `VITE_API_HOST`). Not
`/playtest` — the real `Home -> select character -> Play -> lobby ->
EncounterView` route, reusing **alice's real, already-active lobby/encounter**
(same pattern the #536 diagnosis comment used) so the "before" and "after"
screenshots below render the **exact same server-generated dungeon layout**
through two different frontend builds — not just "a representative layout"
but literally the same one, for a true apples-to-apples comparison:

- **Before**: a temporary worktree at `origin/main` (commit `fc35cec`,
  unpatched), `npm install` + `assets:sync`, `vite --port 5201`.
- **After**: this branch (`fix/536-wall-fittings`), `vite --port 5200`.
- Both point at the same backend (`VITE_API_HOST=http://localhost:8080`);
  navigating either to `/?playerId=alice` reconnects to the same live
  `FREE_ROAM` encounter instead of creating a new one, so the wall data
  driving both renders is byte-for-byte identical.
- Driven with Playwright (real Chromium), reusing this job's existing
  `tmp/drive_game_515.mjs` alice/rogue navigation pattern. `page.goto` used
  `waitUntil: 'load'` (not `networkidle` — the encounter's live gRPC stream
  keeps the network busy indefinitely, matching this job's existing
  `check_alice_walldiag.mjs` precedent).

## Wide overview

- **`wall-fittings-536-wide-before.png`** / **`wall-fittings-536-wide-after.png`**

I viewed both. At this zoom level the two now read as comparably clean — the
after does NOT look more cluttered than the before at a glance, which is the
actual acceptance bar. The difference shows up on closer inspection (crops
below): every direction change/isolated loop now has its gap closed by a
slim cap, without dominating the tan wall segments the way the pre-QA-fix
version did.

## Isolated wall hex (defect #2)

- **`wall-fittings-536-isolated-hex-before.png`** / **`-after.png`** (same
  crop region of the wide shot, 2x upscaled)

I viewed both, side by side. Before: the ring is visibly OPEN — you can see
through gaps between the independently-placed edge boxes into the black
void behind, and the top-left segment doesn't meet its neighbor at all
(explains the diagnosis's "reads as debris" call). After: every one of the
hex's 6 vertices now has a `wall-corner-outer` piece (per
`classifyWallVertices`'s 1-of-3 rule), sized to roughly match the wall's own
thickness rather than dwarf it — the ring is now visually sealed, no gaps,
reading as a small fortified structure rather than a stack of oversized
grey slabs.

## Corner/direction-change corridor (defect #1)

- **`wall-fittings-536-corner-corridor-before.png`** / **`-after.png`**
  (same crop region, 2x upscaled)

I viewed both. Before: multiple visible gap/overshoot notches where the
corridor changes direction — black floor showing through triangular gaps
between consecutive independently-rotated wall boxes. After: every direction
change in this corridor is now capped by a slim corner fitting; no gap or
overshoot is visible along the entire run in this crop, and the caps read as
part of the wall rather than separate oversized blocks.

## Wall-run ends (defect #3)

Not as visually dramatic in this particular generated layout as the corner/
isolated-hex cases above — this run of alice's dungeon didn't happen to put a
short, camera-prominent dead-end stub in frame the way the original
diagnosis screenshot did (unseeded RNG, rpg-toolkit#787). Confidence here
rests on:

- `wallEndEdgeKeys` unit tests (`syntyHexWallHelpers.test.ts`): isolated hex
  gets zero end caps (handled by corners alone, matching the diagnosis), a
  2-hex stub gets exactly one end cap per hex on its own far side, and a
  3-hex straight run's middle (degree-2) hex is correctly excluded.
- No console/network errors for `SM_Env_Wall_End_01.glb` during either
  capture (a wrong filename or bad path would throw a GLTF load error in
  the `Suspense` boundary, not silently no-op).
- The general "no floor visible through a wall seam" improvement visible in
  every crop above applies equally to run-end seams, which use the same
  `hexEdgeBetween`-derived edge position/rotation as every other segment,
  now at the corrected (matching-wall-thickness) scale too.

## Honest note: defect #4 (top faces) — not made worse, but not fixed either

Defect #4 (bare/flat top faces from squeezing full-height Synty meshes to
`WALL_HEIGHT`) is explicitly out of scope for this phase. Looking at the
after-screenshots: the new corner/end fittings have the SAME kind of bare
cut-cross-section top-face issue as the existing wall variants — consistent
with the rest of the wall, not visibly worse, but also not an improvement.
Flagging honestly per the acceptance bar rather than staying silent about it.

## Judgment calls

- **Fitting scale**: superseded the original "uniform SYNTY_SCALE on X/Z"
  assumption after QA correctly flagged it as visually dominant. Now derived
  from each variant's own measured raw width/depth (via Blender bbox
  extraction) at a dedicated `FITTING_FOOTPRINT_SCALE = 0.4`, chosen to match
  the wall's own rendered thickness. See "QA correction round" above.
- **Straight-through gate**: a hex-level (not vertex-level) concept of
  "collinear" — see "QA correction round" above for why the diagnosis's
  literal per-vertex rule needed this correction to match human-perceived
  straightness, and the honest caveat that this specific real layout didn't
  visually exercise it much (verified via unit tests instead).
- **`wall-end` placement point**: the diagnosis's wording ("at that vertex")
  is ambiguous between an edge's two endpoints. Given the manifest dims are
  small/roughly-cubic (same family as the corner fittings, NOT edge-length
  like `WALL_VARIANTS`), placed at the far edge's **midpoint**
  (`edge.mid`/`edge.rotationY`, replacing the plain/broken/alcove variant
  that would otherwise render there) rather than at either endpoint vertex
  — endpoints are already covered by the general corner rule.
- **Corner/end fitting material**: reads distinctly grayer/different-stone
  than the tan `plain` wall variant in these screenshots. Confirmed (via a
  temporary local A/B toggle, not committed) this is the fitting GLBs' own
  authored material, not a scale/rotation bug in this change — the existing
  `broken`/`alcove` wall variants already share this same gray-stone look
  (visible in the pre-existing diagnosis screenshots too), so this reads as
  an existing style-consistency question adjacent to defect #5, not a
  regression introduced here.
- **"180 degree straight continuation" exemption** (diagnosis's own
  per-edge-angle caveat): verified analytically and via the unit tests that
  this is structurally unreachable at the per-vertex/per-edge level (the two
  directions meeting at any hex corner are always exactly 60 degrees apart)
  — no special-case code was needed there. This is a DIFFERENT, finer-grained
  notion of "collinear" than the hex-level straight-through gate added in the
  QA correction round above; both are true simultaneously (every vertex is a
  micro-turn at edge-angle granularity, but a straight-through hex still
  contributes none of its own fittings at the macro/gameplay-perceived
  level).

## Deferred (out of scope for this phase, per the diagnosis)

- **Defect #4** — bare/flat top faces (needs its own visual-inspection spike
  per the diagnosis; confirmed above not made worse by this change).
- **Defect #5** — `broken`/`alcove` variant weighting has no semantic tie to
  wall state; the diagnosis recommended dropping their weight to 0 until
  corners existed. Corners now exist, so this is worth revisiting, but the
  weight change itself is left for a follow-up, not bundled into this PR.
- **Defect #6** — `WINDOW` wall-kind still has no distinct piece (falls back
  to `wall`).
