# Verify Encounter Studio

## Current boundary

Home → **Encounter Studio** opens a local draft in **Layout**. Home → **World
Builder** remains available. Both entries use the same current-world source
availability and identity lifecycle; availability is not server write permission.
Studio does not inject publication or gameplay launch capabilities.

Layout offers **Paint**, **Erase** and **Rectangle** over canonical walkable hex
cells, staged **Width (hexes)** / **Height (hexes)** with **Apply dimensions**, and
**Label** placement/selection/drag/rename/move/delete. Brush strokes sample visited
cells (no interpolation); rectangles include cell centers within the world-XZ
box. Middle-drag pans, wheel zooms, and Escape cancels. Framing operations and
view switching do not create document history.

Dimensions are counts from 1 to 128, not world distance. Centered absolute odd-r
columns/rows span `-floor(count/2)` through `ceil(count/2)-1`; even counts take
the extra negative side. Negative odd rows also stagger +½ column. Existing
coordinates never translate. Untagged legacy radius workspaces are identified as
nonrectangular and remain unchanged until explicit Apply. Labels are 2D plain-text
annotations, not gameplay regions, floor/policy membership or arrangement content.
Their IDs/text are at most 120 characters, with at most 256 labels. A rectangular
resize or first label promotes the scene to version 2; older scene-1-only web
readers refuse it rather than strip metadata. See the
[owning contract](../../src/concepts/world-building/CONTRACT.md#centered-workspaces-and-map-annotations-1239)
for membership and conservative protected-extent refusal rules.

**3D** reuses the existing interactive viewport and prop palette/tree/selection
controls: ground or supported-surface drops, Select/Move/Rotate, repeat placement,
duplicate/delete, grouping, cardinal rotation, visual height and visual lights.
One owner holds the draft, site scope, selection, history and local persistence
across both presentations. Switching cancels unfinished gestures/transforms/drops,
retains committed selection and Layout framing, and adds no history. Undo/Redo
are shared document commands; their existing behavior clears selection. The 3D
camera may reset when its renderer remounts.

This slice does not offer room-management/focus tools, discovery simulation,
Layout wall/door tools, asset labels/markings, gameplay camera presets or policy
editors. Existing supported declarations and policies are carried, not removed.
The absence of room-navigation tools is not a statement about multi-room gameplay
support. There is no Studio Save & Play, Publish, world-snapshot/import/reset flow
or API/proto change. Visual lights are not gameplay illumination calculations.

## Safe setup

- Use a dedicated worktree and the repository's [local development guide](local-dev.md).
  Use the existing local stack or explicitly configured reader-only development
  compositions. Do not replace another running stack or dev server.
- If using development compositions, choose an unused authorized port (5174 in
  this example; do not replace another session's server). An example command is:

  ```bash
  VITE_DEV_PLAYER_ID=test-player VITE_ENABLE_DEVELOPMENT_COMPOSITIONS=1 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
  ```

- Use a **fresh, nonpersistent browser context** (for Playwright,
  `browser.newContext()`). Never use the operator's profile, a persistent context,
  imported storage state, or blanket localStorage clearing. Close each disposable
  context at the end. Keep any verification harness outside production source in
  a dedicated tooling worktree.
- Supply locally authorized runtime assets through the documented asset-sync
  mechanism. Do not commit private models, credentials or exported browser state.

### Shared local storage

The shared key is `rpg.concepts.world-building.room-draft.v3`
(`ROOM_DRAFT_STORAGE_KEY`). Its suffix is historical: the current envelope is
**version 5**, containing draft version 3 plus optional normalized site scope.
It is origin-global, not world/session-namespaced. Studio does not copy, migrate
or reset the draft when entering or switching views. Do not open both editors as
competing writers in different tabs for this check.

A missing current key follows the existing legacy-key lookup then blank fallback.
Present empty/malformed current bytes are refused, not treated as absence;
unsupported current envelope v3/v4 is also refused. The owner displays a fallback
in memory and blocks autosave over unreadable bytes. **Replace unreadable local
draft** explicitly overwrites those bytes; use it only in a disposable context
where that consequence is intended. Write failures keep the latest document in
memory and preserve the last successfully stored bytes. Reload restores committed
content, not Undo/Redo stacks. Failed unsaved work is not recoverable by reload.

## Interaction procedure

1. Enter through **Home → Encounter Studio** in the fresh context. Confirm a clean
   Layout surface with visible Paint/Erase/Rectangle, local-save status and no site
   inspector or publication controls.
2. Paint `0,0` and `2,0` as separated samples, then join with `1,0`. Erase `1,0`.
   Use Rectangle from `0,0` to `2,0` to restore the connection. Compare exact
   committed cell identities, not just the screenshot. Capture Layout.
3. Switch to **3D** and verify the same floor visually. Using actual palette drags
   and loaded geometry, place a prop, stack a decoration, transform and group with
   existing controls. Capture 3D and record asset/loading errors. Do not substitute
   direct callback calls for this browser interaction.
4. Return to Layout. Undo should reverse the last prop or floor edit, **not the
   view switch**. Redo restores it. Check interleaved floor/prop history. Pan/zoom
   and switch again; navigation must not consume a history entry.
5. Start a Layout rectangle and switch before release. Returning must show no
   extra committed cells. Start a real 3D transform preview, then switch before
   committing; return to verify the original pose and no new history entry.
6. Reload in the **same disposable context**. Compare the stored full document
   with the last successfully saved document. Open World Builder at the same
   origin and confirm it resumes that same draft; return to Studio and confirm
   the same content. Do not expect history stacks to survive reload.
7. In a **second fresh context**, seed only the shared draft key with
   `stringifyRoomDraft(document.draft, document.scope)` from
   `createPopulatedStudioDocument()` in
   `src/concepts/encounter-studio/fixtures/studioDocument.ts`. Repeat floor edits,
   view switches, Undo/Redo and reload. Compare normalized full documents excluding
   only intentional edits: walls/openings/attached door identities and states,
   prop declarations/bindings, transforms/groups/supports/lights, monster
   declarations/bindings, party start and **every** scope key (tables, factions,
   dispositions, intel, exits, endings, scenarios, concealments).
8. In that populated context, stage 73 × 48 and verify nothing changes before
   Apply. Apply once; confirm exactly 3504 workspace cells, unchanged original
   coordinates/payload and no automatically painted floor. Paint the exposed
   negative/positive edges and check both views. Try an unsafe shrink and record
   the offender path; current dimensions/document/history/stored bytes must stay
   unchanged. Undo/Redo the resize and confirm navigation created no entry.
9. Use **Label** to name Kitchen and Courtyard, including pointer placement and
   the accessible exact-coordinate form. Drag one, rename/move it with Apply or
   Enter, then delete/Undo/Redo; verify stable IDs and no floor/policy changes.
   Stage text/dimensions/drag and cancel with Escape, Cancel or view switching;
   verify no hidden commit. Apply unchanged dimensions/name/location and confirm
   no history entry. Reload and compare full normalized data in both views.
10. In a separate fresh context, seed `createCastleWorkspaceDocument()` from
    `src/concepts/encounter-studio/fixtures/castleWorkspace.ts`. This reusable TS
    fixture uses actual resize/paint/label helpers over the complete populated
    document: 73 × 48, all 3504 cells, Kitchen/Courtyard, walls/openings/attached
    door, props/groups/support/light, actors/start and all site scope. It is the
    authority; do not commit thousands of generated YAML cells. Export to a
    temporary file only when needed. Compare room JSON → YAML → JSON full payload,
    scene/composition decode and room-library snapshot draft equality. Snapshots
    intentionally carry the draft, not site scope; local JSON/YAML carry both.
11. Seed `createSparseMaxWorkspaceDocument()` from the same fixture module and
    confirm 128 × 128 / 16384 workspace cells, sparse floor and full payload fit.
    Commit a label, then attempt to paint every cell with one rectangle. The
    unchanged 500000-character serialization budget must refuse it **before**
    history/storage, preserving the prior document and label Undo/Redo. Supported
    workspace capacity is not a guarantee of fully paintable maximum capacity.
    Check that ordinary incomplete policy staging in World Builder remains
    editable-size-valid but is not called persistable; resize/labels/save/export
    retain full codec validation.
12. Keep deterministic write-error and late-callback checks in the injected-memory
    tests below. Optionally use a third fresh context with corrupt current bytes:
    observe refusal/autosave pause, edit/switch, and verify the original corrupt
    bytes remain unless explicit replacement is chosen.
13. Measure castle and sparse-max render/paint/pick/save timings in the disposable
    browser and record frame/latency/memory observations, serialized size and any
    refusal. Do not infer performance acceptance from cell counts or DOM tests.
    If checking provider compatibility, use temporary web-emitted YAML with the
    pinned toolkit's actual decode/Load and YAML-node re-emission/decode, comparing
    labeled vs label-free compiled gameplay. Record provider revision/commands
    separately; mocked service results do not prove this boundary.
14. Close the contexts. Record URL, source configuration, revision, exact content
    comparisons, screenshots, console/page/request failures and any incomplete
    steps in the delivery report or PR. Do not put pass claims in this procedure.

## Automated checks

Run individually from the web worktree with matching local dependencies:

```bash
npm run test:run -- src/concepts/encounter-studio/EncounterStudioIntegration.test.tsx src/concepts/encounter-studio/StudioControls.test.tsx
npm run test:run -- src/concepts/world-building/sceneState.test.ts src/concepts/world-building/serialization.test.ts src/concepts/world-building/roomDraft.test.ts src/concepts/world-building/singleRoomDungeon.test.ts src/compositions/roomDocument.test.ts
npm run test:run -- src/concepts/world-building/WorldBuilderWorkspace.test.tsx src/concepts/world-building/WorldBuildingViewport.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.ts
npm run typecheck
```

The joined DOM tests use the real Studio shell, WorldBuildingConcept owner,
LayoutViewport, dimension/label forms and gestures, floor/label mutations,
validators and real JSON/YAML/snapshot/composition parsers with injected memory
storage. They retain the real WorldBuildingViewport but replace its **Canvas
WebGL boundary**, observing the controlled scene inputs and calling the owner
callbacks supplied to WorldSceneContents. Thumbnail rendering and external
services are faked; Layout browser geometry/pointer capture are shimmed. These
checks do **not** establish loaded-model raycasts, actual TransformControls
interaction or visual 3D correctness. The disposable browser walk supplies that
separate evidence.

At the PR boundary, run the repository's single full `npm run ci-check` gate and
record actual output. Independent review and operator interaction evidence remain
separate readiness requirements; focused DOM passes do not stand in for them.
