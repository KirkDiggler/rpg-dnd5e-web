# Builder-ready crypt prop specimens — web evidence

This directory preserves the broken baseline, Kirk-approved candidate checkpoint,
and the Task 6 exact-merged-provider final captures. Kirk’s final verdict for the
exact merged provider is recorded here.

Review routes:

- Builder fixture: <http://127.0.0.1:3012/?concept=dungeon-builder&authorFixture=crypt-props>
- Live authoring entry: <http://127.0.0.1:3012/?playerId=test-player>

## Provider authority — PR, merge SHA, inventory digest, artifact hashes

- Provider: `KirkDiggler/rpg-game-assets` PR
  [#64](https://github.com/KirkDiggler/rpg-game-assets/pull/64).
- Exact merged commit: `6c24b19861df127faa69bd4d1ab6ec8fdfad537e`.
- Approved feature head: `951ac2a44dd40e0974e102434dbc7164665c571f`.
- The merge and feature commits have the same Git tree:
  `37b17b93e82cea57fc1fa5a6e2dc3a6ed6d95bdb`.
- Exact checkout:
  `/home/kirk/.pi/worktrees/rpg-game-assets/63-crypt-props-merged`, detached
  at the merge SHA.
- Complete provider inventory: `synty-complete-tree`, 2,136 files, tree
  SHA-256 `eaf6e1f2128c0dfe134486c2d1c22ea9c9c4535bcb1adc9306b7522343367191`.
- Inventory document SHA-256:
  `24e629c850185c2859cd0efc6efdead3dbfb04a561b99e5755615c617d9768cb`.

After an explicit `RPG_GAME_ASSETS_PATH` sync, provider and consumer copies
passed both SHA-256 equality and `cmp --silent`:

| Consumer artifact | SHA-256 | Result |
| --- | --- | --- |
| `public/models/synty/props/Crypt_Skeleton_Cage_01.glb` | `fb16c3bed0fb284e37cfbe2914e7dfa2eeae54fb429796ab5ae1526f4126a4af` | byte-identical |
| `public/models/synty/props/Crypt_Skeleton_Table_01.glb` | `be957e0e59b4efff6cbbcafba0a473e4e20f9dbca0a7892691121b8e477a0ff6` | byte-identical |
| `public/models/synty/props/Crypt_Rug_01.glb` | `9f3861707a9b3416b89ddee307662fb7c3d106751f2a3f733ac902b7432184ed` | byte-identical |

## Before — floating cage skeleton, unsupported table skeleton, broken rug

`before-builder.png` preserves the provider-`main` baseline: cage skeleton
without the cage, an unsupported table skeleton, and the disconnected/oversized
rug result. It remains unchanged at SHA-256
`1cd80ad29d843482a1087b172729f1bc1d843aae8d3d11b9f3cffa97f4c3e694`.

## Candidate checkpoint — explicit local provider source

The candidate captures are retained unchanged:

- `candidate-builder.png` — SHA-256
  `7c22c893aaf3ea137d7345cb255ec7b22f0f569e56344d95bbc6c636f8c65905`.
- `candidate-game.png` — SHA-256
  `66052b675b85ace4021a0cfbdf09f77b902fb641714accfc982123322a4867de`.

They record an explicit sync from clean feature commit
`951ac2a44dd40e0974e102434dbc7164665c571f`. The real candidate game path was
Home → Stanthony → Dungeon Builder → Load `/tmp/crypt-prop-showcase.yaml` →
Save → Save & Play. Kirk’s candidate verdict was “looks really good.”

## Builder preview — final exact merged provider

`final-builder.png` is the real **3D preview** after a fresh-context, CDP
cache-disabled hard reload and a new Download. Cage, table, and rug each
returned HTTP `200`; browser console/page errors were empty. The 1600×900 PNG
has SHA-256
`7c22c893aaf3ea137d7345cb255ec7b22f0f569e56344d95bbc6c636f8c65905`.
It is byte-identical to `candidate-builder.png`, consistent with the approved
feature head and exact merge having the same Git tree and artifact bytes.

Full-frame and enlarged-crop read-tool inspection shows the complete cage with
its skeleton contained, the table skeleton beside the plank with skull/forearms
meeting it and pelvis/legs outside, the complete flat red rug, and all three on
the common raised floor surface.

## Playable dungeon — final exact merged provider

`final-game.png` records Home → Stanthony → Dungeon Builder → Load → Save →
Open `Crypt Prop Showcase (crypt-prop-showcase)` → Save & Play against the
isolated lab. The fresh context used CDP cache disable, an explicit hard reload,
and `domcontentloaded`; it did not wait on the intentionally open session
stream. The live tactical route reached `Combat log — live`; all three exact
GLBs returned HTTP `200`. Only one shipped wheel zoom and two shipped right-drag
pans reproduced the approved tactical framing. The 1600×900 PNG has SHA-256
`c1b186f5ea9df22d73493058d1d6317763d846202e4225101199eec7123b4dd4`.

Full-frame and enlarged-crop read-tool inspection confirms the same complete,
contained cage; contacted beside-table pose with trestles readable; flat,
complete rug; and shared floor contact. No prop is hidden behind the fixed
combat log.

## Preview/game identity — shared AtlasPropModel, PropModel, and DungeonSceneLights

Builder preview and playable game both render the approved manifest refs through
shared `AtlasPropModel` → `PropModel` leaves and the same fixed
`DungeonSceneLights`. Both use the shared `DUNGEON_SURFACE_Y = 0.2`; no
per-variant render-scale repair is present. Final captures use only the shipped
camera controls and shared scene lighting.

| Ref | Exact artifact | Role | Footprint | Blocks LoS |
| --- | --- | --- | ---: | --- |
| `dnd5e:props:skeleton-cage` | `props/Crypt_Skeleton_Cage_01.glb` | obstacle | 1 | true |
| `dnd5e:props:skeleton-table` | `props/Crypt_Skeleton_Table_01.glb` | cover | 3 | false |
| `dnd5e:props:rug` | `props/Crypt_Rug_01.glb` | decor | 5 | false |

## Save/reopen — ref, facing, and offset preserved

The downloaded source, loaded editor YAML, and reopened server YAML were
byte-identical at SHA-256
`a3927fdbf6b38fb886c55b72f58ad116dd8282917fb279a4f8c5f3c4a5e25542`
(1,187 bytes). Assertions before Save & Play preserved:

| Ref | At | Facing | Offset |
| --- | --- | --- | --- |
| `dnd5e:props:skeleton-cage` | `[3,2]` | `se` | `[0,0]` |
| `dnd5e:props:skeleton-table` | `[6,4]` | `e` | `[0,0]` |
| `dnd5e:props:rug` | `[9,3]` | `e` | `[0,0]` |

Save & Play created lab lobby
`lobby_9a212c68-9cc3-4c55-ad62-4a04c9923a5d` and encounter/session
`c413dd94-a437-4161-b47b-9c97def3a206`; both remain live for review.

## Commands and test output

Exact merge sync and byte proof completed successfully:

```text
Using explicit rpg-game-assets source at /home/kirk/.pi/worktrees/rpg-game-assets/63-crypt-props-merged
Done. public/models/{synty,custom-dice}/ now mirror the approved rpg-game-assets runtime roots.
Crypt_Skeleton_Cage_01  cmp=IDENTICAL
Crypt_Skeleton_Table_01 cmp=IDENTICAL
Crypt_Rug_01            cmp=IDENTICAL
```

Final gate and focused output:

```text
npm run ci-check
  format PASS; lint PASS; typecheck PASS; build PASS
  built-theme guard PASS; contributor-sandbox exclusion guard PASS
  full tests PASS; CI_CHECK_EXIT=0
npm run test:run
  Test Files 210 passed | 1 skipped (211)
  Tests      3432 passed | 1 skipped (3433)
npm run test:run -- <7 exact path suites>
  Test Files 7 passed (7)
  Tests      175 passed (175)
```

Builder capture had zero browser errors. The playable development route logged
only the two known React StrictMode double-mount cleanup aborts for `GetStory`
and `StreamEvents`; the replacement stream reached live. Six non-target
environment preload GLBs and that disposed `GetStory` request were aborted while
switching routes. All crypt GLBs and every required authoring/lobby/session RPC
returned HTTP `200`.

At the stop gate, both review URLs return HTTP `200`; isolated `rpg-api-lab` is
healthy, `rpg-envoy-lab` is running on `:8081`, isolated Redis is running, and
Vite remains on `:3012`.

## Kirk verdict

- Candidate verdict: “looks really good.”
- Exact-merged-provider final verdict: “yeah they look great.”
- Final provider authority remains PR #64 merge
  `6c24b19861df127faa69bd4d1ab6ec8fdfad537e`; the saved/reopened showcase YAML
  stayed byte-identical at SHA-256
  `a3927fdbf6b38fb886c55b72f58ad116dd8282917fb279a4f8c5f3c4a5e25542`, and the
  final builder/game evidence artifacts remain the hashed PNGs above.

## Kirk final verdict, dev integration, and web PR

- Docs/assets evidence commit: `e179e6d` — `docs(assets): record crypt prop real-path evidence (814)`.
- Dev integration merge commit: `e18f2ce` — merged `origin/dev` into
  `fix/814-crypt-prop-specimens` without rebasing.
- Merge conflicts resolved only in `src/author/preview3d/DungeonPreview3D.tsx`,
  `src/components/session/SessionCanvas.tsx`, and
  `src/components/session/SessionCanvas.test.tsx`, preserving the feature's
  shared `AtlasPropModel` → `PropModel` / `DungeonSceneLights` path and current
  `dev`'s authored-facing coverage; shared follow-up touched
  `src/components/session/AtlasPropModel.tsx` and
  `src/components/session/AtlasPropModel.test.tsx` so the merged path matched
  the current facing API and world-Y contract.
- Fresh post-merge gates:
  - `npm run ci-check` ❌ — format/lint passed; typecheck/build/tests failed.
  - `npm run typecheck` / `npm run build` ❌ — merged `dev` now references
    proto fields not present in resolved `@kirkdiggler/rpg-api-protos`
    `v0.1.143` (`AtlasProp.offsetZ`, `AtlasBoundary.height`,
    `Declaration.candidates`, `Declaration.available`).
  - `npm run test:run` ❌ — `209 passed | 1 failed | 1 skipped` files,
    `3442 passed | 1 failed | 1 skipped` tests; remaining failure:
    `src/author/creation/boardWallRuns.test.ts`.
  - Focused exact-path suites ✅ — `9 passed` files, `192 passed` tests
    (`PropModel`, `SyntyHexFloor`, `floorOverlayHeights`, `propManifest`,
    `AtlasPropModel`, `SessionCanvas`, `DungeonPreview3D`, `atlasToScene3D`,
    `HexEntity`).
  - `git diff --check` ✅.
- Push/web PR status: blocked. `git push -u origin fix/814-crypt-prop-specimens`
  was stopped by the mandatory husky pre-push hook because the merged `dev`
  gate state above is red, so no web PR URL exists yet.
