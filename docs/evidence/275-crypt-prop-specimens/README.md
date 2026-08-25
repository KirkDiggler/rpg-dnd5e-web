# Crypt prop specimens — candidate visual checkpoint

Status: **Kirk approved the candidate; "looks really good."** No provider promotion decision is recorded here.

## Review routes

- Builder fixture: <http://127.0.0.1:3012/?concept=dungeon-builder&authorFixture=crypt-props> — click **3D preview**.
- Live authoring entry: <http://127.0.0.1:3012/?playerId=test-player> — select **Stanthony**, open **Dungeon Builder**, and Load `/tmp/crypt-prop-showcase.yaml` (or Open `crypt-prop-showcase`) before Save & Play.

The app cannot resume a running session after a hard reload without a character id, so the reproducible live review path starts at Home. `candidate-game.png` is the real Save & Play result captured before the isolated lab session was reset for review.

## Evidence

| File | What it records |
| --- | --- |
| `before-builder.png` | Broken 3D builder baseline synced from provider `main`: cage skeleton without the cage, unsupported table skeleton, and the old disconnected/oversized rug result. |
| `candidate-builder.png` | Task 3A calibrated provider pose through the shared builder `AtlasPropModel` → `PropModel` path after a cache-disabled hard reload in a new Chromium context. The skeleton reads beside the table: pelvis/lower limbs remain outside while the skull, forearms, and upper torso meet the plank instead of hovering above it. The complete cage and red rug remain discernible at the shared floor height. |
| `candidate-game.png` | Real Load → Save → Save & Play through the shared game path, captured in a second new cache-disabled Chromium context. Only shipped wheel zoom/right-drag camera controls framed the props beside the fixed log. The calibrated table contact, beside/inward anatomy, complete cage, visible rug, and common floor contact remain readable. |

Exact-artifact thumbnails were baked from the candidate URLs into:

- `src/author/thumbs/skeleton-cage.png`
- `src/author/thumbs/skeleton-table.png`
- `src/author/thumbs/rug.png`

All three thumbnails were inspected: the retained cage thumbnail contains the skeleton, the final re-baked table thumbnail shows the pelvis/legs beside the table with the head/forearms inward over the planks, and the retained rug thumbnail renders as a flat red rug. This README now records the approved current candidate exactly as reviewed.

## Consumer contract

| Ref | Exact artifact | Role | Footprint | Blocks LoS |
| --- | --- | --- | ---: | --- |
| `dnd5e:props:skeleton-cage` | `props/Crypt_Skeleton_Cage_01.glb` | obstacle | 1 | true |
| `dnd5e:props:skeleton-table` | `props/Crypt_Skeleton_Table_01.glb` | cover | 3 | false |
| `dnd5e:props:rug` | `props/Crypt_Rug_01.glb` | decor | 5 | false |

Final provider source: clean reviewed/pushed commit `951ac2a44dd40e0974e102434dbc7164665c571f` (`asset/63-crypt-prop-specimens`). An explicit `RPG_GAME_ASSETS_PATH` sync was followed by byte-for-byte `cmp` checks for all three public mirrors.

Synced public-runtime hashes (the GLBs remain ignored and are not evidence files to commit):

- cage: `fb16c3bed0fb284e37cfbe2914e7dfa2eeae54fb429796ab5ae1526f4126a4af`
- table: `be957e0e59b4efff6cbbcafba0a473e4e20f9dbca0a7892691121b8e477a0ff6`
- rug: `9f3861707a9b3416b89ddee307662fb7c3d106751f2a3f733ac902b7432184ed`

Only the table provider bytes changed during this refresh, so only its exact-URL thumbnail was re-baked; cage and rug thumbnails remain byte-identical. Full-frame and enlarged-crop inspection confirms the final table is not emerging from the middle: the torso sits at the edge, pelvis/legs stay outside, and the skull/forearms extend inward over the plank. Cage containment and rug visibility remain good, and cage/table/rug meet the same raised surface without the prior floor occlusion.

`PropVariant.renderScale` and its runtime multiplication are removed. `SyntyHexFloor` and `PropModel` now consume the same `DUNGEON_SURFACE_Y = 0.2`; `PropModel` adds that surface height to caller Y for every prop uniformly. Builder/game still share `AtlasPropModel`, `PropModel`, and `DungeonSceneLights`; fixed lighting and placeholder behavior were not changed.

