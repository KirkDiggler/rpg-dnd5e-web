# Crypt shell web-slice provenance

This is the initial provenance record for rpg-dnd5e-web#825, consuming the
private provider output for rpg-project#284 / rpg-project#169 and superseding
rpg-dnd5e-web#791. Runtime assets remain ignored; this README is the only
Task 5 artifact tracked in the web repository.

## Implementation and provider pins

- Evidence implementation head (final web commit):
  `404738a9b70ad3a1034252b4c8959cb8012eb0e1`.
- Web base head before Task 11 implementation:
  `185570cd39bca46c1b4073b5dfc1ae406eeedac7`.
- Provider PR: KirkDiggler/rpg-game-assets#68, merged at
  `f183c96d6d89ecdaf9a2f5dd2c452de485882ed3`.
- Provider evidence commit (provider-side evidence bundle):
  `b9eaec454bc43bbfdb284fa647ffbdef60ff8a3a`.
- Provider reviewed head (PR review head):
  `2facea936b47dd0a5750668be6bfa9a664bcc71d`.
- Reviewed head tree: `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`.
- Merge tree: `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`.
- Provider verdict: Kirk — `looks great`; verdict content SHA-256
  `a1acb5269ccc801954073139737cb8ca00768712cb93e6b7e225457efa47c6f1`.
- Provider verdict file SHA-256:
  `ba3a293756df908c201affcd06987422d2c38a121680b0db832e1d07c7150991`.
- Final verification manifest (`verification.json`) SHA-256:
  `e036f5b0a1a35f6c68ffbe76268d0051e16bb03dda72bbf9f36318fdfa02ad7a`.

The sync consumed the reviewed provider output identified by the repository,
PR, merge commit, reviewed head, and review/merge tree hashes above.

## Profile and inventory pins

- Profile: `harness/models/synty/env/shell-profiles.json`;
  SHA-256 `d02e6398b06f8b347fbe2e68d91d83bfeccd389ea412be5774d34454c2d164a7`;
  schema 1; profile key `crypt`.
- Complete inventory:
  `harness/catalogs/synty-complete-inventory.json`; 2,141 files;
  payload SHA-256 `fc815f39b4056b0cbbb4edf8d76b552a78c26a80a66da92e77a55d4c22c08303`;
  tree SHA-256 `f2935197b3c280131afc2da5ac732c0f1e82e1c7b623f2259e9a4ba148f8d57d`.
- Safe web catalog: `harness/catalogs/synty-web-assets.json`;
  SHA-256 `0b816d6f08584e66c90556f9ad4d040c71086c1dbf698bf7d5030fb05c490669`.
- Atomic stage report SHA-256
  `7d045c057fbf3ba9821a9beaa549006f6bfc12dac3668bc13ce547cb73fa6ab7`.

## Selected artifact pins

| role | runtime path | SHA-256 |
| --- | --- | --- |
| body | `harness/models/synty/env/Crypt_Wall_Body_01.glb` | `2216b24e5ea943841682a95c5f4a7692525be42f1cb295bf6d69df33a2e142fc` |
| base | `harness/models/synty/env/Crypt_Wall_Base_01.glb` | `6933008930a251aec0f27ac757611097faa15f38db06cb542e91128fa60c4f6f` |
| cap | `harness/models/synty/env/Crypt_Wall_Cap_01.glb` | `f56b63ded7b8f8f5ca02a8824df9b9f2a2ca4052d1bf7939281b06c68c059a67` |
| door surround | `harness/models/synty/env/Crypt_Wall_Door_Surround_01.glb` | `bd4d0a9ca3da8fcee72f8cfaf72d51040f6754920649b9e30c8c8a2e44093cc0` |

The selected floor is `floor-09-01-u6` with repeat `6u`; the selected wall is
`wall-double-01-worked`. The provider assembly spans `+X`, is up `+Y`, and
presents `+Z` and `-Z` faces.

## Web sync and readback

The sync consumed the reviewed provider output identified by the repository,
PR, merge commit, reviewed head, and review/merge tree hashes above. Readback
from the web worktree:

