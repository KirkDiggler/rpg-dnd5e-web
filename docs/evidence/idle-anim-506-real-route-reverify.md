# Live re-verification: idle animation on class character models (#506/#509)

Re-verification of #509 after its ownership transfer to the asset-pipeline
lane (see the PR's ownership-transfer comment). Original evidence on this PR
was captured via the `/playtest` harness against assets that predate
assets#4-#10 and rpg-game-assets#11; per the new house rule, this re-run
uses the **real game route** (Home → character select → Play → lobby →
Start → `EncounterView`), not `/playtest`.

## Environment

No backend was available in the working sandbox out of the box (no Go,
Redis, or Docker installed, no passwordless sudo to install them). Rather
than substitute harness evidence, a full local stack was built from
scratch, all user-space, no root required:

- **Go 1.25.3** — downloaded and extracted to a local GOROOT (matches
  rpg-api's `go 1.25.3` toolchain pin).
- **Redis 7.4.1** — downloaded and compiled from source
  (`make BUILD_TLS=no`), run on a non-default port.
- **rpg-api** — built from `main` at the time of this verification
  (`AUTH_DEV_MODE=true`, pointed at the local Redis).
- **grpcwebproxy** (`improbable-eng/grpc-web`) — a single Go binary standing
  in for the Envoy grpc-web translation `rpg-deployment`'s docker-compose
  path would normally provide; there is no Docker in this sandbox either.
  Functionally equivalent to Envoy for this purpose: translates the
  browser's grpc-web wire format to plain gRPC for `rpg-api`.
- **This branch's `npm run dev`** (Vite), with `?playerId=` overrides for
  the dev auth bypass (`useDevPlayerIdAuth`), matching the existing
  two-tab-playtest convention already used elsewhere in this codebase.
- Driven with a small Playwright script (not Chrome DevTools MCP, which
  isn't available in this environment) — real Chromium, real clicks, real
  network calls to the stack above.

Assets: `npm run assets:sync` against `rpg-game-assets` **main post-#11**
(the #522 monk/rogue idle-retarget PR merged mid-verification; re-synced
and re-checked after the merge — see clip counts below).

## Real characters, created through the real wizard

Two real, finalized characters were created via the actual
character-creation wizard (name → race → class → background → abilities →
Begin Adventure), not devseed fixtures — Tiefling was used for race on both
(no extra required sub-choice, unlike Human's language pick, keeping the
flow deterministic across two builds):

- **Fighter Final3** — Tiefling Fighter, HP 11/11 — the clip-less case.
- **Monk Final11** — Tiefling Monk, HP 9/9 — the multi-clip case.

Both were played into a real solo lobby (Create Lobby → Ready → Start),
landing in the real `EncounterView`/`GameView` route — the same component
tree production players use, not `/playtest`'s `PlaytestMap` adapter.

## Clip-less handling (Fighter, Barbarian) — no error, no spin

Parsed `fighter.glb`/`barbarian.glb` on the synced `main` assets directly:
0 animation clips on both (junk stripped in the asset cleanup; the
Big-Rig retarget is still pending per the asset-pipeline tracking issue).

**`idle-anim-506-clipless-fighter-t0.png` / `-t1.png`** — two frames of
Fighter Final3 on the real `EncounterView`, ~1s apart, zero interaction in
between. I viewed both frames; they are **byte-identical**
(confirmed via direct file comparison, not just eyeballing) — the model
renders correctly (visible weapon, correct pose, correct scale) and stays
perfectly static, exactly the expected behavior for a clip-less model:
`resolveIdleClipName([])` returns `undefined`, the idle-clip effect no-ops,
and the `useFrame` invalidate heartbeat gates off (`hasIdleClip` is
`false`), so the demand-frameloop canvas does not spin for a model with
nothing to animate. No console errors, no page errors, during the entire
session (checked via `page.on('pageerror')`/`page.on('console')`
listeners — the only console entries at all were the pre-existing benign
`StreamEncounter` `AbortError` on navigation teardown, unrelated to this
PR).

## Multi-clip playback (Monk, Rogue) — plays an idle-named clip

Parsed `monk.glb`/`rogue.glb` on the synced `main` assets (post
rpg-game-assets#11): **3 clips each** —
monk: `Idle_Drinking`/`Idle_Meditative`/`Idle_Relaxed`;
rogue: `Idle_CheckWatch`/`Idle_Drinking`/`Idle_Relaxed`. All match
`resolveIdleClipName`'s `/idle/i` filter, so it deterministically picks
whichever comes first in the GLB's clip array (`Idle_Drinking` for monk).

**`idle-anim-506-monk-multiclip-t0.png` / `-t1.png` / `-t2.png`** — three
frames of Monk Final11 on the real `EncounterView`, ~1.5s apart, zero
interaction in between, cropped tight on the model. I viewed all three
frames: t0 shows the model with one arm extended low; t1 shows a
transitional mid-swing pose; t2 shows the arm raised high with a visible
held item — an unambiguous, continuous pose change across all three
captures, confirming the resolved clip (`Idle_Drinking`) is genuinely
looping, not stuck. All three files are pairwise distinct (byte-compared,
not just visually) — the direct contrast with the fighter pair above
(byte-identical, correctly static) is itself part of the evidence that the
code path is discriminating clip-less vs. multi-clip models correctly
rather than, say, always looking static due to a broken effect.

## #512 — downed model visibility, verified in-game

Fighter Final3 was driven to 0 HP on the real route: `rpg-api`'s
`cmd/devseed --inject-combat --encounter-id=<real encounter id>` (obtained
from the real `GetMyActiveLobby` response for this session) added goblins
into the **already-real**, lobby-started encounter without touching the
existing player — the tool exists for exactly this ("a real fight on
GameView", rpg-api#634) — then turns were passed until the goblins'
attacks brought Fighter Final3 to 0 HP.

**`downed-512-real-route.png`** (tight crop) / **`downed-512-real-route-wide.png`**
(full view, header reading `HP: 0/11`, `Unconscious`, `active:
char_8d9b9450-...`, sidebar confirming `HP 0/11 · AC 12`, `Unconscious`,
every action row reading `no action remaining`) — I viewed both frames:
the downed model renders as a small, flat, collapsed silhouette lying on
the hex floor at the correct scale relative to the surrounding walls (not
floating, not oversized, not missing) and the correct
ground-plane orientation for a collapsed pose. This is the real
`EncounterView` route, not `/playtest` — the in-game verification the
game team asked for on #512, now delivered by the asset-pipeline lane per
the ownership transfer.

## Judgment calls

- Tiefling was used as race for both test characters rather than the
  default Human, specifically to avoid Human's extra-language sub-choice —
  not a functional constraint on this PR, purely a test-authoring
  simplification to keep the wizard flow deterministic.
- The character-creation wizard's race/class/background pickers mix real
  `<button>` elements with plain `onClick`-bearing `<div>`s (e.g. the
  ability-score assignment tiles carry `data-testid="score-slot-15"` etc.)
  — noted here only because it shaped how this verification's driver
  script was built, not a code-quality note on the app itself.
