# Asset Anchor Lab Learn evidence — issue #731

## Verdict

**Yes, with a hard ownership check.** A human can load an unfamiliar synced GLB, see its raw origin and actual visible bounds against one highlighted owning hex and a real Synty wall reference, compare a measured candidate without hiding the raw result, and inspect the same transform in Orbit and the shared tactical Play projection. The lab is useful for discovering *what kind* of correction exists; it must not automatically turn every visually useful translation into runtime metadata.

The experiment remains fixture-only at `?concept=asset-anchor-lab`. It has no save call, manifest writer, production YAML, persistence, API/proto/toolkit seam, or production renderer branch. The output button creates only local React state and labels the result `NON-PRODUCTION FIXTURE EVIDENCE`.

Source checkpoints:

- web base: `origin/dev` at `4ede9a71c473f273ad14d7acb1ea083edcdb78aa`
- synced assets: `rpg-game-assets` main at `d22c53f51e026ba06b978e28f7acadaa2baa34fa`
- shared web paths: `resolvePropModelUrl`, `resolveClassCharacterModelUrl`, `useGLTF`, `SYNTY_SCALE`, `SyntyHexFloor`, `GlbInstance`, `facingToRotationY`, and the tactical rig constants from `playCameraRig.ts`

## What the working surface proves

- The cyan owning hex is always cube `q0,r0,s0`; changing case, facing, candidate, camera, or standing/downed variant never changes that logical address.
- Every case/variant starts **Raw only**. `Raw only | Calibrated only | Overlay` makes the intentionally wrong input separable from the answer; a coincident cyan copy is never called calibrated by default. High-contrast anchored labels identify `RAW INPUT`, `CALIBRATED` or `DIAGNOSTIC`, `OWNING HEX CENTER`, the measured `VISIBLE WALL FACE`, and the nominal edge plane in Orbit and Play.
- The gold dot is centered at exact model-local `(0,0,0)`; a distinct vertical stem runs from zero to a separately named elevated visibility ring, and a separate gold arrow is the local `+Z` direction probe. No elevated element is called the raw origin.
- Candidate meanings are deliberately semantic and local: raw origin, visible-bounds center/floor, and measured back-face/wall. They are not proposed production field names.
- A prominent explicit action states the intended candidate meaning before any controls: recommended bounds-centering for bookcase, wall-face with provisional height for torch, already-centered raw standing fighter, and diagnostic-only centering for downed. Adjustment is explicitly **fine trim around the preset** in 5 cm steps, clamped to exactly ±25 cm; preset base and effective base+trim offsets are separate readouts.
- The same candidate transform feeds Orbit and Play. Play uses the existing tactical orthographic constants; there is no camera-only compensation.
- Navigation never pre-credits evidence. Provisional output accepts only positive callbacks emitted after the real GLB has loaded, produced finite non-zero measured bounds, and visibly committed the selected candidate in **Calibrated only or Overlay** under the exact case + variant + candidate + camera + facing selection. Raw-only callbacks prove load/measurement but earn zero candidate credit. The chosen candidate needs Orbit, Play, and all six facings; the fighter requires that independently for standing **and** downed. Pending, error, unmeasured/fallback-only, stale, other-candidate, and other-variant observations remain gated.

## Kirk visual rejection and corrected visual contract

The first technically green PR presentation failed Kirk's creative review. His local screenshot showed downed/raw-origin in mandatory Overlay: magenta and cyan coincided `1.452m` off the owning hex, while the UI called the zero-offset copy calibrated. The same failure mode made the raw bookcase start almost `1m` right of center with no recommended action, left the raw torch on the floor after its cyan copy reached the wall, and made ±25 cm fine trim appear incapable of performing the larger semantic correction. Kirk's screenshot is not committed; its relevant state and world-space measurements were reproduced locally against the same runtime.

Kirk subsequently confirmed two geometry facts once the presets became understandable: the bookcase bounds-centering correction is correct, and the downed diagnostic centering correction is correct. The acceptance failure was comprehension/product UX, not those transforms. The corrected contract is:

- **Bookcase:** Raw-only exposes center `(+0.927,+1.257,+0.330)m`. Recommended calibrated base `(-0.927,0,-0.330)m` puts visible X/Z center at `(0,0)` and base at floor Y=0.
- **Torch:** Raw-only exposes a wall fixture at the hex origin/floor. Recommended calibrated base `(0,+1.182,-0.790)m` puts measured back face at nominal Z `-0.866m` and visible center Y at the explicitly provisional `1.15m`.
- **Standing fighter:** raw base Y=0 and visible center X/Z approximately `(0,-0.002)m`; it is already centered.
- **Downed fighter:** Raw-only truth remains center Z `-1.452m` (re-export defect). Diagnostic-only base `(+0.004,+0.243,+1.452)m` puts visible center X/Z at `(0,0)` and base Y=0. It remains explicitly non-production.