```text
sha256  public/models/synty/env/shell-profiles.json
 d02e6398b06f8b347fbe2e68d91d83bfeccd389ea412be5774d34454c2d164a7
sha256  public/models/synty/env/Crypt_Wall_Body_01.glb
 2216b24e5ea943841682a95c5f4a7692525be42f1cb295bf6d69df33a2e142fc
sha256  public/models/synty/env/Crypt_Wall_Base_01.glb
 6933008930a251aec0f27ac757611097faa15f38db06cb542e91128fa60c4f6f
sha256  public/models/synty/env/Crypt_Wall_Cap_01.glb
 f56b63ded7b8f8f5ca02a8824df9b9f2a2ca4052d1bf7939281b06c68c059a67
sha256  public/models/synty/env/Crypt_Wall_Door_Surround_01.glb
 bd4d0a9ca3da8fcee72f8cfaf72d51040f6754920649b9e30c8c8a2e44093cc0
```

`git check-ignore -v` matched both the body GLB and profile under
`.gitignore:41:public/models/synty/`. `git status --short` was empty after the
sync. The four selected GLBs and profile exist in the destination; no licensed
path is tracked.

## Public/private boundary

The private provider checkout owns licensed source, converted artifacts,
profiles, complete inventory, and provider evidence. The web checkout may
consume the generated runtime mirror under ignored `public/models/`; it does
not commit GLBs, textures, manifests, raw source, or provider evidence. This
tracked document records hashes and provenance only, so later web work can
prove which private bytes it consumed without moving licensed content into the
web repository.

## Task 8 test-hardening report

The approved review gaps were closed without production changes. The floor UV
coverage now exercises adjacent pointy cubes `[0,0,0]` and `[0,-1,1]`, identifies
both shared world vertices, asserts their absolute U/V values from world
coordinates divided by the profile repeat, and asserts both cells agree. The
texture coverage initializes each mocked shared cache texture with non-default
state, verifies the configured clones receive profile or legacy wrap/repeat
state, checks distinct alternate/profile/legacy URLs, and verifies all shared
source state survives profile → alternate profile → legacy rerenders.

## Task 11 Steps 1–4 final record (2026-08-27)

The candidate record below is retained for provenance. Kirk's integrated visual
gate approved the tinted builder and playable game: `looks really good`.

### Web change and fixture contract

- Web base head before Task 11 implementation:
  `185570cd39bca46c1b4073b5dfc1ae406eeedac7`; evidence implementation head:
  `404738a9b70ad3a1034252b4c8959cb8012eb0e1`. Task 11 changes are finalized in
  `src/author/fixtures/cryptPropShowcase.ts` and its test; the floor tint fix is
  in `src/components/session/DungeonShell.tsx` and its test.
- Fixture: `crypt-prop-showcase`, pointy, opaque; two regions (`gallery` and
  `chapel`), both `archetype: crypt`, `120` cells each; one continuous `240`
  cell floor; `44` authored walls (`39` standard, `5` raised at height `2`);
  one locked doorway (`crypt-sealed-gate`, DC 15 dexterity), and three
  placements.
- Wall presentation derives `6` runs with edge counts `8, 10, 6, 4, 1, 15`;
  the fixture test pins a long run, distinct corner endpoints, a genuine
  three-way junction, standard/raised walls, locked door, crypt-only regions,
  continuous floor, and the accepted cage/table/rug refs plus their authored
  facing/`[0,0]` offsets.

### TDD and gates

- RED: `npm run test:run -- src/author/fixtures/cryptPropShowcase.test.ts` —
  `7` tests, `3` failed for the missing regions/topology/door.
- GREEN/Step 1: the exact brief command covering `4` files — `58/58` tests
  passed.
- `npm run format` — changed no files during finalization;
  `format:check` passed in CI.
- Focused Step 2 command — `11/11` files, `175/175` tests passed.
- `npm run ci-check` — all gates passed: format check; ESLint; TypeScript;
  production build; built theme CSS combat-HUD guard; production exclusion of
  Toolkit Contributor Sandbox; test gate.
- Fresh `npm run test:run` — `231` files passed, `1` skipped; `3,640` tests
  passed, `1` skipped. Vitest emitted the existing jsdom
  `Window's scrollTo()` notice only.

### Services, route, and real-path readback

- Runbook: `rpg-project/docs/howto/run-the-game-locally.md` plus this repo's
  `docs/how-to/local-dev.md`.
- Shared stack was not restarted, rebuilt, or modified. Authoring probe
  `GetDungeon(reference-tomb)` returned HTTP 200.
