# Run — 2026-11-06 — Courtyard S2 ground authoring

Slice [#874](https://github.com/KirkDiggler/rpg-project/issues/874), story [#867](https://github.com/KirkDiggler/rpg-project/issues/867). Base: `dev` at `2150256f`.

## Shipped

- Studio and play-renderer checkpoint adds region bases, hex ground paint/erase, owner guards/history, native file round trips, Layout textures and batched level ground; joined runtime acceptance and publication remain pending — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Adopt generated protos v0.1.258, merge ground paint across partial discoveries, and draw permitted atlas appearances through both shell paths with existing exposure/pools/fog/watch-zone treatment — [wire contract](https://github.com/KirkDiggler/rpg-api-protos/pull/421).

- Added normal ground-owner sync, read-only checks, packaging pin discovery and an independently reproduced ground subtree, using the reviewed private provider commit for development rather than claiming a merged release — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

## Decided

- Keep paint equal to the base as explicit intent; prune paint when its region loses the cell; preserve unknown native-source fields and old absence — [design and plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- Keep the authoring/persistence assertions together in the new ground test file while exercising real room/composition/native helpers rather than adding duplicate fixtures to large existing suites — [S2 plan T1](https://github.com/KirkDiggler/rpg-project/blob/design/867-courtyard-ground/ideas/courtyard-ground/plan.md#t1--authoring-state-persistence-and-edit-invariants).

- Share decoded-PNG and owned-file verification, plus scoped image-owner sync, with the existing material path because these are the same custody concerns; keep the ground schema separate and ground-only opacity explicit — [S2 plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- Bind runtime metadata to the generated manifest digest and allow preview override only in dev/bench; otherwise a correct renderer could silently consume a different provider's catalog — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

## Found

- Missing-contract test run failed on the absent `regionGround` import; after implementation the five focused files pass 130 tests and TypeScript checks pass — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Existing region owner edits retain unknown fields unchanged, so ground needs explicit pruning to avoid orphan paint after floor edits — [S2 plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- The play-wiring complete Web gate passed with 9969 tests and five skips; the earlier native Studio checks proved base-preserving paint, pointer paint/erase, undo/redo, YAML export and browser reload without a mutating server request — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- New tests first caught old paint disappearing on a partial discovery and the shell dropping the supplied ground refs; the corrected reducers/rendering now pass the full gate — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Native browser capture has no page exceptions; console messages are the existing documented GetDungeon empty-key authoring probe, not a claim of zero console output. At the preview-only checkpoint, candidate ground was absent from both public build input and production dist — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The explicit private preview mount verifies resource identity, identifies candidate status and keeps unapproved images out of production build input — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- The joined private walk now proves native Save a copy → Play, two-client gate discovery with different permitted paint, actor/NPC movement, reload and captured-source immutability. Hardware benchmarking is separate from the initial SwiftShader functional walk — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The explicit `bench` preview uses the same hash-verified private mount for minified-build measurements; a new HTTP test refuses that mount in ordinary production preview. The complete Web gate passes 9972 tests with five skips — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- Hardware measurement exposed two GPU copies per new style: Drei eagerly uploaded the cached source before GroundFloor uploaded its differently configured clone. A real renderer-counter regression first observed one unused allocation instead of zero; loading without eager upload preserves owned-clone disposal and removes that redundant allocation — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- Temporary real-Git provider tests first refused the missing ground sync mode and packaging pin, then verified scoped adoption, pinned absence, independent pin preservation and corrupt-source refusal; the actual provider's pinned runtime union also passes without rewriting other generated catalogs — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- Normal minified delivery fetched the adopted catalog and grass/dirt bytes without a preview header, resumed both the open and gated fixtures and completed a native Move. The same-byte old-head comparison retains the same stone/ground appearance; this is delivery evidence, not a new paired performance claim — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- A fresh Studio regression imports the exact current served-castle source, round-trips it unchanged, authors the courtyard base and connecting dirt paths, persists/reopens it, and proves every other source fact survives. The same production edit/export helpers generated the API/toolkit castle change — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

## Mistaken

- The older served-castle fixtures did not include the current challenged-post/pass fields. The ground regression uses a new snapshot of the actual served source instead of assuming a historically named fixture is current — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- The delivery change used the established dev/bench predicate but omitted its named gate inventory. The comment and benchmark G12 now name verified ground-preview acceptance and its private-candidate measurement rationale; production refusal and runtime behavior are unchanged — [focused review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1395#pullrequestreview-5815395552).

- A same-input sync from outside the Web checkout falsely reported stale material metadata: the caller's ignore rules changed Prettier's output. The executable packaging regression reproduces this with an ignored fixture checkout; ground/material pin renderers now own their formatting directory instead of inheriting the caller's — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- The Docker workflow fixture copied the old script dependency set and initially omitted the extracted image verifier. The fixture now carries the actual ground delivery dependencies and exercises a third distinct ground pin through shallow-clone fetching and pinned packaging, rather than only testing the collector in isolation — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- A targeted edit initially mismatched a comment; the exact source was reread and the batch reapplied before testing — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Layout initially oriented image V opposite to the WebGL chart; a red/green DOM regression now keeps their image orientation aligned without changing source bytes or 3D rendering — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The first browser look showed authoring fill tints hiding the grass/dirt colors; new tests now keep outlines/grid while omitting those fill tints when appearances are authored — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The initial candidate mirror went into ignored public assets; the preview-custody pass moved it outside build input and added the explicit dev-only verified mount before publication — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The browser guard initially treated every PutDungeon as a write and then assumed JSON; the existing RPC uses binary gRPC-Web and validate_only. The driver now checks that field with the protobuf wire reader and permits only the read-only preview — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
