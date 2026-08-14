# Attack-die 3D development concept

This development-only lab is available at `?concept=attack-die-3d` in a Vite
**development-mode** build. It is authoring and diagnostic tooling, not a
production feature or an asset contract. `CombatPresentation`, `DiceTray`, and
`EncounterView` remain the only production sequencing surfaces.

> **PROVISIONAL:** The Tray fixture uses the inspected lightning GLB and a provisional result-10 calibration pose. It proves one supplied authoritative result 10; it is not a promoted 1–20 face contract.
>
> **FIXTURE DELIVERY:** Roller and Spectator consume the same in-memory append-only event array through the shared component contract. This proves component inputs and local witnessing, not production transport.
>
> **SCOPE:** This lab renders one attack d20 only. It contains no production combat/FIFO, encounter, network, profile/loadout, ownership, inventory, persistence, or damage-dice wiring.
>
> **DEFERRED:** Additional collectible identities, asset-owned full-face metadata, device/profile graduation evidence, and production adapters remain outside this completion slice.

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
- **Tray** is the fixed-result-10 fixture gameplay composition. It shows the real
  default-open dock and combat log, Player and Monster modes, and event-fed
  Roller and Spectator drawers. Player offers **Roll d20** plus optional
  grab/move/release; Monster receives one fixture-host release.

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

For interactive review, build the Concepts Lab in development mode and serve the
result locally:

```bash
export VITE_ATTACK_DIE_WEB_COMMIT=$(git rev-parse HEAD)
npm run attack-die:build
npm run preview -- --host 127.0.0.1 --port 4173
```

The private provider is copied into the local build by Vite. Verify again that
its source and built bytes are ignored/untracked before any commit.

## Interactive Tray review

Open `http://127.0.0.1:4173/?concept=attack-die-3d`, then:

1. Select **Tray**. While the controlled provider is pending, the page shows a
   result-free polite loading status and mounts no drawer, presentation, or
   Canvas. Once ready, the parent-supplied scene and sidecar are shared by both
   drawers without a Tray-added GLB request.
2. Keep **Player** selected. Roller and Spectator remain armed indefinitely and
   conceal result 10 until an explicit **Roll d20** or accepted release. There
   is no timeout or automatic Player release.
3. Optionally select **Grab d20**, move the pointer, and release outside the
   drawer. Pointer origin/current/path samples stay local. Only one sanitized,
   compact, frozen release crosses the fixture-host callback. Cancelled, lost,
   rejected, or uncertain capture stays armed and emits nothing.
4. Observe both literal shared components consume the same append-only event
   values. Roller alone can request the Player release; Spectator has no Roll,
   Grab, or request authority. Each pane owns a distinct renderer generation,
   telemetry callback, Canvas, and WebGL context, so it settles from its own
   matching observation.
5. Switch safely to a new Player presentation and use the real **Roll d20**
   button. It emits one zero-gesture release. Gesture values change decoration
   only; they never generate, reroll, bias, or replace authoritative result 10.
6. Switch to **Monster**. Both panes begin request-only and callback-free. After
   250 ms the fixture host appends exactly one release; neither rendered
   consumer is an autoplay producer.
7. Enable the lab's **Reduced motion** control or the OS preference before
   entering Tray. Input is still required. One explicit release settles each
   pane through its own lifecycle on exact result 10, without tumble.
8. For a private failure check, lose the real Roller WebGL context. While armed,
   the result remains concealed and Spectator stays live. After one real release,
   Roller converges to truthful result-10 SVG while Spectator settles from its
   own live renderer telemetry.
9. Inspect the real default-open dock/log at `1440×1080`, `1241×900`,
   `1240×900`, and `760×900` with DPR 1. Desktop and 1241 show two full 356 px
   columns with at least 24 px Spectator/log clearance. At 1240 the drawers
   stack. At 760 the order is map → Roller → Spectator → log → dock, with
   readable numerals, positive gaps, vertical page scrolling, no horizontal
   overflow, and no overlap or renderer/Canvas transform.

The fixture gives the real `EncounterDock` structured `CombatLogEntry[]` facts.
Visible combat prose is generated by the real `CombatLog`; the concept does not
supply authored descriptions, messages, HTML, URLs, or transport fields.

Unknown, malformed, stale, duplicate, reordered, truncated, hostile-getter, and
hostile-proxy event behavior is covered at the shared contract boundary in
`dicePresentationEvent.test.ts` and `DiceTrayPresentation.test.tsx`. It is not a
concept-authored projector, and reviewers must not fabricate these inputs by
mutating React Fiber props or reducers. Private Fiber inspection may observe
real props/identity and invoke actual telemetry callbacks only.

## Frozen Roll/Verify evidence

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

The existing evidence driver is the older Roll/Verify surface, not paired Tray
proof:

```bash
npm run attack-die:evidence -- \
  --url 'http://127.0.0.1:4173/?concept=attack-die-3d' \
  --out /tmp/attack-die-evidence \
  --build-manifest /tmp/attack-die-build.json \
  --all-results --animated --reduced-motion [--force shader]
```

Its `--all-results` mode expects healthy mapped 3D settlement. It does not prove
the Tray's two literal consumers, shared fixture event array, provider gate, or
fixed-result-10 flow. Keep every output labeled:

> `PROVISIONAL — NOT GRADUATION EVIDENCE`

Private Task 7 PNG, JSON, numbered-frame, GIF, and hash paths under
`/home/kirk/game-dev/.verification/interactive-dice-tray/task-7/` are review
artifacts only. They are not public assets, asset metadata, or graduation
evidence, and none may be staged.

## Deferred promotion evidence

Physical touch hardware, a live backend, real Discord Activity/mobile/low-GPU
runs, full asset-owned face metadata, production adapters, and honest
performance graduation remain deferred. The current paired performance driver
does not independently bind its supplied manifest to the bytes served by its
base URL. Task 7 therefore does not run or cite `npm run perf:attack-die` as a
passing result. Correct manifest binding and actual device/profile evidence are
required before any performance claim.