- Builder state: character `Standre` → Dungeon Builder → Load
  `crypt-prop-showcase.yaml` → compiled → Save → Open `crypt-prop-showcase`;
  Save and reopen YAML were byte-identical in the builder (`94` lines,
  `3593` bytes, SHA-256
  `1b5effb21b3ccc5c26153714cff62d7a08041808a1782cd79d9999b3755fca25`).
  The real calls were `PutDungeon(validate_only)`/`PutDungeon`/`GetDungeon`,
  all HTTP 200; compile status was `240 cells, 44 boundaries, 2 regions`.
- Play state: Save & Play succeeded; the real `StartEncounter` returned HTTP
  200, and session `GetAtlas` returned HTTP 200 with `240` cells and `3`
  props. The candidate route is playable; the
  existing session location label still says “The Reference Tomb” because
  that visible banner is pre-existing static `SessionEncounterView` copy, not
  atlas identity. It was not changed. The atlas, YAML, session, and network
  hashes in this record prove the loaded fixture is `crypt-prop-showcase`.

### Network and byte pins

Browser capture at 1600×900 observed HTTP 200 for the exact provider path and
runtime assets:

- `/models/synty/env/shell-profiles.json` — `d02e6398b06f8b347fbe2e68d91d83bfeccd389ea412be5774d34454c2d164a7`
- `/models/synty/textures/Dungeons_Texture_FloorTile_09_01.png` — `ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841`
- `/models/synty/env/Crypt_Wall_Body_01.glb` — `2216b24e5ea943841682a95c5f4a7692525be42f1cb295bf6d69df33a2e142fc`
- `/models/synty/env/Crypt_Wall_Base_01.glb` — `6933008930a251aec0f27ac757611097faa15f38db06cb542e91128fa60c4f6f`
- `/models/synty/env/Crypt_Wall_Cap_01.glb` — `f56b63ded7b8f8f5ca02a8824df9b9f2a2ca4052d1bf7939281b06c68c059a67`
- `/models/synty/env/Crypt_Wall_Door_Surround_01.glb` — `bd4d0a9ca3da8fcee72f8cfaf72d51040f6754920649b9e30c8c8a2e44093cc0`
- Existing closed leaf `/models/synty/env/SM_Env_Door_01.glb` —
  `c1445b4dae6a02127be15fcbd59e6f02f207de28a3461cf95a1ceba18f8d4c15`.

The same capture observed the accepted prop requests:
`/models/synty/props/Crypt_Skeleton_Cage_01.glb`,
`/models/synty/props/Crypt_Skeleton_Table_01.glb`, and
`/models/synty/props/Crypt_Rug_01.glb`. No manifest or GLB bytes were copied
into this evidence directory. The ignored provider tree remains untracked;
`git check-ignore -v` matches `public/models/synty/`.

### Preserved and candidate frames

All are PNG `1600×900`, captured from the real builder and game flows:

- `before-builder.png` — SHA-256
  `9933803cdf0d366980ed7c340045547012124d1afd6270be7576b7d82c775663`.
- Preserved bright A/B frames: `brightness-before-builder.png` — SHA-256
  `cc0ed05edb2da845308aa45827a62b7baab638c80930bafbf02f4d1020d809c4`; and
  `brightness-before-game.png` — SHA-256
  `83e7ce082d46d1a4854a890f3f7a901ea0758483f309ee6521755aece5a1d953`.
- Approved candidates: `candidate-builder.png` — SHA-256
  `0854b0d0bc4dd56a62185ffcfb774230ad77583f90696068308f6200368f7a83`; and
  `candidate-game.png` — SHA-256
  `b44ef4dd027eaefc02db77f35bb31bb4461b1948dc80974b1bbbcfbe74d9baaa`.

### Self-review / concerns

The approved builder shows the continuous floor, long run, branch/corner/T
structure, cap/base, doorway, standard/raised wall, and accepted props. The
approved game frame shows the playable atlas and loaded shell. The existing
hard-coded game location label still says “The Reference Tomb”; it is not atlas
or provider evidence and was not changed.

## Task 11 Step 4 — Kirk floor-brightness finding (2026-08-27)

- Root cause evidence: the provider floor sample renders its selected texture
  through Blender Principled/world lighting, while the integrated profile used
  the `MeshBasicMaterial`/`toneMapped={false}` raw-texture branch because Task 8
  did not set `isCrypt`; the existing `CRYPT_FLOOR_TINT` was therefore bypassed.
  The approved sample measurements were provider luma `~74.9` and old integrated
  builder luma `~113.6`.
- Single hypothesis tested: v1 is exclusively `crypt`, so profile floors should
  pass the already-established `spaceTheme="crypt"` into `SyntyHexFloor`. This
  reuses `CRYPT_FLOOR_TINT` and changes no RGB value, material family, lights,
  tone mapping, wall, asset, or UV behavior.
