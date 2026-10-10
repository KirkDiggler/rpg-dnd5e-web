# Verify Encounter Studio

## Current boundary

Home → **Encounter Studio** opens a local draft in **Layout**. Home → **World
Builder** remains available. Both entries use the same current-world source
availability and identity lifecycle; availability is not server write permission.
Studio does not inject publication or gameplay launch capabilities.

Studio has two permanent bands: the document/name/save/view header and the
editing/history toolbar. Header naming stages a canonical rename; **Size** opens
**Width (hexes)** / **Height (hexes)** with **Apply dimensions**, rather than
permanently occupying canvas space. Successful Apply commits then dismisses;
Cancel/Escape discard staging. **Wall** and **Label** settings can also dismiss
without deleting committed content.

Layout offers **Paint**, **Erase** and **Rectangle** over canonical walkable hex
cells, **Select** and **Wall** over existing canonical structural walls, Size, and
**Label** placement/selection/drag, with selected rename/move/delete in **Arrange**.
Brush strokes sample visited
cells (no interpolation); rectangles include cell centers within the world-XZ
box. Middle-drag pans, wheel zooms, and Escape cancels. Framing operations and
view switching do not create document history.

Dimensions are counts from 1 to 128, not world distance. Centered absolute odd-r
columns/rows span `-floor(count/2)` through `ceil(count/2)-1`; even counts take
the extra negative side. Negative odd rows also stagger +½ column. Existing
coordinates never translate. Untagged legacy radius workspaces are identified as
nonrectangular and remain unchanged until explicit Apply. Labels are 2D plain-text
annotations, not gameplay regions, floor/policy membership or 3D scenery.
Their IDs/text are at most 120 characters, with at most 256 labels. A rectangular
resize or first ordinary note promotes an older scene to version 2. Explicit
Room-label creation promotes to scene 3 and links one label to one authoring
region. Existing scene 1/2 notes remain notes; reading does not promote or add
empty collections. Older readers refuse unsupported versions rather than strip
metadata. See the
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
new opening/door creation tools, asset labels/markings, gameplay camera presets or
policy editors. Existing supported declarations and policies are carried, not removed.
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

1. Enter through **Home → Encounter Studio** in the fresh context. Confirm the two
   permanent chrome bands, Paint initially active, Select/Wall/Label/Size available,
   local-save status and no site inspector or publication controls. Default Size,
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
8. In that populated context, open **Size**, stage 73 × 48 and verify nothing
   changes before Apply. Apply once; confirm fields disappear, exactly 3504
   workspace cells, unchanged original
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

## Wall and compact-context procedure

Use the populated context above, retaining props/groups/supports/lights,
actors/start, openings/attached door/bindings and every site scope field. To test
an existing rotated wall, derive it with `rotateWall` before encoding the fixture;
do not replace it with a new doorless wall or hand-write an unchecked second schema.

1. Open the header name, stage a trimmed name and Apply. Compare both canonical
   scene/draft names, unchanged IDs/storage key/scope, one Undo/Redo and reload.
   Same trimmed name is a no-op; blank/overlong names refuse. Cancel/Escape/view
   navigation must never commit staging. Open Size, then Cancel/Escape; confirm
   unchanged document/history and that reopening reads committed dimensions.
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

## Room boundaries and explicit repair

These are **authoring definitions**, not gameplay regions, floor membership,
concealment or visibility. The label owns text and anchor; the linked
region owns boundary and optional visual background intent. Definitions share
the existing full-document owner, history, validation and persistence. There is
no region-specific publication capability or gameplay illumination control.

Use a disposable populated fixture with a closed outer rectangle and an
axis-aligned divider that meets the outer wall interiors exactly. Keep its
openings, attached-door bindings, props/supports/lights, actors/start and every
scope key. Seed an ordinary saved note before entry. Use canonical helpers and
`stringifyRoomDraft`, not handwritten authoring callbacks or unchecked storage.

