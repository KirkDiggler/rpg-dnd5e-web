# Real-route evidence: prop-model resolver (#528, charter #523)

**Revision history:** originally captured for #528/PR #530. The gate
review on PR #530
(https://github.com/KirkDiggler/rpg-dnd5e-web/pull/530#issuecomment-5018909341)
found that this doc's original "Real GLBs rendering" section only named
4 of the 6 injected keys as confirmed-visible (`crate`, `barricade`,
`rock-pile`, `pillar`) and silently omitted `barrel`/`tomb`, which the
reviewer's own re-drive showed rendering badly (barrel: small occluded
dark blob; tomb: nothing visible). This revision replaces that section
entirely, re-drives **every** key in the 17-key catalog (not just the
original 6), and reports the real root cause honestly — including that
the root cause was **not** what the gate review suspected.

## Environment

Reused the already-running local stack from this same sandbox: Go-built
`rpg-api` against local Redis, fronted by `grpcwebproxy` on
`localhost:8080` (see `idle-anim-506-real-route-reverify.md` for the
from-source recipe). This worktree's `npm run dev` (Vite, port 5190)
points at that proxy via `VITE_API_HOST`. Driven with Playwright, real
Chromium, real navigation/clicks, no mocking. Real character: **Alice the
Rogue**, in an already-active real solo lobby/encounter (`GetMyActiveLobby`
returns a live `lobbyId`/`encounterId` for `?playerId=alice`) — lands
directly on the real `EncounterView` route.

Assets: `public/models/synty/` synced from
`rpg-game-assets:asset/536-prop-pivot-fix` (**the asset fix branch, not
yet merged to `main`** — stating this explicitly per house rule: this
evidence validates against that branch, and should be re-verified against
`main` once rpg-game-assets PR is merged and a normal
`npm run assets:sync` is run). Verified programmatically that the fix
branch's `manifest.json` has zero field differences from what
`propManifest.ts` already hard-codes (name/file/role/footprintHexes/
blocksLoS identical for all 26 keyed pieces) — the pivot-fix commit never
changes any of those fields (see rpg-game-assets commit `91cd205`'s
message for why), so **no propManifest.ts edit is needed or made here**.

## What the gate review's hypothesis got right, and what it got wrong

The gate review correctly identified that `barrel` and `tomb` render
badly on this dev-demo path, and correctly declined to guess further
without more evidence. Re-investigating with a full sweep of all 28
promoted GLBs (world bounding box via the full node-transform chain, not
just local accessor min/max; triangle winding vs. normals; material/
texture validity; isolated Blender renders) found:

- **`barrel` and `tomb` are not defective.** Both have a pivot at the
  local origin, rest exactly on their own floor plane (`min.y == 0`
  within float precision), have correct outward-facing normals, valid
  materials/textures, and render as clean, correctly-shaped, correctly-
  colored meshes in an isolated Blender headless render
  (`props-530-logspike-blender-before-after.png` and siblings show the
  same rendering method applied to pieces that WERE broken, for
  comparison — barrel/tomb needed no "before" shot because there was no
  defect to show).
- **The actual cause of the reported symptom:** `buildDevPropDemoEntities`
  places every key in a single-key `?devPropDemoKeys=<key>` request at
  the _same_ fixed hex (`HEX_NEIGHBOR_DELTAS[0]`, since a 1-element array
  always maps its one key to index 0). In this sandbox's specific active
  encounter, that one hex happens to sit directly behind a wall/alcove
  corner. Short pieces (`barrel` ~0.77m, `tomb` ~0.47m, and — newly
  confirmed here — `chest` ~0.25m) get substantially or fully hidden
  behind that wall corner from the camera's isometric angle; taller
  pieces (`pillar` ~2.94m, `barricade` ~1.94m) poke above it regardless;
  medium pieces (`crate` ~0.80m) mostly clear it. This reproduces
  precisely and consistently — see
  `props-530-barrel-demo-anchor-hex-occluded.png` and
  `props-530-tomb-demo-anchor-hex-invisible.png`, both taken at that same
  anchor hex — but placing the _same, unmodified_ GLB at a different
  neighbor hex (`?devPropDemoKeys=pillar,barrel` puts `barrel` at
  `HEX_NEIGHBOR_DELTAS[1]` instead) renders it correctly every time:
  `props-530-barrel-alt-hex-confirmed-fine.png`,
  `props-530-tomb-chest-alt-hex-confirmed-fine.png`. This is a
  camera-angle/room-layout artifact of the demo harness's fixed
  single-key anchor, not an asset defect and not a resolver bug — no
  code or asset change fixes it, and none was made for these two keys.