- TDD RED: the new
  `DungeonShell.test.tsx` test observed `ffffff` for an active profile floor
  while the legacy/no-profile floor stayed white. GREEN: the smallest fix is
  `ProfileResources` passing `spaceTheme="crypt"`; the test now observes the
  existing tint (`r=.35, g=.38, b=.46`) and `toneMapped=false`, while legacy
  remains `ffffff` and `toneMapped=false`.
- Focused floor/shell/parity tests: `5` files, `77/77` passed. The live
  route was hot-reloaded and recaptured at `1600×900` with the same
  capture flow/camera. The old bright integrated candidates are preserved as
  `brightness-before-builder.png` and `brightness-before-game.png`.
- Comparable floor-region scan: fixed screen-space polygons, excluding pixels
  below luma `30` and with channel spread above `25`. Builder RGB/luma moved
  from `(107.4,106.7,105.4)/106.8` to `(68.5,70.4,75.0)/70.3`; game moved from
  `(86.4,87.9,87.6)/87.6` to `(57.2,60.6,64.7)/60.2`. The builder is now
  within `~4.6` luma of the provider sample; the captured floor and assets
  remain readable in both new frames. These are capture metrics, not a new
  provider measurement.
- New frame hashes (all `1600×900`): `brightness-before-builder.png`
  `cc0ed05edb2da845308aa45827a62b7baab638c80930bafbf02f4d1020d809c4`,
  `brightness-before-game.png`
  `83e7ce082d46d1a4854a890f3f7a901ea0758483f309ee6521755aece5a1d953`,
  `candidate-builder.png`
  `0854b0d0bc4dd56a62185ffcfb774230ad77583f90696068308f6200368f7a83`,
  `candidate-game.png`
  `b44ef4dd027eaefc02db77f35bb31bb4461b1948dc80974b1bbbcfbe74d9baaa`.
- Live readback: builder compiled `240` cells/`44` boundaries/`2` regions;
  Save/reopen YAML remained byte-identical; Play started successfully and
  loaded the `240`-cell atlas, `3` props, and one door. Kirk's final integrated
  verdict on the tinted builder/game was exactly `looks really good`.

## Task 11 finalization

- Approved candidates were copied byte-for-byte to `final-builder.png` and
  `final-game.png`; `cmp` passed for both pairs. Final builder SHA-256 is
  `0854b0d0bc4dd56a62185ffcfb774230ad77583f90696068308f6200368f7a83`; final
  game SHA-256 is
  `b44ef4dd027eaefc02db77f35bb31bb4461b1948dc80974b1bbbcfbe74d9baaa`.
  All preserved, candidate, and final frames are PNG `1600×900`.
- Provider authority remains PR `KirkDiggler/rpg-game-assets#68`, merge
  `f183c96d6d89ecdaf9a2f5dd2c452de485882ed3`, provider evidence commit
  `b9eaec454bc43bbfdb284fa647ffbdef60ff8a3a`, reviewed head
  `2facea936b47dd0a5750668be6bfa9a664bcc71d`, tree
  `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`, and profile
  `d02e6398b06f8b347fbe2e68d91d83bfeccd389ea412be5774d34454c2d164a7`.
  The four shell artifact hashes are recorded above; floor hash is
  `ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841`; closed
  leaf hash is
  `c1445b4dae6a02127be15fcbd59e6f02f207de28a3461cf95a1ceba18f8d4c15`.
- The web base head was
  `185570cd39bca46c1b4073b5dfc1ae406eeedac7`. Save/reopen YAML remained
  identical at `94` lines and `3,593` bytes, SHA-256
  `1b5effb21b3ccc5c26153714cff62d7a08041808a1782cd79d9999b3755fca25`.
  `PutDungeon`, `GetDungeon`, `CreateLobby`, `SetReady`, `StartEncounter`,
  `GetAtlas`, and all recorded provider/runtime asset requests returned HTTP
  200.
- The brightness root cause and A/B are retained above: the profile bypassed
  `CRYPT_FLOOR_TINT` on the raw `MeshBasicMaterial` branch; builder luma moved
  `106.8 → 70.3` and game luma `87.6 → 60.2` toward provider `~74.9`.
- Issue disposition: closure of #791 is deferred until this web change merges;
  #823 remains a separate issue. No provider assets, manifests, or private
  source bytes are included in this public evidence directory.