1. Enter through **Home → Encounter Studio**. Open **Label**, choose
   **Room · linked boundary** in **Label kind**, enter a name, then
   **Place label on map**. Use a pointer or the **New label world X/Z** form
   and **Place label at coordinates** to place one room inside each side.
   Dismiss Label controls. Select each label by pointer or keyboard Enter on
   **Select map label NAME**. Verify distinct boundaries and **Automatic ·
   Resolved** in Arrange. The saved ordinary note has neither a linked region
   nor repair controls; new **Note** creation retains that behavior.
2. Select the divider and change **Wall midpoint X** with **Apply Arrange**.
   Compare current boundary rings, identical persisted region IDs/witnesses,
   door bindings and complete unrelated payload. Apply unchanged fields or
   **Use enclosing walls** on the already bound room: exact stored bytes and
   write count must not change. Undo/Redo should traverse only accepted intents.
3. Shorten the divider enough to leave a true representable gap, even a small
   one. Boundaries must disappear, while labels/definitions survive with
   **Unresolved** and a reason. Reload via Home → Studio and compare the full
   document, JSON and YAML. Restore the exact original endpoint/source walk:
   the bound rooms resolve without acquiring another witness. Removing a
   divider or crossing a label into another enclosure must not adopt that area.
4. In a separate fresh fixture with a missing outer wall, place a Room label.
   Its automatic definition has no witness. Close the room with **Wall**,
   choosing an actual appearance and drawing with a real pointer. If native
   screen round trips leave nonidentical endpoints, use the existing Arrange
   precision fields to author exact coordinates/length, or use supported hex
   snap geometry; never expect distance-based welding. Even after closure,
   the initial definition stays unbound. Select the label and explicitly press
   **Use enclosing walls** to bind once. Repeating it is a no-op.
5. Place Forest and Meadow Room labels in an open area, away from existing
   rooms. Select Forest → **Define explicit area**. **Paint region**, **Erase
   region** and **Rectangle region** stage a complete cell replacement and
   commit on release. Paint distinct cells for each label and compare the entire
   floor, walls, props, bindings and scope before/after: none change. **Clear
   explicit area** keeps `{ kind: 'explicit', cells: [] }` with an unresolved
   empty-area explanation; it does not revert to automatic or delete intent.
   JSON/YAML and reload retain that empty definition.
6. Paint an overlapping cell, or create a second Room label in the same
   enclosure. All affected conflicts must be visible without priority or
   membership transfer. Undo restores the previous definitions. **Delete region
   and label** removes only the linked pair; Undo restores both identities.
   Ordinary notes retain **Delete label**. Raw linked-label deletion is refused.
7. Start a region stroke and cancel with Escape, change selection or switch
   views before release. A late release must not commit to a retired target.
   Paint identical membership twice: only the first change writes. Interleave
   a floor edit and a real 3D prop edit, then return to Layout and traverse
   Undo/Redo. Navigation is not history; unresolved metadata is persistable,
   but invalid existing policy still fails its operation's normal strict gate.
8. In fresh contexts compare otherwise identical attached-door initial open and
   closed states. All wall spans, including openings, remain logical boundaries.
   Studio introduces no new doorway-state control; canonical disposable
   seeding is the state variation, not a fake control or gameplay sight test.
9. Inspect desktop and narrow screenshots, label/status legibility, keyboard
   focus, scroll-to-Apply and actual canvas area. Expanded Arrange may cover
   the scene tree or canvas; collapse it to pick behind it. Explicit-area
   controls can also cover cells: pan the view or collapse Arrange before
   painting underneath. On narrow screens use the horizontally scrolling
   toolbar and collapse Arrange to regain canvas space. Do not count covered
   cells as exercised by clicks intercepted by a panel or label.
10. Reload and compare complete scene3 JSON → YAML → JSON payloads and room
    snapshots (draft only). Preserve old notes, all optional-field presence,
    groups/supports/visual lights and scope. Inspect the native loaded 3D scene
    separately; authoring boundaries are Layout-only, not a new 3D overlay.

### Conservative geometry boundary

Exact shared endpoints, certified axis-aligned T contacts and certified proper
crossings may resolve simple, bounded single-ring faces. Moving the same oriented
source walk follows without rewriting it. Source direction/order matter:
reversing endpoints can require explicit rebind even when the undirected line
looks unchanged. There is no epsilon welding, inferred gap closure, render-time
witness acquisition or cached valid-looking stale ring.

