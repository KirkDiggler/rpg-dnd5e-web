# World Building Concept implementation checklist

Issue: [KirkDiggler/rpg-dnd5e-web#935](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/935) under `KirkDiggler/rpg-project#169`
Durable behavior record: `src/concepts/world-building/CONTRACT.md` (written and verified with the implementation)

## Boundary

Build a durable, development-only Concepts Lab surface at `?concept=world-building`. Keep its continuous-transform authoring document and local persistence explicitly provisional. Reuse the production prop catalog and `PropModel`; do not call the server or modify live author/game routes.

## Recovery note (2026-09-05)

The original implementation session was interrupted after its native worktree
was removed. The exact captured 14-file patch was restored at base `02846a5b`
into the persistent `concept/935-world-building` worktree before this checklist
resumed. Therefore the pre-implementation clean-tree and baseline-test steps
could not be rerun in sequence; the recovered patch provenance is the baseline.
The removed dependency tree was not reused: recovery ran `npm ci` from this
worktree's unchanged lockfile as explicitly directed.

## Checklist

1. **Establish the baseline**
   - Confirm the managed worktree starts at `origin/dev` `02846a5b` with no tracked changes.
   - Confirm `package.json`/lock match `origin/dev` and use the existing symlinked dependency tree without installing.
   - Run the nearest Concepts Lab and shared prop renderer tests before implementation; record any pre-existing failure.

2. **Drive provisional scene math from tests**
   - Define bounded catalog-backed scene, item transform, group/support relation, and arrangement types.
   - Test free (non-hex-quantized) X/Z positions and intentional overlap.
   - Test move/rotate propagation for support/group descendants while retaining individual editability.
   - Test grouping without flattening or absorbing unselected content, duplicate/delete, and undo/redo snapshot semantics.
   - Test arrangement stamping for fresh IDs, remapped relationships, and immutable library/sibling copies.

3. **Drive persistence and import safety from tests**
   - Add versioned scene/library envelopes and strict bounded parsers.
   - Reject unknown asset refs, duplicate IDs, invalid/non-finite/out-of-bounds transforms, invalid/self/cyclic relationships, malformed envelopes, and oversized documents.
   - Make scene/library local-storage writes and reads non-destructive on error.
   - Round-trip valid scenes and libraries, preserving relationships and continuous transforms.

4. **Build the usable concept surface**
   - Register `world-building` in `ConceptsView` and keep the existing development deep-link behavior.
   - Provide a finite blank ground plane with visible real hex basis.
   - Provide a searchable real asset palette sourced from `PROP_KEYS`, adequate for a decorated-table case.
   - Render every placed item through shared `PropModel` (including companion meshes) with concept-local measured-anchor correction where needed.
   - Place freely on X/Z via pointer intersections and allow overlaps. Default Sims-like placement points directly at a suitable real mesh's upward-facing tabletop/surface, snaps to that intersection, and records the support attachment automatically; ground intersections place on the floor. Keep any explicit support control as an escape hatch, not a required ritual.
   - Add selection, additive selection, drag/move, rotate, group/ungroup, duplicate, delete, undo/redo, and keyboard shortcuts without fighting OrbitControls.
   - Show selection/placement feedback, model loading fallback/failure, and concise accessible instructions.

5. **Add durable scene/library workflows**
   - Auto-save valid scene and library snapshots locally; show storage errors without mutating good in-memory data.
   - Save the current selection as a named arrangement; start with an empty arrangement library.
   - Stamp arrangements independently at free positions.
   - Export and import scene/library JSON through local files/text, with visible non-destructive validation errors.
   - Add explicit new/reset controls that cannot silently erase a scene.

6. **Exercise real UI paths**
   - Component tests cover editing, selection/grouping, undo/redo, save/reopen, arrangement stamping, and invalid storage/import error display using real state/UI paths while mocking only the WebGL canvas boundary where jsdom requires it.
   - Browser proof uses the actual R3F canvas and synced GLBs: decorated table → save selection → stamp twice at sub-hex positions → edit one candle → verify sibling/library independence → reload → verify editable round trip.
   - Capture console/network/model-load evidence and screenshots outside git.

7. **Document and verify**
   - Add `src/concepts/world-building/CONTRACT.md` distinguishing proved local behavior, provisional JSON from today’s server contract, known limits, asset anchor treatment, and exact commands.
   - Update Concepts documentation.
   - Run focused tests, typecheck, format check, lint, build, then full `npm run ci-check`.
   - Commit scoped changes with normal hooks; leave no staged files and report exact worktree/branch/head plus browser server PID/log/URL.

## Recovery completion record

- [x] Recovered patch inspected against the approved issue and concept boundary.
- [x] Dependencies installed from the unchanged candidate lockfile.
- [x] Focused scene, serialization, component, and shared-renderer tests pass.
- [x] Typecheck passes after recovery fixes.
- [x] Placement rays use real support meshes; selection bounds are separate.
- [x] Right-drag camera binding and direct left-drag object movement proved.
- [x] Decorated-table, two independent stamps, isolated edit, reload/edit,
      support movement/rotation, duplicate/delete, undo/redo proved in real
      Chrome/R3F/GLBs with managed screenshots and structured evidence.
- [x] Durable contract and Concepts documentation updated.
- [ ] Scoped format/lint/build and full `npm run ci-check` pass on final head.
- [ ] Final candidate committed with no staged files; live server receipt
      recorded in delivery report.
