# Crypt shell web-slice provenance

This is the initial provenance record for rpg-dnd5e-web#825, consuming the
private provider output for rpg-project#284 / rpg-project#169 and superseding
rpg-dnd5e-web#791. Runtime assets remain ignored; this README is the only
Task 5 artifact tracked in the web repository.

## Provider pin

- Provider PR: KirkDiggler/rpg-game-assets#68, merged at
  `f183c96d6d89ecdaf9a2f5dd2c452de485882ed3`.
- Reviewed provider head: `2facea936b47dd0a5750668be6bfa9a664bcc71d1`.
- Reviewed head tree: `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`.
- Merge tree: `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`.
- Provider evidence commit: `b9eaec4`.
- Provider verdict: Kirk — `looks great`; verdict content SHA-256
  `a1acb5269ccc801954073139737cb8ca00768712cb93e6b7e225457efa47c6f1`.
- Provider verdict file SHA-256:
  `ba3a293756df908c201affcd06987422d2c38a121680b0db832e1d07c7150991`.
- Final verification manifest (`verification.json`) SHA-256:
  `e036f5b0a1a35f6c68ffbe76268d0051e16bb03dda72bbf9f36318fdfa02ad7a`.

The provider checkout used for this sync was
`/home/kirk/.pi/worktrees/rpg-game-assets/65-crypt-shell`, at the reviewed
head. It was clean and was not pulled, reset, or replaced with the stale shared
provider checkout.

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
| floor texture | `harness/models/synty/textures/Dungeons_Texture_FloorTile_09_01.png` | `ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841` |
| closed door leaf | `harness/models/synty/env/SM_Env_Door_01.glb` | `c1445b4dae6a02127be15fcbd59e6f02f207de28a3461cf95a1ceba18f8d4c15` |

The selected floor is `floor-09-01-u6` with repeat `6u`; the selected wall is
`wall-double-01-worked`. The provider assembly spans `+X`, is up `+Y`, and
presents `+Z` and `-Z` faces.

## Web sync and readback

The brief's legacy override was first attempted exactly as written, but this
checkout's script treats `RPG_GAME_ASSETS_DIR` as a mutable clone location. It
therefore refused the already-existing reviewed provider worktree. The
successful exact-root sync added the script's skip-update guard:

```sh
ASSETS_SYNC_SKIP_UPDATE=1 \
RPG_GAME_ASSETS_DIR=/home/kirk/.pi/worktrees/rpg-game-assets/65-crypt-shell \
npm run assets:sync
```

The command reported both runtime roots synced. Readback from the web
worktree:

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

## Integrated tests

## Screenshots
