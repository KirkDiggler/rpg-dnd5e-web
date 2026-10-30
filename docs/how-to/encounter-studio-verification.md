# Verify Encounter Studio

## Site management

The header's **Site** button opens one management surface without saving or
launching. **Open** offers My World, References and Import YAML; **Save** offers
My World, Save a copy and Download YAML. Only the active operation is shown.
Switching operations or closing Site cancels an unconfirmed server overwrite.
While a publishing transaction runs, Site navigation and close are disabled.

The world save and YAML download share one file key. Save a copy proposes a
different key, refuses the source key, and still uses the server's existing
collision/overwrite check. Leaving an unsaved copy restores the previous
destination; a successful copy becomes the saved destination. Re-entering Copy
must not permit the original key, including via Play. Opening an owned site remembers its destination;
references and other members' sites get a fresh destination. YAML import asks
before replacing the draft and can be undone. Failures leave the draft intact.

**Play** is a separate header action; it still saves before launching and shows
any confirmation or error inside Site. Saving does not require a character.
**Browser recovery** is local-only, not a world save. Its explicit save button
lives in Site's footer; YAML operations remain available when the server is off.

Check at desktop and narrow widths: open Site, switch among the six operations,
confirm only one form is shown, download/import a YAML file, and verify copy
saving does not change the original destination. Use a disposable context and
only test-owned world files for writes. Cast and selected-NPC controls are not
part of this change.

## Cast appearances

Encounter → Cast offers a member list and one focused appearance editor. **Add
monster** uses the configured standard monster choices; a cast name or changed
look does not create a template or change the rules ref. A zombie can use a human
appearance. **Use standard monster look** removes the default look override.
Existing placements retain their own appearances; new placements use the edited
default. One-look appearances are available alongside families with style/skin
choices. The **Advanced editor** retains the existing stat-block/equipment
controls; their rulebook capabilities are unchanged.

Build → 3D → Monsters & NPCs places cast members. A standard monster needs no
explicit look: its declaration omits appearanceRef. Imported cast members without
default looks offer **Appearance for this placement**, using the looks already
placed in that site; placing does not add or change cast defaults. Check the
reference castle's existing cast, not only a newly added standard monster. In a selected NPC's inspector,
**Remove from board** removes that placement, not its cast member. Undo restores
its position, bindings, name and look. Props retain their existing controls.

Verify: add a zombie, name it, choose a human look, Apply, and inspect a YAML
roundtrip for unchanged zombie ref and no new template. Add and place a skeleton
using its standard look, remove it with the inspector action, then Undo. Confirm
that cast membership and siblings survive removal. Use the same disposable-context
rules below; do not replace an operator's local draft.

## Current boundary

Home → **Encounter Studio** opens a local draft in **Layout**. Home → **World
Builder** remains available. Both entries use the same current-world source
availability and identity lifecycle; availability is not server write permission.
Studio does not inject publication or gameplay launch capabilities.

