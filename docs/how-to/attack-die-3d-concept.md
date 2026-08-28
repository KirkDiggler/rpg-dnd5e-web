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
> size `491312` bytes. The corrected generated provider manifest SHA-256 is
> `9c2d08b53442e6307ea4235103495f33fd4678b0363d9721bafa7f162dac1c74`;
> its source-manifest identity is
> `46f50f32b27e16d2c5e984b07a0612a6fab890834d9ae3a4cba7a4dcf05059f7`.
> The material-free partition has exactly 2,684 body triangles and 7,798
> numeral triangles.
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
> **SCOPE:** The Stone 1 pane renders one attack d20. The Task 8 substage adds
> fixture-only multi-die attack/damage groups without production combat FIFO,
> encounter, network, loadout, inventory, persistence, or game-rule wiring.
> Stone 1 graduates only the local tactile controller, compact shared visual
> throw profile, deterministic visual solver, and paired witness proof; Task 8
> remains a local feel bench and does not move authoritative result or transport
> ownership.

## Shared-table feel review (web #826 Task 8)

Launch the exact Tray route:

```bash
npm run dev -- --host 127.0.0.1 --port 3010
# open http://127.0.0.1:3010/?concept=attack-die-3d&attackDieStage=tray
```

The existing Stone 1 gameplay-placement pane remains first and continues to
publish `window.__stone1TrayEvidence`. The separate **Shared table dice feel
lab** below it mounts two literal shared roll-group presentations and publishes
only generation-fenced rendered attachment facts through
`window.__sharedTableDiceEvidence`.

1. Throw Weighty, Energetic, and Physical with every scenario in the select.
2. Confirm Roller alone has release controls and Witness sees the same simulated
   delivery.
3. Watch the two-witness barrier: verdict/damage never advances after only one
   exact renderer generation completes.
4. Check that Great Weapon Fighting gives only the supplied affected dice a
   high-contrast flash, then verify ordered modifier toasts, the supplied final
   total, missing/duplicate delivery, reduced motion, and semantic provider
   fallback. With assistive output enabled, confirm originals include source and
   contributor, each supplied reroll includes before/after and reason, and the
   supplied modifier/total/impact facts are announced once in order.
5. At `1024px` and below, confirm controls remain above both panes. At narrow
   touch width, use the accessible Roller/Witness tabs and confirm Replay stays
   reachable without scrolling past the tray.

`sharedTableDiceDelivery.ts` is the only missing-release scheduler. The strict
runtime scenario parser validates the complete player/set/group/contributor and
preset graph before either tray mounts; malformed records show a refusal rather
than partial fixture content. Scenario, candidate, reduced-motion, and Replay
changes replace prior events, cancel old local timers, and clear the Task 8
evidence bridge. Non-d20 carved assets are
explicitly provisional. See `src/concepts/attack-die-3d/CONTRACT.md` and
`docs/evidence/826-shared-table-dice/README.md`; both retain **Kirk feel gate:
pending live review** until Kirk throws the stage.

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
   `760×900` after releasing result 10 and awaiting both held 3D witnesses. The
   browser records Canvas visibility (not numeral identity) and the actual map,
   Roller, Spectator, log, dock, and preview rectangles, then validates breakpoint
   order, gaps, containment, dock clearance, and horizontal overflow before
   capture. Numeral identity comes separately from each renderer's
   `observedUpwardResult`, upward dot, and upward margin telemetry.

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
for attempt in $(seq 1 80); do
  curl -fsS 'http://127.0.0.1:3003/?concept=attack-die-3d' >/dev/null && break
  sleep 0.25
done
curl -fsS 'http://127.0.0.1:3003/?concept=attack-die-3d' >/dev/null
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
npm run attack-die:stone0-evidence -- \
  --url 'http://127.0.0.1:3003/?concept=attack-die-3d' \
  --out "$OUT" \
  --build-manifest "$BUILD_MANIFEST" \
  --source-sha "$SHA"
