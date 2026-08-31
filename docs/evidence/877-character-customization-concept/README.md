# #877 character-customization Concept publication

Status: **PASS — provider-first publication received exactly by the web Concept.**

This directory is the compact, tracked publication record for the development-only route `/?concept=character-customization`. It does not create a production character field, route, persistence contract, API, proto, or toolkit surface.

## Exact provider receipt

Provider PR #109 is merged at `4c208fad5a950d2103d763a9c8aac96d3bb342b1`; the independently reviewed feature head was `6c567b5939ba308a3a35b2d4e5354111e30e9f44`.

The web worktree was synchronized from that exact merged tree. The copied manifest was byte-identical and had SHA-256 `d1d8a815c0241986c6f5367a6de82340722a5bae08d2c62307224d42b1ff7c10`. The complete provider inventory had file SHA-256 `b2ef0d7a975de9aa69c9531138f88a48a6e1fc5c1dfbb716b22627d9c3b91222` and tree SHA-256 `c29bd470169026d07bf00fc6d30180a80e29b723f56b19b81adff89b468d00af`.

`receipt.json` pins the seven public URLs, byte sizes, SHA-256 values, source meshes and style refs; the exact 63-bone order and inverse-bind digest; defaults and `uniform-pbr-v1` surface; and the provider's decoded `Hand_R` socket witness. It also records the provider preservation snapshots: 1,231 pre-existing GLBs with digest `da8fc4228681fee4ea229251e4f63d2503d5d66dc258ea6eb9c958195e308df3`, seven Concept GLBs with digest `953569a27afe60fd5fd5269938e0f01227e2bc2f83943c95d6aeb74daf72fd05`, and no changed production GLBs.

The synchronized provider bytes remain under the existing ignored `public/models/synty/` boundary; zero files under that root are tracked by this repository.

## Fresh browser matrix

The complete matrix was repeated against Vite on port 3014 after the rebase and exact merged-provider synchronization. Chrome `151.0.7922.169` passed 26 explicit proof observations:

- exact current slot/style/URL identity on every observation, including both `none` states;
- all three scalp and all three facial-hair options plus both default aliases;
- all active accessories mapped to 63 unique current body Bone identities;
- zero mounted source accessory armatures;
- instance-owned runtime material UUIDs unique within each twin and disjoint across controlled/reference twins;
- 100 runtime material rows read back with controlled values equal to the current fixture and reference values fixed at `#5A3825`, roughness `0.72`, metalness `0`;
- scalp `5/5`, facial hair `5/5`, motions `2/2`, views `3/3`, presets `4/4`, simultaneous alternate pair, and positive reference-twin isolation;
- Hair 08 + Facial Hair 03 at arbitrary red `#C02626`, including walk, orbit interaction, tactical play, and rapid changes;
- canonical longsword attached to `Hand_R` while the final alternate pair walked; and
- all seven GLBs fetched by the real browser with HTTP 200 and exact receipt size/hash.

The proof window had zero unexpected app-console errors, page errors, request failures, and HTTP failures. App-level startup reads outside the Concept were isolated with valid empty gRPC-web fixture responses; no gameplay/API result is claimed. Chrome's acknowledged WebGL `ReadPixels` performance notices were the only warnings.

## Compact visual evidence

| Evidence | What it shows |
|---|---|
| [default-close.png](default-close.png) | Default Dwarf close view beside the unchanged reference twin |
| [none-both.png](none-both.png) | Controlled scalp and facial hair both explicitly absent |
| [combined-alternate-arbitrary-color.png](combined-alternate-arbitrary-color.png) | Hair 08 + Facial Hair 03 with arbitrary red treatment; reference remains brown |
| [surface-cloth.png](surface-cloth.png) | Cloth-like treatment comparison |
| [surface-leather.png](surface-leather.png) | Leather-like treatment comparison |
| [surface-metal.png](surface-metal.png) | Metal-like treatment comparison |
| [walk.png](walk.png) | Alternate pair during `Walk_Forward` |
| [orbit.png](orbit.png) | Full-orbit evidence view; the matrix also performed a real drag |
| [tactical-twin-isolation.png](tactical-twin-isolation.png) | Final tactical alternate pair beside the unchanged reference twin |
| [weapon-witness.png](weapon-witness.png) | Canonical longsword witness attached during the final walk/tactical state |
| [completed-inspector.png](completed-inspector.png) | Compact recorded verdict with complete coverage |

The PNG hashes, sizes, and dimensions are bound in `receipt.json` and checked by `scripts/characterCustomizationConceptPublication.test.ts`.
