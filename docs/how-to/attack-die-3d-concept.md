# Attack-die 3D development concept

This development-only lab is available at `?concept=attack-die-3d` in a Vite
**development-mode** build. It is fixture and diagnostic tooling, not a
production transport, profile, or asset-ownership surface. `CombatPresentation`,
`DiceTray`, and `EncounterView` remain the production sequencing surfaces.

> **TRAY PROVIDER:** Tray uses only `dice.original.carved.d20` from the generated
> runtime manifest at `/models/custom-dice/dice-tray-presets.json`. The selected
> model is `/models/custom-dice/original-set/Original_D20_Source.glb`, exact
> SHA-256
> `87bf2d0535023e69c968fb9878ba4ad990df4eeec4b503ebb0e917419c47a77e`,
> size `491312` bytes. The current generated provider manifest SHA-256 is
> `bae0bb907e6b34cb6192f9e0abad2ea2cae23dfe850bf178833ce018e11c8b55`;
> its source-manifest identity is
> `07b55de7b01eb556325edc7d6b30285ecd8ef4991cb69a91c3b8bcea989ca1eb`.
>
> **HISTORICAL LIGHTNING TOOLING:** Appearance, Calibrate, Roll, and Verify still
> inspect the historical Lightning development model. Those non-Tray stages are
> explicitly provisional and never supply Tray's provider.
>
> **FIXTURE DELIVERY:** Roller and Spectator consume the same recursively frozen,
> append-only event array through the shared `DiceTrayPresentation` contract.
> Each owns a distinct renderer generation, runtime clone, telemetry sink,
> Canvas, and WebGL context. This proves component inputs and local witnessing,
> not production transport.
>
> **SCOPE:** The lab renders one attack d20. It contains no production combat
> FIFO, encounter, network, profile/loadout, ownership, inventory, persistence,
> or damage-dice wiring. Tactile roll-group gesture/profile graduation remains
> Stone 1.

## Stages

- **Appearance** compares Raw/Magical treatments and the top/three-quarter
  cameras for the provisional historical Lightning authoring surface.
- **Calibrate** provides local-axis proposal controls. Saving/exporting remains
  provisional and does not verify an engraved numeral.
- **Roll** supplies an authoritative integer 1–20 to the historical provisional
  renderer and keeps decorative playback separate from result truth.
- **Verify** advances fixed 1→20 observations for that historical surface;
  machine rows never substitute for human readability review.
- **Tray** is the Original carved d20 fixture composition. Its explicit
  authoritative result control accepts each integer 1–20 and changes request
  identity before release delivery. It includes Player/Monster modes, the real
  default-open dock and combat log, and literal Roller/Spectator shared
  presentation consumers.

## Tray provider gate and authority

Selecting Tray starts the allowlisted runtime provider. The parent distinguishes
pending from terminal failure:

1. **Pending (`idle`/`loading`)** shows one result-free polite loading status and
   mounts no preview, drawer, shared presentation, or Canvas.
2. **Ready** mounts both shared witnesses. The provider validates the complete
   exact manifest, model size, and SHA-256 before GLTF parse and shares one
   immutable preset/source scene. Each witness prepares and disposes its own
   clone and renderer.
3. **Terminal failed** mounts the same shared presentation with no Canvas. Each
   local renderer lifecycle records the provider failure, keeps the armed result
   concealed as `?`, preserves the Roller **Roll d20** control, and gives the
   Spectator no authority. Truthful SVG result text appears only after the
   matching release event.

Player remains armed indefinitely: neither reduced motion nor elapsed time emits
release. Roller alone may use **Roll d20** or **Grab d20**; Spectator has no Roll,
Grab, or request callback. Monster consumers have no release callback, and the
fixture host appends exactly one zero-gesture release after 250 ms. Decorative
variation, gesture, and host ownership never select or alter the authoritative
mapped target.

The evidence-only renderer exercise is deliberately explicit:

- `unknown-safe-preset` proves the shared neutral SVG path without a caller URL;
- `unmapped-result` is a synthetic lower-level renderer-only exercise and never
  mutates or weakens the complete provider manifest; and
- `shader-failure` uses the existing development failure hook.

Incomplete face maps and invalid geometry partitions are **real manifest parse
failures before model I/O**, not aliases for the synthetic unmapped-result case.

## Private provider boundary

Provider bytes live only under ignored paths and must never be committed:

