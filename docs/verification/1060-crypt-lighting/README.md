# Crypt prop lighting calibration — #1060

## Finding and correction

The shared crypt fill (`ambient=0.2`, `directional=0.1`) crushes dark textured
PBR surfaces to almost black. The affected single-leaf compositions use the
same renderer as World Builder; the GLBs and embedded textures are intact.

Kirk's saved **Sewers** scene was read through `GetDungeon`, compiled with
`PutDungeon(validateOnly=true)`, and opened through the normal Dungeon Builder
**Open → Sewers → 3D preview** path. Four braziers and two composition-authored
torches all resolve to point lights: none is culled by the 12-source budget.
The braziers are at Y=1.1, intensity 2.8, range 5.5, inverse-square decay 2;
the authored torches are at Y=0.8, intensity 1.5, range 2.6. Local lighting
reaches the cage much more strongly than the rack's camera-facing surfaces.

The correction is the existing shared fill pair **ambient 0.8 / directional
0.4**. This was the lowest of three tested pairs that restored useful surface
detail in the integrated scene while preserving local-light contrast. No
materials, textures, source presets, source budget, region intensity, floor
pool behavior, builder inspection lights, or legacy fallback values change.
The runtime cost remains one ambient and one directional light.

## Visual evidence

- [Before](before.png): the normal 3D preview with only the two fill intensities
  reverted in the browser to 0.2/0.1.
- [After](after.png): the normal 3D preview using the corrected source defaults.

Both captures use the same loaded Sewers document, composition records, GLBs,
point lights, orthographic camera and tone mapping. The camera was positioned
at the rack for comparison. No save or play action was invoked, and the human's
running game was not changed. This proves the shared environment through the
real **builder preview**, not a fresh multiplayer/session walk.

A separate composed-environment probe added the existing fighter beside the
same saved geometry to check character and older-pillar response. Measuring
only opaque pixels of each affected prop (screen-space luma below 5/255 counts
as near-black), with the same six local lights:

| Prop              | Near-black pixels before | After | Median luma before → after |
| ----------------- | -----------------------: | ----: | -------------------------: |
| Torture Device 01 |                    93.6% |  7.2% |               1.93 → 13.70 |
| Cage 03           |                    29.2% |    0% |               7.90 → 15.61 |

Those measurements describe this specimen/camera, not a universal perceptual
brightness guarantee. The human remains the final judge of the treatment,
particularly in the deployed Discord renderer. True regional ambient on every
mesh remains deferred by the existing authored-lighting design; this changes
only its calibrated global fill, not that approximation.

## Repeatable regression

After installing dependencies and syncing the private assets:

```sh
node scripts/check-crypt-lighting.mjs
# Or use an already-installed Chromium, without installing/changing global tools:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
  node scripts/check-crypt-lighting.mjs node_modules/.cache/crypt-lighting-check
```

The check starts and closes its own loopback Vite/Chromium processes. It makes
no API calls and saves six screenshots plus `measurements.json`. It exercises
`DungeonEnvironment → CompositionPlacementModel → WorldPropModel` with the real
GLBs in source-free dim, nearby warm, and nearby cool lighting. A floorless
specimen and opaque-pixel mask prevent the separately lit floor/background
from satisfying the model-legibility assertion. It fails on missing resources,
browser errors, predominantly black surfaces, or lost point-light response.
This is an explicit local visual gate, not silently skipped Vitest coverage;
it needs private assets and a working Chromium installation.

Red/green was observed: the old pair fails with every sampled rack pixel below
5/255; the new pair passes the dim-legibility and both source-response checks
for both assets. Focused lighting/environment tests also pass (33 tests).

Asset hashes (unchanged, matching the local runtime copy):

- `torture_device_01.glb`: `18b60f4ca0b344667984275245b1dd01d9fd109082cefc9a5068166362baa390`
- `cage_03.glb`: `6e7f10959654ee45d5e0ea29282a2a0b9936f13f8b0af2826f0d1582d4b3e558`

No licensed source files or GLBs are included in this evidence directory.