Studio has two permanent bands: the document/name/save/view header and the
editing/history toolbar. Header naming stages a canonical rename. There is no
**Size**: the canvas is unbounded and the file stores no workspace
(rpg-project#725 R3). **Wall** and **Label** settings can dismiss without
deleting committed content.

Layout offers **Paint** and **Rectangle** into the **active region**, **Erase**
of floor, **Select** and **Wall** over existing canonical structural walls, and
**Note** placement/selection/drag, with selected rename/move/delete in
**Arrange**. See [Regions and the unbounded canvas](#regions-and-the-unbounded-canvas-rpg-project725).
Brush strokes sample visited
cells (no interpolation); rectangles include cell centers within the world-XZ
box. Middle-drag pans, wheel zooms, and Escape cancels. Framing operations and
view switching do not create document history.

The grid Layout draws is the content bounding box plus a 6-cell margin, derived
on every change and never stored; painting past its edge grows it. The floor is
the union of the regions' cells, and no cell belongs to two regions. **Paint**
and **Rectangle** move each cell into the active region, from wherever it was;
**Erase** removes cells from the floor whichever region holds them. A region's
name is its map label, and its lighting is `lighting.intensity`. A region may be
listed with no cells; removing a region returns its cells to the implicit
region. Notes are 2D plain-text annotations, not regions, floor membership or
3D scenery. Their IDs/text are at most 120 characters, with at most 256 notes.
The file is root `version: 5` and the local envelope is version 6; older
versions are refused by name, never migrated. See the
[owning contract](../../src/concepts/world-building/CONTRACT.md) section
"Regions are the floor".

**3D** reuses the existing interactive viewport and prop palette/tree/selection
controls: ground or supported-surface drops, Select/Move/Rotate, repeat placement,
duplicate/delete, grouping, cardinal rotation, visual height and visual lights.
One owner holds the draft, site scope, selection, history and local persistence
across both presentations. Switching cancels unfinished gestures/transforms/drops,
retains committed selection and Layout framing, and adds no history. Undo/Redo
are shared document commands; their existing behavior clears selection. The 3D
camera may reset when its renderer remounts.

This slice does not offer room-management/focus tools, discovery simulation,
new opening/door creation tools, asset labels/markings, gameplay camera presets or
policy editors. Existing supported declarations and policies are carried, not removed.
The absence of room-navigation tools is not a statement about multi-room gameplay
support. Studio Save & Play (#1236) reuses World Builder's publishing and
launch hooks against the API's existing authoring and lobby services; there is
no Studio world-snapshot/reset flow or API/proto change. Visual lights are not gameplay illumination calculations.

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
**version 6** (regions as the floor), containing draft version 3 plus optional
normalized site scope.
It is origin-global, not world/session-namespaced. Studio does not copy, migrate
or reset the draft when entering or switching views. Do not open both editors as
competing writers in different tabs for this check.

A missing current key falls back to a blank draft; the retired v1/v2 keys are
no longer read. Present empty/malformed current bytes are refused, not treated
as absence; envelopes 1–5 are refused by name ("rebuild, no migration
(rpg-project#725)"). The owner displays a fallback
in memory and blocks autosave over unreadable bytes. **Replace unreadable local
draft** explicitly overwrites those bytes; use it only in a disposable context
where that consequence is intended. Write failures keep the latest document in
memory and preserve the last successfully stored bytes. Reload restores committed
content, not Undo/Redo stacks. Failed unsaved work is not recoverable by reload.

## Interaction procedure

1. Enter through **Home → Encounter Studio** in the fresh context. Confirm the two
   permanent chrome bands, Paint initially active, Select/Wall/Note available,
   local-save status and no site inspector or publication controls. Default
   Label and appearance fields are hidden. Check desktop and narrow/mobile sizes,
   toolbar overflow and usable canvas area; capture both.
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
8. In that populated context, paint a cell well past the drawn grid edge and
   confirm the grid grows to include it, the map holds still under the pointer,
   and no coordinate or payload changes. Undo removes the cell and the grid
   shrinks back; navigation created no entry.
9. Use **Note** to name Kitchen and Courtyard, including pointer placement and
   the accessible exact-coordinate form (**Label name**, **Place label on map**). Drag one, rename/move it with Apply or
   Enter, then delete/Undo/Redo; verify stable IDs and no floor/policy changes.
   Stage text/drag and cancel with Escape, Cancel or view switching;
   verify no hidden commit. Apply unchanged name/location and confirm
   no history entry. Reload and compare full normalized data in both views.
10. In a separate fresh context, seed `createCastleWorkspaceDocument()` from
    `src/concepts/encounter-studio/fixtures/castleWorkspace.ts`. This reusable TS
    fixture uses actual paint/note helpers over the complete populated
    document: the 73 × 48 rectangle's 3504 cells, Kitchen/Courtyard, walls/openings/attached
    door, props/groups/support/light, actors/start and all site scope. It is the
    authority; do not commit thousands of generated YAML cells. Export to a
    temporary file only when needed. Compare room JSON → YAML → JSON full payload,
    scene/composition decode and room-library snapshot draft equality. Snapshots
    intentionally carry the draft, not site scope; local JSON/YAML carry both.
11. Zoom out and drag **Rectangle** over more than 65,536 cells. The release
    shows the notice "A rectangle selects at most 65536 cells." and changes
    nothing: no history entry, no storage write, prior Undo/Redo intact. Check that ordinary incomplete policy staging
    in World Builder remains editable-size-valid but is not called persistable;
    labels/save/export retain full codec validation.
12. Keep deterministic write-error and late-callback checks in the injected-memory
    tests below. Optionally use a third fresh context with corrupt current bytes:
    observe refusal/autosave pause, edit/switch, and verify the original corrupt
    bytes remain unless explicit replacement is chosen.
13. Measure castle and sparse many-region render/paint/pick/save timings in the disposable
    browser and record frame/latency/memory observations, serialized size and any
    refusal. Do not infer performance acceptance from cell counts or DOM tests.
    If checking provider compatibility, use temporary web-emitted YAML with the
    pinned toolkit's actual decode/Load and YAML-node re-emission/decode, comparing
    labeled vs label-free compiled gameplay. Record provider revision/commands
    separately; mocked service results do not prove this boundary.
14. Close the contexts. Record URL, source configuration, revision, exact content
    comparisons, screenshots, console/page/request failures and any incomplete
    steps in the delivery report or PR. Do not put pass claims in this procedure.

## Wall and compact-context procedure

Use the populated context above, retaining props/groups/supports/lights,
actors/start, openings/attached door/bindings and every site scope field. To test
an existing rotated wall, derive it with `rotateWall` before encoding the fixture;
do not replace it with a new doorless wall or hand-write an unchecked second schema.

1. Open the header name, stage a trimmed name and Apply. Compare both canonical
   scene/draft names, unchanged IDs/storage key/scope, one Undo/Redo and reload.
   Same trimmed name is a no-op; blank/overlong names refuse. Cancel/Escape/view
   navigation must never commit staging.
2. Open **Wall** with no default appearance. Search a wall (for example
   `castle_wall_01`), then a supported non-wall appearance (`alchemy_tools_01`).
   Verify ranked native image buttons, named loading/error fallback and search
   recovery. Generated thumbnails use published provider images; a missing
   preview is not an unavailable appearance. Verify image HTTP 200 and decoded
   dimensions, then search/scroll/close/reopen: no additional GLB request or
   thumbnail WebGL context may be caused by the picker. Record any existing
   application preloads before opening it separately. In another disposable
   context refuse one image request; confirm named selectable fallback and no
   model-capture fallback. Actual prop placement must still load its GLB.
3. Confirm **Snap to hex centres, corners and side midpoints** starts off. Choose
   an appearance and draw two successive walls, one free and one snapped. Compare
   exact lines with `snapWallPoint` and creation defaults; preview sampling writes
   nothing, each accepted release adds one history entry, and Wall remains armed.
   Dismiss controls, verify committed walls remain, reopen and confirm retained
   appearance/snap. Escape/right-click cancels the unfinished draw and exits Wall;
   zero-length/cancel/capture loss must add no content/history.
4. Use **Select** on the rotated existing wall, then drag its body and selected
   endpoint. Compare rigid movement with `translateWall` and endpoint output with
   `reshapeWallEndpoint`, not merely a changed screenshot. Request a length shorter
   than an opening edge: the visible preview and committed endpoint must match the
   helper's protected clamp on the requested ray, not the cursor. The opposite end
   stays fixed; rotation carries openings/attached doors with the bearing. Confirm
   stable IDs, binding state and independent blocker fields.
5. Exercise exact length, rotation and appearance on that selected wall. Numeric
   length is collinear; appearance does not rewrite the blocker. Unchanged
   selection/release and settings reflow must not move it or create history. Try
   an out-of-workspace edit; notice/inputs remain visible, document and stored
   bytes stay unchanged. Tool/option/view retirement during preview must prevent
   a late release from committing.
6. Remove the owning wall, then Undo/Redo. Removal clears its owned openings and
   attached-door binding but preserves unrelated bindings and the complete site
   scope, including explicit concealment reference lists. Those lists may now
   contain unresolved IDs; they are carried authoring, not proof of publishability.
   Undo restores the owned identities/binding, making unchanged references resolve
   again. Compare the whole document at each step.
7. Interleave floor, wall and real 3D prop edits. Navigate without adding history;
   Undo/Redo must traverse only accepted edits, including removal. In 3D inspect
   actual loaded appearances/openings/door initial state, then return and reload
   with the attachment restored. Compare the full normalized document and JSON/
   YAML payload, not just walls or floor counts. Room snapshots intentionally carry
   draft only; local JSON/YAML carry complete scope. Dismiss Label settings and
   verify committed labels persist without reviving canceled placement.
8. Keep unfinished-policy staging in the legacy policy editor: Studio deliberately
   offers none. Ordinary wall/name authoring must retain those rows and remain
   undoable, while save/export refuse incomplete intel and preserve last good
   bytes. Complete the missing fact explicitly, then verify the whole authored
   document becomes persistable without dropping policy. Do not seed invalid
   storage to bypass the strict load gate.

## Shared Arrange procedure

Arrange is a collapsible precision companion, not a second document owner.
Creation palettes remain separate. A single active noun drives selected fields,
3D gizmos and supported shortcuts; remembered scenery must not receive actor or
Layout keyboard edits. Units are canonical world units, displayed degrees and
height percentages, or actor/start hex q/r—not physical metres or a universal
XYZ/scale interface. This increment does not implement asset-backed doorways or
observer privacy.

Use the populated context and exact full-document comparisons above:

1. Select a rotated wall in Layout. **Arrange** shows midpoint X/Z, Y facing,
   length/fixed endpoint and appearance height/thickness/elevation. Apply without
   typing: exact line/openings, stored bytes/write count and Undo availability
   must remain unchanged despite rounded displays. Stage several fields and
   Apply/Enter once; one Undo restores the whole original, not a partial form.
   Invalid late input refuses the entire form. Deliberate appearance replacement
   stages in Arrange; drawing appearance remains independent.
2. Use the actual wall body/endpoint drag, then the loaded wall Y-ring in 3D.
   Positive Three.js Y yaw follows `previewWallTransform`, not `rotateWall`'s
   mathematical XZ sign. Preserve openings, attached-door state and bindings.
   Layout gesture previews are local SVG; 3D owner previews additionally update
   clean Arrange fields, show **Preview**, and disable Apply until completion.
3. With real loaded props, select one prop/group: inspect actual world XYZ and
   absolute Y facing. Select two independent roots: inspect **Selection pivot**
   and relative **Rotate by**, never fabricated absolute facing. Numeric XYZ,
   yaw and height followed by existing arrows/plane/gizmo movement share the
   same document/history. Group descendants and supported decorations transform
   once; height affects selected pieces, not support-only decorations. Applying
   100% to already-default pieces must not materialize absent `heightScale`.
4. Collapse during a real 3D gesture, then expand during preview. Check canvas
   element identity, unchanged tool/selection, no writes before release, and no
   phantom Undo entry. Same-target preview/pose renders must not reopen a
   collapsed panel; a new explicit selection may. Cancel live gestures with
   Escape, capture loss and view change. Numeric Escape/Cancel, blur, collapse
   and view/target retirement must never commit staging.
5. Pick a fresh monster and party start on the real 3D surface. Monsters expose
   q/r plus the eight supported compass names/default; start exposes q/r only.
   Actor location/facing Apply is atomic; **Asset default** deletes optional
   facing. R/Duplicate must not operate on remembered scenery. Select a label
   through the Layout picker or canvas, then rename/move with Arrange Enter;
   one Undo restores both text and position. Retired callbacks must not mutate
   the previously active noun.
6. Capture expanded/collapsed desktop and narrow contexts. Check two permanent
   bands, horizontal toolbar overflow, scroll-to-Apply, visible keyboard focus
   and errors, independent creation palettes and usable canvas. Record actual
   render observations, not HTTP success or thumbnails alone.
7. Traverse numeric/gizmo edits with Undo/Redo, then reload in the same disposable
   context. Compare complete normalized JSON/YAML and local bytes, retaining
   source identity, policy/scope, optional-field presence, bindings, groups,
   support and lights. Reload restores content, not history. Record unavailable
   backend/provider capabilities and unexercised interactions explicitly.

## Regions and the unbounded canvas (rpg-project#725)

The walk for rpg-project#730. Run it against an api built from `dev`, which
reads version 5.

1. Open the castle with **Site → Import YAML** of
   `src/concepts/encounter-studio/fixtures/the-mad-king.yaml`. The view frames
   the whole castle on import, with no **Show entire**. (The shelf castle under
   References carries rpg-project#716 vocabulary this build does not read yet,
   and is refused by name.) The Rooms list shows ten regions: nine
   named plus the implicit one. Their hex counts sum to 1,586, and each row
   shows its light %. There is no Size section in the room view.
2. Choose Gatehouse's radio (**Paint into Gatehouse**). With **Paint**, brush
   five courtyard cells. Gatehouse's count rises by five, Courtyard's falls by
   five, and the footer hex count is unchanged.
3. With Gatehouse still active and **Erase**, remove three courtyard cells.
   The footer count falls by three and Courtyard's by three; Gatehouse stays
   active. Export
   the draft file: the rows changed under the right region.
4. Type "Chapel annex" in **New region name** and press **New region**. It is
   selected and its radio is checked. Paint ten cells; its row reads 10 hexes.
   Rename it in the region view; its map label follows. **Remove region**: its
   cells return to the implicit region, and the implicit region is active again.
5. Set Chapel's **Lighting (%)** to 30. The preview atlas shows intensity 0.3
   for that region. Save & Play: standing in the chapel, the current region
   reads "Chapel", and the 3D ambient is dimmer there.
6. **Show entire** frames the castle. Paint one cell past the drawn grid edge:
   the grid grows, and the map does not jump under the pointer.
7. Export, re-import, export: byte-identical, about 50 KB.
8. Make a refusal the server raises at a region, for example a region painted
   only on wall footing ("every cell is wall footing"). The preview's jump
   button selects that region.
9. In play with two seats, a clang in the courtyard is heard at the gatehouse
   with no door between them (Debug tab: Heard, hops 0).

## Region brush procedure

Regions are **authoring presentation**: name, map label and lighting
(rpg-project#725 R4). Hearing, door footing and seats come from wall
partitions the encounter derives at load; Studio never draws or stores them.
Region edits share the full-document owner, history, validation and
persistence. Use `createCastleKeepDocument()` in
`src/concepts/encounter-studio/fixtures/castleKeep.ts`, which keeps walls,
doors, props, actors, start and every scope key.

1. Enter through **Home → Encounter Studio**. The Rooms list shows each region
   with its hex count and light %, and one radio per row (**Paint into NAME**);
   the implicit region is active. Select a row: the region view shows
   "Painted · N hexes" and **Make active**.
2. Make Chapel active, by its radio or **Make active**. **Paint** courtyard
   cells: each moves to Chapel, both counts change, the footer floor count does
   not. **Rectangle** does the same for every cell centre in its box.
3. With Chapel still active, **Erase** a chapel cell and a courtyard cell. Both
   leave the floor; Chapel stays active.
4. Type a name in **New region name** and press **New region**. It is selected,
   active and reads "Not painted yet. Make it active and paint its cells."
   Paint into it, rename it with **Region name** (the map label follows), then
   **Remove region**: its cells return to the implicit region, which is active
   again. One Undo restores each step.
5. Start a stroke and cancel with Escape, a selection change or a view switch
   before release: nothing commits. Painting cells already in the active region
   writes nothing. Interleave a floor edit and a real 3D prop edit, return to
   Layout and walk Undo/Redo; navigation is not history.
6. Move a wall or a door. No region changes: walls never adopt, move or
   unresolve a region.
7. Zoom out and drag **Rectangle** past the 65,536-cell cap: the notice names
   the cap and nothing changes.
8. Inspect desktop and narrow screenshots: list legibility, radio and row
   focus, the region view's controls, actual canvas area. Do not count cells
   covered by a panel as exercised.
9. Reload and compare the full document, JSON and YAML; the YAML lists each
   region's `cells` as row runs.

## Region background lighting procedure

A region's lighting is its own `lighting.intensity`, edited as **Lighting (%)**
on the region view; full intensity draws no background area.

Use `createRegionLightingDocument()` in
`src/concepts/encounter-studio/fixtures/regionLighting.ts` for the complete synthetic
two-room/native-prop/torch/attached-door/all-scope seed. The configured variant
uses 15%/80%; `createUnresolvedRegionLightingDocument()` keeps lighting on two
declared regions with no cells. `createSparseRegionLightingDocument()` provides
many small separated regions within the caps. These helpers are test authority,
not operator documents or default starter content.

1. Enter **Home → Encounter Studio**, select a region from the Rooms list or
   the map, and inspect **Lighting (%)**: it shows the region's intensity as a
   percentage. Notes expose no lighting field. Applying without typing, or an
   unrelated rename, keeps the intensity; repeating an equal value preserves
   bytes and history.
2. Type15 without Apply: document/viewport must stay committed. Join rename,
   move and15 with Enter: one Undo restores the entire payload. Try101, blank or
   nonnumeric late tokens: refuse the whole candidate and keep visible error/input.
   **Use baseline appearance** stages null until Apply. Cancel/Escape/collapse,
   view/target/epoch/document retirement discard region view staging; blur does
   not submit. Lighting-only retains unfinished policy staging, but an explicitly
   supplied equal label token still invokes strict validation. Save/export stay
   strict; never seed invalid storage to test this distinction.
3. Switch to3D, collapse Arrange, fix camera and wait for native texture/model
   settle. Compare neighboring automatic15%/80% rooms: actual textured floor,
   props, divider faces, attached-door surfaces and caps, not a floor overlay or
   prop-centre classification. Change15→50 without changing source declaration,
   selected point input or emission. Inspect a long crossing prop, move/rotate
   and elevate it with real controls, and compare both divider sides. Seeded
   initial open/closed door variations use canonical bindings, not a live RPC.
4. Inspect the Forest/Meadow regions: a few painted cells with no enclosing
   walls. Actual asset parts and floor follow the regions' cells, not
   rectangular bounds. Cells outside them, and a full-intensity neighbour,
   keep the plain floor appearance. Placed point lights on lit assets can
   cross boundaries; Basic floor local response is configured-only, not occlusion.
5. Toggle the existing native torch **Light enabled** control off/on at15/50/80.
   Ray-certify each sampled pixel against the first real visible floor surface
   (underlay aroundY0.194, not hidden ground aroundY0.008). Keep historical
   occluded/wrong-height samples as failed evidence, not torch proof. Compare
   identical linear local input/term, not equal encoded screenshot deltas.
6. Shorten or remove the divider, then Undo: no region's cells or lighting
   change. A region with no cells keeps its lighting and draws nothing until
   it owns a cell; painting into it applies that lighting.
7. Interleave accepted lighting, floor and prop edits; navigate, Cancel, no-op,
   Undo/Redo and same-context reload. Compare full document/optional bytes, not
   counts alone. Actual new encoder JSON/YAML must preserve version 5, complete
   scope, walls/start/declarations/bindings and every region's lighting.
8. In explicitly headed hardware Chrome, record unmasked renderer, viewport/DPR,
   finite browser/outer deadlines and paired warm baseline/lighting frame times.
   Observe120 camera frames,20 source/level changes,10 view round trips, repair and
   asset/cap changes. Track real material/field/program identities and live
   resources: no camera field rebuild/upload/clone, warmed variants and resource
   plateaus, unchanged cache-shared materials. Include sparse-max/many-area cost.
   Required surfaces with shader/material diagnostics cannot pass. Record measured
   delta and unverified rows; no invented FPS pass or broad profiling campaign.
9. Keep licensed render screenshots/receipts private. Operator screenshots prove
   only their exercised scenario; focused DOM tests and synthetic viewport probes
   do not substitute for the actual route matrix or provider carriage.

### Provider carriage is a separate prerequisite

Web JSON/YAML round trips do not prove provider compilation. Use the authorized
clean API snapshot and its **actual pinned** encounter module with the real
registry validate-only, Put, Get, disk and fresh-registry paths. Emit actual new
Web encoder sources: a baseline with full-intensity regions, a version 5 file
with configured lighting, and one with a declared region that has no cells. Preserve structural walls, required
partyStart, all scope and gameplay keys; vary only presentation metadata for the
compiled-equality comparison. Validate the baseline too: a synthetic scenario
name or occupied start is a fixture refusal, not a version 5 result.

Use a temporary Go overlay of the existing registry test file, appending a suite
method that reads absolute temporary encoder fixtures. Registry writes use
`t.TempDir()`. Compare exact source bytes and entire compiled Spec/Atlas/region
membership and gameplay lighting against baseline. Record actual API head/Go/pins,
original test/go.mod/go.sum hashes and clean status before/after. Never edit source,
pins or services to make this probe green. There is no Save & Play/liveRPC claim.

If even the metadata-free structural-wall base is refused, record that format/pin
blocker separately from local authoring results. Do not remove walls from exports,
substitute a newer provider, claim an API launch/save, or treat a metadata-only
diagnostic as full-document acceptance.

## Automated checks

Run individually from the web worktree with matching local dependencies:

```bash
npm run test:run -- src/concepts/encounter-studio/EncounterStudioIntegration.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.tsx src/concepts/world-building/structuralWallEditing.test.ts src/concepts/world-building/mapLabelEdits.test.ts
npm run test:run -- src/concepts/encounter-studio/StudioArrangePanel.test.tsx src/concepts/encounter-studio/StudioControls.test.tsx src/concepts/world-building/WorldBuildingConcept.test.tsx src/concepts/world-building/StructuralWallVisual.test.tsx src/concepts/world-building/structuralWallEditing.test.ts src/concepts/world-building/structuralWallGeometry.test.ts
npm run test:run -- src/concepts/world-building/sceneState.test.ts src/concepts/world-building/serialization.test.ts src/concepts/world-building/roomDraft.test.ts src/concepts/world-building/singleRoomDungeon.test.ts src/compositions/roomDocument.test.ts
npm run test:run -- src/concepts/world-building/WorldBuilderWorkspace.test.tsx src/concepts/world-building/WorldBuildingViewport.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.tsx src/concepts/world-building/WorldBuildingInteraction.test.ts
npm run test:run -- src/concepts/encounter-studio/StudioArrangePanel.test.tsx src/concepts/encounter-studio/EncounterStudioIntegration.test.tsx src/concepts/encounter-studio/fixtures/regionLighting.test.ts
npm run typecheck
```

The joined DOM tests use the real Studio shell, WorldBuildingConcept owner,
LayoutViewport, note/wall/region forms and gestures, floor/note/wall/region
mutations, pure snap/reshape/rotation and region boundary helpers, validators and
real version 5 JSON/YAML/snapshot/composition parsers with injected memory
storage. Region checks include the active region, erase with a region active,
the rectangle cap notice, selection/history retirement, regions with no cells,
no-op byte/write exactness and full payload preservation. They retain the real WorldBuildingViewport but replace its **Canvas
WebGL boundary**, observing the controlled scene inputs and calling the owner
callbacks supplied to WorldSceneContents. Thumbnail rendering and external
services are faked; Layout browser geometry/pointer capture are shimmed. These
checks do **not** establish loaded-model raycasts, actual TransformControls
interaction or visual 3D correctness. The disposable browser walk supplies that
separate evidence.

At the PR boundary, run the repository's single full `npm run ci-check` gate and
record actual output. If a live preview's ignored asset link must remain stable,
use an explicitly authorized detached verification worktree at the exact final
commit, with only a matching dependency symlink and no asset link; record cwd,
head and clean status. Never interrupt the operator's preview for a gate.
Independent review and operator interaction evidence remain
separate readiness requirements; focused DOM passes do not stand in for them.