```bash
git check-ignore -q public/models/custom-dice/
test -z "$(git ls-files public/models/custom-dice/)"
sha256sum public/models/custom-dice/original-set/Original_D20_Source.glb
```

The frozen build withholds both `public/models/synty` and
`public/models/custom-dice`, builds and hashes only tracked web output, then
restores both providers through the signal-safe trap. `serve-frozen.mjs` mounts
those provider roots separately with traversal/symlink containment; provider
bytes never enter `dist` or the frozen build manifest.

## Interactive Tray review

Open the exact development build, select **Tray**, and review:

1. fixture results 1→20, confirming a new request identity before delivery;
2. armed Player concealment and Roller-only authority;
3. independent Roller/Spectator settlement after the shared immutable release;
4. Monster host release with no consumer control;
5. explicit/OS reduced motion, which still requires input and settles without a
   tumble;
6. provider, WebGL, context-loss, and shader failure convergence to truthful SVG;
7. desktop `1440×1080`, boundary `1241×900`/`1240×900`, and narrow
   `760×900` containment, accepted column/stack order, scrolling, log, and dock.

The visible combat prose comes from the real `CombatLog` consuming unchanged
structured `CombatLogEntry[]` fixture facts. The dice fixture does not author
combat descriptions, HTML, URLs, or transport fields.

## Exact-commit Stone 0 evidence

Commit the candidate first. Create a **new** directory named for that exact SHA,
freeze the tracked build, mount private providers separately, wait for readiness,
and run the dedicated Playwright driver:

```bash
SHA=$(git rev-parse HEAD)
OUT=/home/kirk/game-dev/.verification/interactive-dice-tray/stone-0/$SHA
BUILD_MANIFEST="$OUT/build-manifest.json"
test ! -e "$OUT"
mkdir -p "$OUT"
VITE_ATTACK_DIE_WEB_COMMIT="$SHA" \
  npm run attack-die:freeze-build -- --out "$BUILD_MANIFEST"
node scripts/attack-die/serve-frozen.mjs \
  --dist dist \
  --build-manifest "$BUILD_MANIFEST" \
  --synty-root public/models/synty \
  --custom-dice-root public/models/custom-dice \
  --host 127.0.0.1 \
  --port 3003 >"$OUT/preview.log" 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID" 2>/dev/null || true' EXIT
for attempt in $(seq 1 40); do
  curl -fsS 'http://127.0.0.1:3003/?concept=attack-die-3d' >/dev/null && break
  sleep 0.25
done
curl -fsS 'http://127.0.0.1:3003/?concept=attack-die-3d' >/dev/null
npm run attack-die:stone0-evidence -- \
  --url 'http://127.0.0.1:3003/?concept=attack-die-3d' \
  --out "$OUT" \
  --build-manifest "$BUILD_MANIFEST" \
  --source-sha "$SHA"
kill "$PREVIEW_PID"
trap - EXIT
```

The pure `stone0TrayEvidenceProtocol` rejects stale source/build/provider
identity, any GLB hash other than the exact Original D20 digest, duplicate
manifest/GLB requests or transfers, incomplete/reordered 1–20 rows, settlement
above `0.25°`, shared witness ownership, duplicate/malformed scenario rows,
nondeterministic filenames, non-empty validation failures, or unexpected
console/page errors.

The driver uses a fresh browser context per observation and deterministic
response mutation for missing/malformed/incomplete manifests, GLB hash mismatch,
and invalid geometry. It uses the explicit synthetic-only controls for unknown
safe preset/unmapped-result, a real `WEBGL_lose_context` extension for context
loss, and writes:

- `browser-evidence.json`
- `network.json`
- `console.json`
- deterministic result/scenario screenshots
- `preview.log` and `build-manifest.json`

All output remains private under
`/home/kirk/game-dev/.verification/interactive-dice-tray/stone-0/<SHA>/`.
Never stage evidence JSON, logs, hashes, PNGs, GIFs, or provider bytes. If a
browser defect requires a fix, commit that fix, mark/discard the old SHA output,
and recapture into the new exact-SHA directory.

## Deferred promotion evidence

Stone 0 proves authoritative visual settlement in the Concepts Lab. It does not
claim tactile motion, production transport/profile ownership, formal performance
graduation, physical touch hardware, real Discord/mobile/low-GPU device support,
or merged-route completion. The paired performance driver's final-context
binding caveat remains separate work. Tactile roll-group gesture and
`VisualThrowProfile@1` begin only in a new Stone 1 plan.