No cyan calibrated/diagnostic result outside the owning center is rationalized as acceptable.

## Positive gate and real-scene verification

Focused native verification after the visual-contract correction: **3 files / 37 tests passed**. The reducer/component suites cover Raw-only zero-credit, explicit candidate action, visibility reset per case/variant, Calibrated-only/Overlay acknowledgement, base versus effective readouts, pending/error/unmeasured states, missing Play, missing selected-candidate Orbit, stale/cross-selection callbacks, both fighter variants, and every fixture candidate while retaining candidate math and ±25 cm clamp/reset coverage.

`AssetAnchorLabPreview.test.tsx` mounts the real R3F scene graph and stubs only external GLB/texture fetches. Its loader fixtures preserve the exact measured bounds. It proves Raw-only has one raw primitive/label and no cyan primitive, Calibrated-only has one exact resolved primitive/label, Overlay alone has both, and the real floor, wall, exact origin, owning center, visible/nominal wall planes, shared camera, bookcase/torch/downed exact offsets, centered standing bounds, and post-commit payload remain connected.

Reversible mutation red/green proof restored each edit before the next:

| Deliberate mutation | Red assertion |
|---|---|
| allow Raw-only callback to earn candidate evidence | component reported `6/6` instead of `0/6`; reducer Raw-only negative failed |
| prevent explicit candidate action from showing calibrated result | calibrated-facing progress stayed `0/6`; visibility/action test failed |
| remove calibrated primitive | Overlay expected two actual asset meshes, got one |
| remove anchored `RAW INPUT` label | Raw-only and Overlay real-scene label assertions failed |
| remove `SyntyHexFloor` | expected the real floor texture loader call |
| remove real wall `GlbInstance` | expected an environment GLB loader call |
| remove Play requirement | missing-Play negative changed expected false → true |

Each mutation returned non-zero. After restoration, the focused command returned **37/37 green**. These are scene/reducer behavior seams, not source-text assertions.

## Runtime measurements from the loaded GLBs

Measurements below are the running Three.js `Box3` result after the shared `0.75` render scale, not nominal fixture dimensions or placeholder geometry.

| Case | Actual URL | Visible min (m) | Visible max (m) | Center / salient result |
|---|---|---|---|---|
| bookcase | `/models/synty/props/SM_Prop_Bookcase_Small_01.glb` | `(0.127, 0.000, -0.003)` | `(1.726, 2.514, 0.662)` | center `(0.927, 1.257, 0.330)` — raw origin is a floor/back-side corner, not visible center |
| ornate torch | `/models/synty/props/SM_Prop_Torch_Ornate_01.glb` | `(-0.086, -0.333, -0.076)` | `(0.086, 0.269, 0.076)` | centered in X/Z; raw Y is near geometric center, so raw origin puts a wall fixture at floor level |
| fighter standing | `/models/synty/characters/fighter.glb` | `(-1.083, 0.000, -0.243)` | `(1.083, 1.390, 0.239)` | centered near token origin; current posed/skinned bounds are broad in X |
| fighter downed | `/models/synty/characters/fighter-downed.glb` | `(-0.537, -0.243, -2.156)` | `(0.529, 0.239, -0.748)` | center `(-0.004, -0.002, -1.452)` — the body is wholly on one side of the shared origin |

### Shared wall-target diagnostic (not asset metadata)

The exact fixture wall `SM_Env_Wall_Half_01.glb` has raw Z bounds `[-0.153132,+0.282585]`. After shared Z scale `0.75` and placement on nominal hex-edge plane Z `-0.866025`, its visible thickness spans world Z **`-0.980874..-0.654086m`**. The room-side visible face is therefore Z `-0.654086`, `+0.211939m` closer to the owning hex than the nominal plane. The scene now labels and outlines both values instead of calling the nominal plane the visible wall face.