kill "$PREVIEW_PID"
trap - EXIT
```

The pure schema-v2 `stone0TrayEvidenceProtocol` rejects stale
source/build/provider identity, any provider hash other than the exact corrected
manifest, any GLB hash other than the exact Original D20 digest, roles other than
2,684 body/7,798 numeral triangles, duplicate manifest/GLB requests or
transfers, incomplete/reordered 1–20 rows, or either renderer reporting an
upward result different from the request. `exactTargetHeld` remains a separate
diagnostic and cannot stand in for upward observation. The protocol also
rejects non-decisive upward dot/margin values, non-visible Canvases,
shared witness ownership, duplicate/malformed scenarios or filenames,
non-empty validation failures, unexpected console/page errors, and a directory
with both PASS and FAILED markers.

The package rereads and binds the parsed build, browser, network, and console
JSON; exact 78-context ID/count matrix; exact console location/message matrix;
20 full-page result PNGs; 40 Roller/Spectator well close-ups; and 18 scenario
PNGs. Before any bulk inflation, IHDR preflight sums the expected RGB bytes and
requires the package to remain within a 1.5 GiB aggregate decoded-byte budget.
That bound accepts the reviewed package's 1,370,878,587 RGB bytes with about
17.5% growth room while rejecting hostile multi-image totals. Every PNG must
then have complete signature/IHDR/contiguous IDAT/IEND framing, valid chunk
CRCs, the supported 8-bit truecolor non-interlaced screenshot profile,
successful zlib inflation, exact scanline lengths, and legal filters. PNGs are
decoded exactly once in sequence; ordinary screenshots retain only dimensions,
the pending screenshot retains only its region-contrast result, and filter
reconstruction keeps only previous/current rows. Close-ups are captured at
browser device scale factor 3, include the whole
witness well, and must be at least 220×220 physical pixels in both their browser
facts and decoded PNG dimensions. Missing, substituted, reordered, truncated,
corrupt, undersized, or contradictory package artifacts fail.

The driver starts on the dedicated `attackDieStage=tray` route, so historical
Lightning loading remains dormant. Before the pending-provider screenshot it
waits for the effective opacity of the status and every ancestor to reach full
opacity, waits a double animation frame so at least one paint occurs after
stabilization, and requires at least 4.5:1 computed status contrast. It binds
the physical status region, and package validation independently decodes that
PNG region and requires a 4.5:1 luminance range. Near-black mid-transition
loading evidence cannot package-pass. Every exact `localhost:8080` RPC is fulfilled
by a driver-owned deterministic successful gRPC-Web empty-protobuf envelope;
unknown URLs or methods fail. Each
console message records `consoleMessage.location()`, and only the exact
missing-manifest 404 URL/message in that scenario is allowed. The two actual
`DiceTrayPresentation` boundaries publish read-only event-array and provider
object identities, and browser facts compare the measured per-witness IDs rather
than self-asserting shared values.

The driver uses a fresh browser context per observation and deterministic
response mutation for missing/malformed/incomplete manifests, GLB hash mismatch,
and invalid geometry. It uses the explicit synthetic-only controls for unknown
safe preset/unmapped-result and a real `WEBGL_lose_context` extension for context
loss. JSON and screenshots are first written under a temporary package root,
hashed, reread, and validated. Only then are artifacts published and an atomic
`package-manifest.json` plus `PASS` marker written. The directory contains:

- `browser-evidence.json`
- `network.json`
- `console.json`
- 20 full-page result screenshots, exactly 40 result well close-ups, and 18
  deterministic scenario screenshots
- schema-v2 `package-manifest.json` and the final `PASS` marker
- `preview.log` and `build-manifest.json`

All output remains private under
`/home/kirk/game-dev/.verification/interactive-dice-tray/stone-0/<SHA>/`.
Never stage evidence JSON, logs, hashes, PNGs, GIFs, or provider bytes. If a
browser defect requires a fix, preserve the failed SHA output for diagnosis,
commit that fix, and capture only into the new exact-SHA directory. A machine
PASS does not claim Kirk review or independent visual approval; those reviews
remain explicitly pending until performed.

## Exact-commit Stone 1 tactile evidence

Stone 1 keeps pointer samples, capture IDs, timestamps, DOM bounds, held pose,
and sample history local to the eligible Player Roller controller. Before
release, Roller alone may be grabbed and no release/profile is shared.
Pointer-up appends one release-schema-2 event carrying one
`VisualThrowProfile@1`; Roller and Spectator strictly parse deep-equal frozen
snapshots while retaining distinct renderer contexts, runtime clones, and final
observations. The controller and renderer never choose the authoritative result.
The deterministic solver owns decorative die/shadow motion and converges to the
provider settlement selected for the unchanged authoritative result.

The profile has only these fields and bounds:

- `schemaVersion: 1`;
- `releasePosition: [x, y]`, with each member in `[0, 1]`;
- `releaseDirection: [x, y]`, either canonical `[0, 0]` with zero speed or a
  unit vector within `0.000001`;
- `releaseSpeed` and `shakeEnergy` in `[0, 1]`;
- `spinBias` in `[-1, 1]`; and
- integer `motionSeed` in `[0, 4294967295]`.

The explicit **Roll d20** keyboard/button path creates the neutral profile
(center position, zero direction/speed/shake/spin). The Monster path has no local
controller: the fixture host creates one presentation-identity-seeded neutral
profile and emits one release after 250 ms. Cancel and lost-capture clear only
local held state and emit no release. Reduced motion keeps a static lifted held
cue and removes tumble, shake, and bounce samples while retaining explicit input
and exact final settlement.

Provider failure and WebGL context loss clear capture/held motion and converge to
truthful SVG settlement after valid release semantics; stale 3D held/profile
telemetry cannot satisfy the evidence bridge. Neutral, unknown-safe-preset, and
synthetic unmapped-result behavior remain the fail-closed development paths
described above. Neither SVG fallback nor a visual profile becomes result
truth, provider authority, or transport authority.

Commit the tracked candidate first, leave the tracked tree clean, synchronize
only the corrected private runtime provider, and capture the exact committed
HEAD with:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
  npm run attack-die:stone1-evidence
```

The command freezes and hashes the tracked build, serves it on a dedicated
loopback port, drives twelve real Chromium contexts, validates screenshot PNGs
sequentially below a 512 MiB RSS ceiling, and writes only under
`/home/kirk/game-dev/.verification/interactive-dice-tray/stone-1/<HEAD>/`.
An accepted directory has `PASS`, `package-manifest.json`, browser/network/
console facts, 12 scenario screenshots, six held/release/settled witness
close-ups, and readable private contact sheets. A failed capture has
`FAILED.txt`; a superseded recapture has `INVALIDATED-PASS.txt` and cannot
satisfy the protocol. Any tracked source change requires a new commit and a new
exact-SHA package. Machine `PASS` does not claim human visual approval.

## Deferred promotion evidence

Stone 1 does **not** graduate production transport or reconnect behavior,
equipped-preset projection, physical touch hardware, a real Discord Activity,
low-GPU/mobile coverage, multi-die groups, rigid-body settlement, or formal
paired performance while the final-context flaw remains. Those areas require
separate ownership and evidence. The Concepts Lab proof also does not claim a
merged production route.
