# Verify Encounter Studio

## Current boundary

Home → **Encounter Studio** opens a local draft in **Layout**. Home → **World
Builder** remains available. Both entries use the same current-world source
availability and identity lifecycle; availability is not server write permission.
Studio does not inject publication or gameplay launch capabilities.

Layout offers **Paint**, **Erase** and **Rectangle** over canonical walkable hex
cells. Brush strokes sample visited cells (no interpolation); rectangles include
cell centers within the world-XZ box. Middle-drag pans, wheel zooms, and Escape
cancels. These framing operations do not create document history.

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
- If using development compositions, an example server command is:

  ```bash
  VITE_DEV_PLAYER_ID=test-player VITE_ENABLE_DEVELOPMENT_COMPOSITIONS=1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
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
8. Keep deterministic write-error and late-callback checks in the injected-memory
   tests below. Optionally use a third fresh context with corrupt current bytes:
   observe refusal/autosave pause, edit/switch, and verify the original corrupt
   bytes remain unless explicit replacement is chosen.
9. Close the contexts. Record URL, source configuration, revision, exact content
   comparisons, screenshots, console/page/request failures and any incomplete
   steps in the delivery report or PR. Do not put pass claims in this procedure.

## Automated checks

Run individually from the web worktree with matching local dependencies:

```bash
npm run test:run -- src/concepts/encounter-studio/EncounterStudioIntegration.test.tsx
npm run test:run -- src/concepts/world-building/WorldBuilderWorkspace.test.tsx src/concepts/world-building/WorldBuildingViewport.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.ts
npm run typecheck
```

The joined DOM tests use the real Studio shell, WorldBuildingConcept owner,
LayoutViewport, floor mutations, validators and parsers with injected memory
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