- **6 _other_ pieces (not originally reported) had a genuine, separate
  defect**, found by the same sweep and fixed in
  `rpg-game-assets` PR (branch `asset/536-prop-pivot-fix`, commit
  `91cd205`): `SM_Env_Stalagmite_03`/`_05` (stalagmite), `SM_Prop_Crate_Rocks_01`
  (rocks), `SM_Prop_Log_Spike_02` (log-spike), `SM_Prop_Wall_Banner_01`
  (banner — the worst case, ~3.16m of its 4.29m height was below floor),
  and `SM_Prop_KnightStand_01` (armor-stand, a negligible ~3cm). These
  had raw FBX vertex data that didn't rest on the authoring origin even
  though the object's own pivot was already at `(0,0,0)` — invisible to
  `build_prop_manifest.py`'s bbox measurement (it only ever measures
  width/height/depth deltas, never absolute position) and invisible to
  the pipeline's own contact-sheet renderer (which force-repositions
  every piece to its measured floor line, silently masking the bug). Root
  cause, fix, before/after Blender renders, and the full 28-piece sweep
  are documented in the sibling asset PR.

## Real GLBs rendering on the real route — all 17 catalog keys, honestly accounted for

Re-drove `?devPropDemoKeys=` in batches of 6 (the hex-neighbor cap),
covering every key in `EXPECTED_PROP_KEYS`:

- **`props-530-group1-barrel-crate-pillar-rockpile-stalagmite-runestone.png`**
  — `barrel,crate,pillar,rock-pile,stalagmite,rune-stone`. Five of six
  clearly visible and distinguishable around Alice (rock-pile boulder
  cluster, stalagmite, pillar, crate, rune-stone slab with its red
  glyph); `barrel` lands on the wall-occluded anchor hex in this batch
  (it's index 0) — see the dedicated alt-hex shot above for its
  confirmed-fine rendering.
- **`props-530-group2-barricade-bookcase-chest-tomb-logspike-rocks.png`**
  — `barricade,bookcase,chest,tomb,log-spike,rocks`. Barricade, bookcase,
  log-spike, and rocks clearly visible; `chest` and `tomb` are the two
  shortest pieces in this batch and are occluded by the bookcase/wall
  from this angle — both independently confirmed rendering correctly at
  other hexes above/below.
- **`props-530-group3-candles-vase-banner-books-armorstand.png`** —
  `candles,vase,banner,books,armor-stand`. All five visible, including
  **`banner` now standing fully above the wall line** (previously fully
  buried — this is the fixed asset, confirmed live, not just in Blender).
- Individually re-verified every one of the 6 originally-reported +
  newly-fixed keys post-fix at the _same_ anchor hex they were tested at
  before: `props-530-logspike-after-fix.png`,
  `props-530-banner-after-fix.png`, `props-530-stalagmite-after-fix.png`,
  `props-530-rocks-after-fix.png` — all now stand at full height on the
  floor, vs. buried/invisible before (compare against the Blender
  before/after renders, same root cause, same fix).
- **`props-530-all-28-contact-sheet.png`** — every promoted piece (not
  just the 17 keyed ones) at consistent `SYNTY_SCALE`, rendered from the
  post-fix `rpg-game-assets` branch, alongside reference wall/character
  pieces for scale sanity.

I viewed every frame listed above. No console errors beyond the
pre-existing benign `StreamEncounter` `AbortError`/`ConnectError` on
navigation teardown that `idle-anim-506-real-route-reverify.md` already
documented as unrelated to this line of work (reproduces identically on
every `page.goto` in this session, including ones with no prop-related
change at all).

## Graceful fallback for an unmapped key, on the same real route

**`props-528-fallback-unknown-key.png`** (unchanged from the original
capture — this path is untouched by the pivot fix) — same real route,
same real character, `?devPropDemoKeys=barrel,unknown-thing-not-in-manifest`:
the unmapped key renders as the exact pre-existing purple capsule
primitive (`HexEntity`'s unchanged obstacle fallback), not a broken/
missing model, a crash, or a blank gap.

## Judgment calls

- Validated against `rpg-game-assets:asset/536-prop-pivot-fix` (not yet
  merged) — stated explicitly above and in the PR. Re-sync and spot-check
  once that PR merges to `main`.
- Did not "fix" the wall-occlusion artifact at the demo harness's fixed
  single-key anchor hex — it isn't a bug in this PR's resolver, in
  `PropModel.tsx`'s placement, or in any GLB; it's an inherent
  consequence of a short 3D object standing directly behind a wall
  corner from an isometric camera in one specific room layout, and would
  reproduce for _any_ short prop placed at that exact hex, fixed or not.
  Flagging it here for visibility, not fixing it as part of this PR.
- Reused an already-running backend stack and an already-active
  character/lobby (Alice the Rogue), same convention as the original
  capture and `idle-anim-506`/`#515`'s precedent.
- `devPropDemoKeys` remains real, shipped source, unchanged by this
  revision.
