# Run — 2026-11-06 — Courtyard S2 ground authoring

Slice [#874](https://github.com/KirkDiggler/rpg-project/issues/874), story [#867](https://github.com/KirkDiggler/rpg-project/issues/867). Base: `dev` at `2150256f`.

## Shipped

- Studio and play-renderer checkpoint adds region bases, hex ground paint/erase, owner guards/history, native file round trips, Layout textures and batched level ground; joined runtime acceptance and publication remain pending — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Adopt generated protos v0.1.258, merge ground paint across partial discoveries, and draw permitted atlas appearances through both shell paths with existing exposure/pools/fog/watch-zone treatment — [wire contract](https://github.com/KirkDiggler/rpg-api-protos/pull/421).

## Decided

- Keep paint equal to the base as explicit intent; prune paint when its region loses the cell; preserve unknown native-source fields and old absence — [design and plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- Keep the authoring/persistence assertions together in the new ground test file while exercising real room/composition/native helpers rather than adding duplicate fixtures to large existing suites — [S2 plan T1](https://github.com/KirkDiggler/rpg-project/blob/design/867-courtyard-ground/ideas/courtyard-ground/plan.md#t1--authoring-state-persistence-and-edit-invariants).

## Found

- Missing-contract test run failed on the absent `regionGround` import; after implementation the five focused files pass 130 tests and TypeScript checks pass — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Existing region owner edits retain unknown fields unchanged, so ground needs explicit pruning to avoid orphan paint after floor edits — [S2 plan](https://github.com/KirkDiggler/rpg-project/pull/875).
- The play-wiring complete Web gate passed with 9969 tests and five skips; the earlier native Studio checks proved base-preserving paint, pointer paint/erase, undo/redo, YAML export and browser reload without a mutating server request — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- New tests first caught old paint disappearing on a partial discovery and the shell dropping the supplied ground refs; the corrected reducers/rendering now pass the full gate — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Native browser capture has no page exceptions; console messages are the existing documented GetDungeon empty-key authoring probe, not a claim of zero console output. Candidate ground is absent from both public build input and production dist — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The explicit private preview mount verifies resource identity, identifies candidate status and keeps unapproved images out of production build input — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

- The joined private walk now proves native Save a copy → Play, two-client gate discovery with different permitted paint, actor/NPC movement, reload and captured-source immutability. Hardware benchmarking is separate from the initial SwiftShader functional walk — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The explicit `bench` preview uses the same hash-verified private mount for minified-build measurements; a new HTTP test refuses that mount in ordinary production preview. The complete Web gate passes 9971 tests with five skips — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).

## Mistaken

- A targeted edit initially mismatched a comment; the exact source was reread and the batch reapplied before testing — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- Layout initially oriented image V opposite to the WebGL chart; a red/green DOM regression now keeps their image orientation aligned without changing source bytes or 3D rendering — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The first browser look showed authoring fill tints hiding the grass/dirt colors; new tests now keep outlines/grid while omitting those fill tints when appearances are authored — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The initial candidate mirror went into ignored public assets; the preview-custody pass moved it outside build input and added the explicit dev-only verified mount before publication — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
- The browser guard initially treated every PutDungeon as a write and then assumed JSON; the existing RPC uses binary gRPC-Web and validate_only. The driver now checks that field with the protobuf wire reader and permits only the read-only preview — [S2](https://github.com/KirkDiggler/rpg-project/issues/874).
