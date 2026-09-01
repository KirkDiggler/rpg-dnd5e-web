# #877 character-customization Concept publication

Status: **PASS — provider-first publication received exactly by the web Concept.**

This directory is the compact, tracked publication record for the development-only route `/?concept=character-customization`. It does not create a production character field, route, persistence contract, API, proto, or toolkit surface.

## Exact provider receipt

Provider PR #109 is merged at `4c208fad5a950d2103d763a9c8aac96d3bb342b1`; the independently reviewed feature head was `6c567b5939ba308a3a35b2d4e5354111e30e9f44`.

The web worktree was synchronized from that exact merged tree. The copied manifest was byte-identical and had SHA-256 `d1d8a815c0241986c6f5367a6de82340722a5bae08d2c62307224d42b1ff7c10`. The complete provider inventory had file SHA-256 `b2ef0d7a975de9aa69c9531138f88a48a6e1fc5c1dfbb716b22627d9c3b91222` and tree SHA-256 `c29bd470169026d07bf00fc6d30180a80e29b723f56b19b81adff89b468d00af`.

`receipt.json` pins the seven public URLs, byte sizes, SHA-256 values, source meshes and style refs; the exact 63-bone order and inverse-bind digest; defaults and `uniform-pbr-v1` surface; and the provider's decoded `Hand_R` socket witness. It also records the provider preservation snapshots: 1,231 pre-existing GLBs with digest `da8fc4228681fee4ea229251e4f63d2503d5d66dc258ea6eb9c958195e308df3`, seven Concept GLBs with digest `953569a27afe60fd5fd5269938e0f01227e2bc2f83943c95d6aeb74daf72fd05`, and no changed production GLBs.

The synchronized provider bytes remain under the existing ignored `public/models/synty/` boundary; zero files under that root are tracked by this repository.

## Fresh browser matrix

The qualifying matrix was repeated against Vite on port 3014 from the current renderer/layout implementation. Chrome `151.0.7922.169` passed 29 explicit scripted checkpoints:

- at 1600 px, controls, the 560 px renderer, and inspector were simultaneously side by side; at 1280 px, controls and renderer remained side by side with the inspector below; both long panes were sticky, internally scrollable, and bounded to 560 px;
- all six accessory URLs were preloaded when the Concept mounted;
- five rapid treatment-only changes emitted 10 controlled `attached` updates and zero `loading` updates while both controlled mesh UUIDs and both instance-owned material UUIDs remained exactly unchanged; actual values finished at `#C02626`, roughness `0.31`, metalness `0.64`;
- exact current slot/style/URL/mesh identity on every checkpoint, including both `none` states;
- all three scalp and all three facial-hair options plus both default aliases;
- the two required pairwise walk states: Hair 08 + default Facial Hair 02, and default Hair 04 + Facial Hair 03;
- `Walk_Forward`, both controlled attachments, both reference attachments, 63 mapped bones, zero source armatures, and exact controlled/reference treatment values at each required walk checkpoint;
- instance-owned runtime material UUIDs unique within each twin and disjoint across controlled/reference twins;
- 112 runtime material rows read back with controlled values equal to the current fixture and reference values fixed at `#5A3825`, roughness `0.72`, metalness `0`;
- scalp `5/5`, facial hair `5/5`, motions `2/2`, views `3/3`, presets `4/4`, simultaneous alternate pair, and positive reference-twin isolation;
- Hair 08 + Facial Hair 03 at arbitrary red `#C02626`, including walk, orbit interaction, tactical play, and rapid changes;
- the application-exported canonical witness `dnd5e:item:warhammer` at exact URL `/models/synty/weapons/warhammer.glb`, attached to `Hand_R` while the final alternate pair walked; and
- all seven customization GLBs fetched by the real browser with HTTP 200 and exact receipt size/hash.

Scripted checkpoints and Concept observations are different counters: the receipt has 29 deliberate matrix rows, while the in-page Concept verdict accumulated 49 unique positive committed frames. The Concept counter also records distinct valid intermediary frames produced while controls settle between scripted checkpoints; it is therefore expected to be larger. `receipt.json` and the publication test pin both exact counts and this relationship.

The proof window had zero unexpected app-console errors, page errors, request failures, and HTTP failures. App-level startup reads outside the Concept were isolated with valid empty gRPC-web fixture responses; the exact receipt marker is `valid-empty-grpc-web-responses`, and no gameplay/API result is claimed. Chrome's four acknowledged WebGL `ReadPixels` performance notices were the only warnings.

## Compact visual evidence

| Evidence | What it shows |
|---|---|
| [default-close.png](default-close.png) | Default Dwarf close view beside the unchanged reference twin |
| [workspace-wide.png](workspace-wide.png) | 1600 px controls \| preview \| inspector workspace with both internal scroll panes bounded to renderer height |
| [treatment-stable.png](treatment-stable.png) | Rapid treatment endpoint whose exact stable mesh/material identities are pinned in the receipt |
| [none-both.png](none-both.png) | Controlled scalp and facial hair both explicitly absent |
| [combined-alternate-arbitrary-color.png](combined-alternate-arbitrary-color.png) | Hair 08 + Facial Hair 03 with arbitrary red treatment; reference remains brown |
| [surface-cloth.png](surface-cloth.png) | Cloth-like treatment comparison |
| [surface-leather.png](surface-leather.png) | Leather-like treatment comparison |
| [surface-metal.png](surface-metal.png) | Metal-like treatment comparison |
| [walk-alternate-scalp-default-facial-hair.png](walk-alternate-scalp-default-facial-hair.png) | Hair 08 + default Facial Hair 02 during `Walk_Forward` |
| [walk-default-scalp-alternate-facial-hair.png](walk-default-scalp-alternate-facial-hair.png) | Default Hair 04 + Facial Hair 03 during `Walk_Forward` |
| [walk.png](walk.png) | Combined alternate pair during `Walk_Forward` |
| [orbit.png](orbit.png) | Full-orbit evidence view; the matrix also performed a real drag |
| [tactical-twin-isolation.png](tactical-twin-isolation.png) | Final tactical alternate pair beside the unchanged reference twin |
| [weapon-witness.png](weapon-witness.png) | Canonical warhammer witness attached during the final walk/tactical state |
| [completed-inspector.png](completed-inspector.png) | Compact recorded verdict showing 49 accumulated Concept observations and complete coverage |

The 15 PNG hashes, sizes, and dimensions are independently fixed in `scripts/characterCustomizationConceptPublication.test.ts`, checked against `receipt.json`, and then checked against the tracked bytes. Updating a receipt row alone cannot authorize replacement evidence.