Holes, dangling interior slits, positive-length source overlaps/coincident walls,
uncertified angled T/collinear contacts, uncertain multiway intersections or
intersection ordering remain visibly unresolved. Conflicts never select a winner.
Explicit cells use canonical membership; adjacent cells are not overlap. Explicit
boundaries show cell outlines including interior seams, not a simplified contour.
See the [region contract](../../src/concepts/world-building/CONTRACT.md) and
[geometry design](../architecture/components/encounter-studio-regions/design.md).

## Region background lighting procedure

Use `createRegionLightingDocument()` in
`src/concepts/encounter-studio/fixtures/regionLighting.ts` for the complete synthetic
two-room/native-prop/torch/attached-door/all-scope seed. The configured variant
uses15%/80%; `createUnresolvedRegionLightingDocument()` retains configured gap,
unbound and empty-explicit intent. `createSparseRegionLightingDocument()` provides
128×128 bounds with240 separated configured areas. These helpers are test authority,
not operator documents or default starter content.

1. Enter **Home → Encounter Studio**, select a linked label through Layout, and
   inspect **Background light (%)**. Absence is blank with a100 placeholder and
   **Baseline · no region light authored**, not prefilled100. Plain notes expose
   neither lighting field nor reset. Apply without typing and unrelated rename
   must preserve absence/version; deliberately entering100 authors1. Repeating
   an equal authored value or resetting absence must preserve bytes/history.
2. Type15 without Apply: document/viewport must stay committed. Join rename,
   move and15 with Enter: one Undo restores the entire payload. Try101, blank or
   nonnumeric late tokens: refuse the whole candidate and keep visible error/input.
   **Use baseline appearance** stages null until Apply. Cancel/Escape/collapse,
   view/target/epoch/document retirement discard linked-label staging; blur does
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
4. Inspect explicit Forest/Meadow unions with sparse gaps, no enclosing walls
   and no requirement to paint floor. Actual asset parts and floor follow the
   unions, not rectangular bounds. Gaps/outside and an unconfigured neighbor
   retain the legacy floor appearance. Placed point lights on lit assets can
   cross boundaries; Basic floor local response is configured-only, not occlusion.
5. Toggle the existing native torch **Light enabled** control off/on at15/50/80.
   Ray-certify each sampled pixel against the first real visible floor surface
   (underlay aroundY0.194, not hidden ground aroundY0.008). Keep historical
   occluded/wrong-height samples as failed evidence, not torch proof. Compare
   identical linear local input/term, not equal encoded screenshot deltas.
6. Shorten/remove the divider, cross a bound seed, overlap explicit cells and
   restore/Undo. Persisted lighting must survive with **Lighting saved · not
   applied until boundary resolves** and the reason. No stale or guessed field
   may remain. Initially unbound/empty definitions never silently acquire extent.
7. Interleave accepted lighting, floor and prop edits; navigate, Cancel, no-op,
   Undo/Redo and same-context reload. Compare full document/optional bytes, not
   counts alone. Actual new encoder JSON/YAML must preserve scene4, complete
   scope, walls/start/declarations/bindings; old2/3 no-field reloads never promote.
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
Web encoder sources: metadata-free baseline, scene4 configured resolved intent,
and scene4 unresolved/unbound/empty intent. Preserve structural walls, required
partyStart, all scope and gameplay keys; vary only presentation metadata for the
compiled-equality comparison. Validate the baseline too: a synthetic scenario
name or occupied start is a fixture refusal, not a scene4 result.

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
LayoutViewport, dimension/label/wall forms and gestures, floor/label/wall mutations,
pure snap/reshape/resize/rotation and region boundary helpers,
validators and real scene3 JSON/YAML/snapshot/composition parsers with injected
memory storage. Region checks include persisted true-gap repair, selection/history
retirement, authored empty definitions, no-op byte/write exactness and full payload
preservation. They retain the real WorldBuildingViewport but replace its **Canvas
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