## Fix round 3 — post-breaker height runtime refresh

- Provider `951ac2a44dd40e0974e102434dbc7164665c571f` was clean and matched its remote branch. Before sync, only the runtime table mirror was stale (`f2c75e…`); explicit source-path sync followed by `cmp` proved all three runtime GLBs byte-identical to provider. Final cage/table/rug SHA-256 values are `fb16c3…`, `be957e…`, and `9f3861…` respectively.
- Only `skeleton-table.png` was re-baked from the exact calibrated URL in a new cache-disabled 128×128 Chromium context after a hard reload; its GLB responses were `200` and browser errors were empty. Cage and rug thumbnail SHA-256 values remained `f0001a…` and `a02e66…`.
- `candidate-builder.png` was replaced from a new cache-disabled 1600×900 context at the fixture URL after a hard reload; cage, table, and rug each returned `200` with no browser errors.
- `candidate-game.png` was replaced from another new cache-disabled 1600×900 context using Home → Stanthony → Dungeon Builder → Load `/tmp/crypt-prop-showcase.yaml` → Save → Save & Play. The real session reached `Combat log — live`; all three GLBs returned `200`.
- Against Kirk's supplied hover screenshot, the calibrated skull, forearms, and upper torso now visibly meet/overlap the plank without destructive breakthrough. Pelvis/boots remain outside the near edge and the trestles remain readable. The cage still contains its skeleton, the rug remains flat/complete, and all three props meet the same raised dungeon surface without floor occlusion.
- `before-builder.png` remains unchanged at SHA-256 `1cd80a…`; refreshed builder/game SHA-256 values are `7c22c8…` and `66052b…`. This is runtime candidate evidence only; no verdict or provider-promotion decision is recorded.

## Kirk visual approval and candidate commit

- Verdict: Kirk said "looks really good."
- Final provider source: reviewed/pushed commit `951ac2a44dd40e0974e102434dbc7164665c571f` (`asset/63-crypt-prop-specimens`). Final table SHA-256: `be957e0e59b4efff6cbbcafba0a473e4e20f9dbca0a7892691121b8e477a0ff6`.
- Shared floor contract: `DUNGEON_SURFACE_Y = 0.2`; `SyntyHexFloor` and `PropModel` both use that same world surface, with `PropModel` adding it to the caller Y for every prop uniformly.
- Routes:
  - Builder fixture: <http://127.0.0.1:3012/?concept=dungeon-builder&authorFixture=crypt-props>
  - Live authoring entry: <http://127.0.0.1:3012/?playerId=test-player>
- Final gate outputs:
  - `npm run test:run -- src/components/hex-grid/PropModel.test.tsx src/components/hex-grid/SyntyHexFloor.test.tsx src/components/hex-grid/floorOverlayHeights.test.ts src/components/hex-grid/propManifest.test.ts src/components/session/AtlasPropModel.test.tsx src/components/session/SessionCanvas.test.tsx src/components/hex-grid/HexEntity.test.tsx` → 7 files, 175 tests, PASS.
  - `npm run typecheck` → PASS.
  - `npm run format:check` → PASS.
  - `git diff --cached --check` → PASS.
- Staged scope: `docs/evidence/275-crypt-prop-specimens/README.md`, `src/author/thumbs/rug.png`, `src/author/thumbs/skeleton-cage.png`, `src/author/thumbs/skeleton-table.png`, `src/components/hex-grid/PropModel.test.tsx`, `src/components/hex-grid/PropModel.tsx`, `src/components/hex-grid/SyntyHexFloor.test.tsx`, `src/components/hex-grid/SyntyHexFloor.tsx`, `src/components/hex-grid/floorOverlayHeights.test.ts`, `src/components/hex-grid/propManifest.test.ts`, `src/components/hex-grid/propManifest.ts`, `src/components/session/AtlasPropModel.test.tsx`, `src/components/session/SessionCanvas.test.tsx`, `src/rendering/dungeonSurface.ts`.
- Commit: `fix(assets): consume complete crypt prop specimens (814)`.
