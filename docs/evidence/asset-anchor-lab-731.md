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
- The magenta raw model/bounds remain rendered. Cyan is the candidate + bounded adjustment. Gold is the raw model origin and the lab's explicit local `+Z` direction probe. Orange is the real synced wall piece plus a high-contrast wall-plane outline.
- Candidate meanings are deliberately semantic and local: raw origin, visible-bounds center/floor, and measured back-face/wall. They are not proposed production field names.
- Adjustment is local X/Y/Z in 5 cm steps, clamped to exactly ±25 cm, and reset returns to the selected measured candidate.
- The same candidate transform feeds Orbit and Play. Play uses the existing tactical orthographic constants; there is no camera-only compensation.
- Provisional output stays withheld until a person explicitly selects a candidate, visits Orbit and Play, and visits all six canonical facings. The fighter additionally requires all six for standing **and** downed.

## Runtime measurements from the loaded GLBs

Measurements below are the running Three.js `Box3` result after the shared `0.75` render scale, not nominal fixture dimensions or placeholder geometry.

| Case | Actual URL | Visible min (m) | Visible max (m) | Center / salient result |
|---|---|---|---|---|
| bookcase | `/models/synty/props/SM_Prop_Bookcase_Small_01.glb` | `(0.127, 0.000, -0.003)` | `(1.726, 2.514, 0.662)` | center `(0.927, 1.257, 0.330)` — raw origin is a floor/back-side corner, not visible center |
| ornate torch | `/models/synty/props/SM_Prop_Torch_Ornate_01.glb` | `(-0.086, -0.333, -0.076)` | `(0.086, 0.269, 0.076)` | centered in X/Z; raw Y is near geometric center, so raw origin puts a wall fixture at floor level |
| fighter standing | `/models/synty/characters/fighter.glb` | `(-1.083, 0.000, -0.243)` | `(1.083, 1.390, 0.239)` | centered near token origin; current posed/skinned bounds are broad in X |
| fighter downed | `/models/synty/characters/fighter-downed.glb` | `(-0.537, -0.243, -2.156)` | `(0.529, 0.239, -0.748)` | center `(-0.004, -0.002, -1.452)` — the body is wholly on one side of the shared origin |

Actual network/runtime proof is committed as [`asset-anchor-lab-731-runtime-proof.json`](asset-anchor-lab-731-runtime-proof.json): all four required GLBs returned HTTP 200 with `model/gltf-binary`; the shared wall GLB and floor texture also returned 200. The capture run recorded **zero page errors and zero console errors**. Four Chromium `ReadPixels` GPU-stall performance warnings occurred while taking screenshots; they are capture noise, not app/runtime failures.

## Five-way classification ledger

| Representative case | Classification | Why this category owns it | Categories rejected / separated |
|---|---|---|---|
| corner-pivot bookcase | **Asset anchor metadata** | The exact GLB's visible center is consistently `+0.927m X / +0.330m Z` from its raw origin. Canceling that corner pivot is intrinsic to every use of this variant and stays correct through the six-facing sweep. | Not a re-export defect: the pivot is coherent and usable. Not a scene-specific nudge: the same normalization follows the model. Not a per-variant anchor: this probe has one bookcase variant. Not established here as a true multi-hex correction: visible width is `1.599m` versus `1.732m` adjacent hex-center spacing; the existing manifest's `footprintHexes: 2` is a separate collision/placement judgment this web-only Learn does not ratify or rewrite. |
| ornate torch | **Asset anchor metadata** for back-face/wall registration; **scene-specific placement nudge** for mount height until a repeated-scene experiment proves a default | X/Z are intrinsically centered; the useful stable correction is registering the measured back face to the wall plane. The fixture's `1.15m` visual mount line looked readable in Orbit and Play, but one scene cannot prove that height belongs to the asset. | Bounds-center/floor is rejected for a wall fixture: it grounds the torch on the hex. Raw origin is rejected as a complete placement anchor for the same reason. No evidence of re-export defect, per-variant anchor, or multi-hex footprint. |
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

All captures are 1440×900 local Chromium against the real Vite runtime and actual synced GLBs.

- [`asset-anchor-lab-731-bookcase-orbit.png`](asset-anchor-lab-731-bookcase-orbit.png) — **viewed:** magenta raw bookcase/bounds sit corner-offset from the gold origin; cyan visible-center/floor candidate is centered over the same highlighted hex. The orange wall reference remains visible from the authoring angle.
- [`asset-anchor-lab-731-bookcase-play.png`](asset-anchor-lab-731-bookcase-play.png) — **viewed:** the shared tactical projection shows the same raw/calibrated separation at facing SE; no camera-specific correction appears.
- [`asset-anchor-lab-731-six-facings-play.png`](asset-anchor-lab-731-six-facings-play.png) — **viewed:** E/NE/NW/W/SW/SE all rotate the raw and calibrated bounds, origin probe, and wall reference together under Play. The cyan candidate stays associated with the highlighted owning hex while the magenta corner-pivot result rotates around it.
- [`asset-anchor-lab-731-torch-orbit.png`](asset-anchor-lab-731-torch-orbit.png) — **viewed:** magenta raw torch is upright at the hex center/floor; cyan wall-face candidate is centered on the orange wall at the fixture-only eye line. The large gap rules out foreshortening as the explanation.
- [`asset-anchor-lab-731-torch-play.png`](asset-anchor-lab-731-torch-play.png) — **viewed:** the tactical camera shows the same torch on the same wall plane; raw remains visible on the owning hex.
- [`asset-anchor-lab-731-fighter-standing-play.png`](asset-anchor-lab-731-fighter-standing-play.png) — **viewed:** standing fighter remains centered on q0/r0/s0; raw and bounds-center candidate nearly coincide.
- [`asset-anchor-lab-731-fighter-downed-play.png`](asset-anchor-lab-731-fighter-downed-play.png) — **viewed:** after the in-place variant toggle, magenta downed raw bounds lie almost entirely beyond the hex on negative local Z, while cyan diagnostic centering remains on the unchanged q0/r0/s0. This is the clearest re-export-defect evidence.
- [`asset-anchor-lab-731-fighter-downed-orbit.png`](asset-anchor-lab-731-fighter-downed-orbit.png) — **viewed:** the second angle confirms the downed displacement is geometric, not tactical-camera foreshortening.

## Open judgments / exact next experiments

1. **Forward axis:** the lab makes its local `+Z` probe explicit rather than silently claiming a production forward convention. Before any anchor contract, inspect exporter/root conventions across several props and characters and decide whether a semantic forward axis is asset-authored or family-specific.
2. **Torch height ownership:** repeat the ornate torch on at least three wall styles/heights and in a real authored room. If one eye line remains correct, it may become stable attachment metadata; otherwise height is authored scene intent.
3. **Bookcase footprint:** reconcile the measured one-cell-ish visible width with the existing manifest's two-hex footprint in the owning collision/placement design. This lab did not change or validate gameplay occupancy.
4. **Standing skinned bounds:** the fighter's runtime posed bounds are `2.167m` wide. Determine whether calibration should measure a named neutral pose, raw bind pose, or conservative animation envelope before using bounds on animated characters.
5. **Downed family:** execute `rpg-game-assets#43` across all 13 canonical outputs, then rerun this same lab with raw origin. The discriminating pass condition is that the raw downed center lands near the standing origin without any web candidate translation.

No blocker remains for reviewing this Learn PR. Production follow-ups remain deliberately unimplemented pending Kirk's verdict.
