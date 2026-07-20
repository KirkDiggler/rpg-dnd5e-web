# Real-route evidence: wall corner/end fittings (#536 phase 2)

Verifies the phase-2 fix for #536's diagnosis (defects #1-#3: no corner/vertex
fitting at direction changes, isolated single-cell wall hexes rendering as
free-standing "rubble" rings, and unterminated wall-run ends) by classifying
every hex-grid vertex a wall boundary passes through and placing the
manifest's `wall-corner-outer`/`wall-corner-inner`/`wall-end` fittings there.

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

I viewed both. Before: the familiar diagnosis look — thin independently-
rotated wall boxes, visible dark-floor notches at every direction change, and
two small closed loops (upper-left) reading as debris rings. After: the same
camera position, same dungeon, but every direction change and every isolated
loop's vertex now has a fitting piece closing the joint — no floor visible
through any seam in this view, and the two upper-left rings now read as small
deliberate hex structures rather than open rubble.

## Isolated wall hex (defect #2)

- **`wall-fittings-536-isolated-hex-before.png`** / **`-after.png`** (same
  crop region of the wide shot, 2x upscaled)

I viewed both, side by side. Before: the ring is visibly OPEN — you can see
through gaps between the independently-placed edge boxes into the black
void behind, and the top-left segment doesn't meet its neighbor at all
(explains the diagnosis's "reads as debris" call). After: every one of the
hex's 6 vertices now has a `wall-corner-outer` piece (per
`classifyWallVertices`'s 1-of-3 rule) — the ring is now visually sealed, no
gaps, reading as a small fortified structure. This is defect #1's general
corner rule fixing defect #2 "for free," exactly as the diagnosis predicted.

## Corner/direction-change corridor (defect #1)

- **`wall-fittings-536-corner-corridor-before.png`** / **`-after.png`**
  (same crop region, 2x upscaled)

I viewed both. Before: multiple visible gap/overshoot notches where the
corridor changes direction — black floor showing through triangular gaps
between consecutive independently-rotated wall boxes. After: every direction
change in this corridor is now capped by a corner fitting; no gap or
overshoot is visible along the entire run in this crop.

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
  `hexEdgeBetween`-derived edge position/rotation as every other segment.

## Honest note: defect #4 (top faces) — not made worse, but not fixed either

Defect #4 (bare/flat top faces from squeezing full-height Synty meshes to
`WALL_HEIGHT`) is explicitly out of scope for this phase. Looking at the
after-screenshots: the new corner/end fittings have the SAME kind of bare
cut-cross-section top-face issue as the existing wall variants (visible as
flat gray pyramid-ish caps in `wall-fittings-536-isolated-hex-after.png`) —
consistent with the rest of the wall, not visibly worse, but also not an
improvement. Flagging honestly per the acceptance bar rather than staying
silent about it.

## Judgment calls

- **Fitting placement/scale**: the diagnosis's design doc says fittings
  should use `[SYNTY_SCALE, WALL_HEIGHT/rawHeight, SYNTY_SCALE]`-style
  uniform scaling "centered on the vertex" — implemented as-is
  (`fittingScale`). Visually confirmed reasonable footprint (neither
  swallowing the adjacent wall pieces nor invisible slivers).
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
- **"180 degree straight continuation" exemption** (diagnosis's own caveat):
  verified analytically and via the unit tests that this case is structurally
  unreachable for this vertex-traversal algorithm (the two directions
  meeting at any hex corner are always exactly 60 degrees apart) — no
  special-case code was needed, and none was added.

## Deferred (out of scope for this phase, per the diagnosis)

- **Defect #4** — bare/flat top faces (needs its own visual-inspection spike
  per the diagnosis; confirmed above not made worse by this change).
- **Defect #5** — `broken`/`alcove` variant weighting has no semantic tie to
  wall state; the diagnosis recommended dropping their weight to 0 until
  corners existed. Corners now exist, so this is worth revisiting, but the
  weight change itself is left for a follow-up, not bundled into this PR.
- **Defect #6** — `WINDOW` wall-kind still has no distinct piece (falls back
  to `wall`).
