# Attack-die 3D development concept

This development-only lab is available at `?concept=attack-die-3d` in a Vite
**development-mode** build. It is authoring and diagnostic tooling, not a
production feature or an asset contract. `CombatPresentation`, `DiceTray`, and
`EncounterView` remain the only production sequencing surfaces.

## Stages

- **Appearance** compares Raw/Magical material modes and the top/three-quarter
  cameras with identical pose, viewport, lights, and exposure.
- **Calibrate** begins with zero mappings. Local X/Y/Z buttons provide `15°`
  coarse and `0.1°` fine adjustments. Saving normalizes a proposal pose but does
  not verify the engraved numeral.
- **Roll** takes an authoritative integer 1–20, varies only decorative playback,
  and reports mapped target, renderer/fallback, and measured error.
- **Verify** advances fixed 1→20 animated or reduced-motion observations. Machine
  rows never substitute for pending human top/three-quarter readability review.

All initial camera/light/material values are visibly marked **unverified
provisional defaults**. Exported JSON says `PROVISIONAL — NOT AN ASSET CONTRACT`,
allows 0–20 mappings, and contains no provenance, verification, or human-PASS
claim. Reduced motion suppresses tumble and magical animation. The SVG stays
mounted as semantic truth and is visible on load, WebGL, shader, context-loss,
hash, invalid-result, or unmapped failures.

## Controlled provider exploration

Copy only from the owning asset worktree into the web repository's ignored
provider path. Never commit these private bytes:

```bash
rsync -a --delete \
  /home/kirk/game-dev/rpg-game-assets/.worktrees/attack-die-47/harness/models/synty/ \
  public/models/synty/
git check-ignore -q public/models/synty/
test -z "$(git ls-files public/models/synty/)"
```

The currently available provider has the GLB but no canonical sidecar/map. The
lab may inspect the actual digest/selectors and display the GLB at an unsaved
calibration pose; normal Roll/Verify remain truthful SVG fallback until a result
is explicitly mapped. Do not infer or save face orientations without human
calibration.

## Frozen build

Set the exact reviewed commit and keep the manifest outside `dist`:

```bash
export VITE_ATTACK_DIE_WEB_COMMIT=$(git rev-parse HEAD)
npm run attack-die:freeze-build -- --out /tmp/attack-die-build.json
npm run attack-die:preview -- --dist dist \
  --asset-root public/models/synty \
  --build-manifest /tmp/attack-die-build.json \
  --host 127.0.0.1 --port 4173
```

`freeze-build` requires a clean tracked/index state, withholds the ignored
provider while building/hashing, restores it through a signal-safe trap, and
rejects manifests inside `dist`. Preview rejects traversal and symlinks and
serves the separately mounted provider plus read-only manifest.

Evidence driver arguments:

```bash
npm run attack-die:evidence -- \
  --url 'http://127.0.0.1:4173/?concept=attack-die-3d' \
  --out /tmp/attack-die-evidence \
  --build-manifest /tmp/attack-die-build.json \
  --all-results --animated --reduced-motion [--force shader]
```

Screenshots and JSON are private/local output. They are provisional while human
appearance approval, face calibration, and actual device profiles remain
pending.

## Paired performance

On the real encounter/playtest URL, `?attackDiePerf=1` mounts an independent
overlay driver. It never receives or invokes queue callbacks. Use one
human-supplied real profile and the exact frozen build:

```bash
npm run perf:attack-die -- \
  --base-url 'http://127.0.0.1:4173/?encounterId=REAL_ID' \
  --build-manifest /tmp/attack-die-build.json \
  --profile-file /tmp/real-profile.json \
  --out /tmp/attack-die-perf \
  --samples-per-mode 20 --post-unmount-ms 8000
```

The driver rejects any other sample/window counts, alternates 20 SVG and 20 3D
samples, and enforces candidate p95 ≤110% of SVG, zero new attributable >50 ms
long tasks, and post-unmount p95 ≤110% of SVG. GPU bytes are reported as
unavailable when the browser does not expose them; `renderer.info` proxies are
used instead. Missing desktop Chromium, desktop Discord Activity, or
mobile/low-GPU facts are honest blocked metadata and prevent graduation.