Kirk independently found that a **Z `-0.20m`** fine trim (negative is toward this fixture's wall from the owning center) improves both the already-centered bookcase and the wall torch visually. The repetition is a useful shared wall-contact/scene-clearance signal, not two new per-asset anchors. There is also a sign distinction that must remain explicit: moving from nominal plane `-0.866` to the measured room-side face `-0.654` is **positive** `+0.212m`, whereas Kirk's visual trim is **negative** `-0.20m`. It therefore does not mathematically “correct nominal to near face”; it is an authored clearance/embed judgment in this single fixture. The lab exposes the trim and separate base/effective readouts but does not bake it into either recommended asset preset or production metadata.

Actual network/runtime proof is committed as [`asset-anchor-lab-731-runtime-proof.json`](asset-anchor-lab-731-runtime-proof.json): all four required GLBs returned HTTP 200 with `model/gltf-binary`; the shared wall GLB and floor texture also returned 200. The capture run recorded **zero page errors and zero console errors**. Four Chromium `ReadPixels` GPU-stall performance warnings occurred while taking screenshots; they are capture noise, not app/runtime failures.

## Five-way classification ledger

| Representative case | Classification | Why this category owns it | Categories rejected / separated |
|---|---|---|---|
| corner-pivot bookcase | **Asset anchor metadata** | The exact GLB's visible center is consistently `+0.927m X / +0.330m Z` from its raw origin. Canceling that corner pivot is intrinsic to every use of this variant and stays correct through the six-facing sweep. | Not a re-export defect: the pivot is coherent and usable. The intrinsic centering is not a scene nudge; Kirk's additional `-0.20m Z` toward this one wall is explicitly a separate scene-clearance observation. Not a per-variant anchor. Not established here as a true multi-hex correction: visible width is `1.599m` versus `1.732m` adjacent hex-center spacing; the existing manifest's `footprintHexes: 2` remains a separate collision/placement judgment. |
| ornate torch | **Asset anchor metadata** for back-face/wall registration; **scene-specific placement nudge** for mount height until a repeated-scene experiment proves a default | X/Z are intrinsically centered; the useful stable correction is registering the measured back face to a named wall plane. The fixture's `1.15m` visual mount line looked readable in Orbit and Play, but one scene cannot prove that height belongs to the asset. | Bounds-center/floor and raw origin leave a wall fixture at the hex/floor. Kirk's repeated `-0.20m Z` visual trim matches the bookcase's scene observation and remains a shared wall-contact/clearance diagnostic, not torch metadata. No evidence of re-export defect, per-variant anchor, or multi-hex footprint. |
| fighter standing/downed pair | **Re-export defect** | Standing is centered at the token. The downed GLB's entire Z range is `-2.156..-0.748m`, centered `1.452m` off the same origin. A bounds-center candidate demonstrates the symptom, but hiding it in metadata would encode the output of a flawed downed export. This is the exact family owned by `rpg-game-assets#43`. | **Per-variant anchor rejected** for production: the prone variant should be horizontally recentered by the reproducible export workflow. Scene nudge and asset anchor metadata would mask the defect. It is not a true multi-hex footprint: the entity remains one logical creature on one hex; visual spill is not gameplay occupancy. |

This ledger intentionally does **not** collapse the torch's wall registration and authored height into one generic offset. They have different owners.

## Rejected candidate approaches

1. **Raw origin as universal truth:** fails the corner-pivot bookcase and leaves the torch on the floor.
2. **Visible-bounds center + floor as universal truth:** useful for freestanding inspection, but semantically wrong for the wall torch and dangerously attractive as a way to hide the downed export defect.
3. **One standing/downed runtime translation:** visually centers the specimen but would preempt the asset-side reproducible fix already scoped by `rpg-game-assets#43`.
4. **Promote the fixture's 1.15 m torch height globally:** rejected; it is one wall/scene/camera judgment.
5. **Treat every visible spill as multi-hex occupancy:** rejected; cosmetic bounds, physical footprint, collision, and authored scene intent are distinct.
6. **Arbitrary transform inspector:** rejected; the lab exposes only three measured candidates and bounded ±25 cm local adjustment.

## Viewed visual evidence

All captures are 1440×900 local Chromium against the real Vite runtime and actual synced GLBs. Each screenshot states its visibility mode and uses anchored scene labels; Kirk's private screenshot is described above but not committed.

- [`asset-anchor-lab-731-bookcase-raw-start.png`](asset-anchor-lab-731-bookcase-raw-start.png) — **viewed Raw-only start:** one magenta `RAW INPUT` bookcase visibly sits corner-offset from the labelled owning center; there is no coincident cyan copy.
- [`asset-anchor-lab-731-bookcase-orbit.png`](asset-anchor-lab-731-bookcase-orbit.png) / [`bookcase-play`](asset-anchor-lab-731-bookcase-play.png) — **viewed Calibrated-only answer:** one cyan-labelled bookcase has visible X/Z center on q0,r0,s0 and base on the floor in Orbit and tactical Play.
- [`asset-anchor-lab-731-bookcase-scene-nudge.png`](asset-anchor-lab-731-bookcase-scene-nudge.png) — **viewed fixture judgment:** preset base remains `(-0.927,0,-0.330)m`; explicit Z trim `-0.200m` yields effective `(-0.927,0,-0.530)m`. Copy labels it scene-specific rather than changing the preset.
- [`asset-anchor-lab-731-six-facings-play.png`](asset-anchor-lab-731-six-facings-play.png) — **viewed:** E/NE/NW/W/SW/SE keep the Calibrated-only bookcase, owning center, visible wall face, nominal plane, and local-forward references legible under the shared Play camera.
- [`asset-anchor-lab-731-torch-raw-start.png`](asset-anchor-lab-731-torch-raw-start.png) — **viewed Raw-only start:** the labelled raw torch is at the owning center/floor; no cyan answer or mystery duplicate remains.
- [`asset-anchor-lab-731-torch-orbit.png`](asset-anchor-lab-731-torch-orbit.png) / [`torch-play`](asset-anchor-lab-731-torch-play.png) — **viewed Calibrated-only answer:** the wall-face candidate is the only torch copy; its label remains readable against both measured visible face and nominal-plane references.
- [`asset-anchor-lab-731-torch-scene-nudge.png`](asset-anchor-lab-731-torch-scene-nudge.png) — **viewed repeated fixture judgment:** preset base stays `(0,+1.182,-0.790)m`; Z trim `-0.200m` yields effective `(0,+1.182,-0.990)m`. The nearby copy reports the measured wall span/sign discrepancy and does not promote this to asset metadata.
- [`asset-anchor-lab-731-fighter-standing-play.png`](asset-anchor-lab-731-fighter-standing-play.png) — **viewed Raw-only accepted baseline:** one `RAW INPUT` standing fighter is centered on q0,r0,s0 with base on floor.
- [`asset-anchor-lab-731-fighter-downed-raw-start.png`](asset-anchor-lab-731-fighter-downed-raw-start.png) — **viewed Raw-only defect truth:** one labelled downed input remains centered `1.452m` off-hex on negative local Z; there is no cyan copy falsely presented as calibrated.
- [`asset-anchor-lab-731-fighter-downed-play.png`](asset-anchor-lab-731-fighter-downed-play.png) / [`downed-orbit`](asset-anchor-lab-731-fighter-downed-orbit.png) — **viewed Calibrated-only diagnostic:** the only fighter copy is labelled `DIAGNOSTIC · CENTER ONLY`; visible center is on the owning hex and base is on floor in both cameras. This visual aid remains classified as re-export defect evidence.

## Open judgments / exact next experiments

1. **Forward axis:** the lab makes its local `+Z` probe explicit rather than silently claiming a production forward convention. Before any anchor contract, inspect exporter/root conventions across several props and characters and decide whether a semantic forward axis is asset-authored or family-specific.
2. **Shared wall-contact calibration:** repeat bookcase/torch against several real wall GLBs and authored rooms. Decide whether contact targets measured room-side faces, nominal edge planes, or explicit authored clearance. Resolve the observed negative `-0.20m` visual trim versus positive `+0.212m` nominal-to-near-face measurement before any shared contract.
3. **Torch height ownership:** repeat the ornate torch on at least three wall styles/heights and in a real authored room. If one eye line remains correct, it may become stable attachment metadata; otherwise height is authored scene intent.
4. **Bookcase footprint:** reconcile the measured one-cell-ish visible width with the existing manifest's two-hex footprint in the owning collision/placement design. This lab did not change or validate gameplay occupancy.
5. **Standing skinned bounds:** the fighter's runtime posed bounds are `2.167m` wide. Determine whether calibration should measure a named neutral pose, raw bind pose, or conservative animation envelope before using bounds on animated characters.
6. **Downed family:** execute `rpg-game-assets#43` across all 13 canonical outputs, then rerun this same lab with raw origin. The discriminating pass condition is that the raw downed center lands near the standing origin without any web candidate translation.

Technical and visual-contract evidence is ready for Kirk's local re-review. No merge conclusion is claimed before that eyeball gate. Production follow-ups remain deliberately unimplemented pending his verdict.
