# World Building Concept contract

Issue: [KirkDiggler/rpg-dnd5e-web#935](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/935)  
Parent journey: [KirkDiggler/rpg-project#169](https://github.com/KirkDiggler/rpg-project/issues/169)

## Current Encounter Studio boundary (#1232, #1239, #1233, project#545)

Home offers **Encounter Studio** alongside World Builder under the same
current-world source availability and identity lifecycle. Studio mounts one
room-mode `WorldBuildingConcept`; its typed presentation facade projects the
existing document and commands, not a second store. Layout and the existing 3D
viewport may unmount independently without replacing the document owner.

Studio keeps two permanent chrome bands: document/name/save/view header and
editing/history toolbar. Header rename commits the trimmed canonical scene and
draft names together, preserving identity and site scope. Size opens staged
workspace dimensions; accepted Apply commits before dismissing the fields.
Cancel/Escape dismiss without content changes. Wall and Label contexts dismiss
without deleting committed content; their staged forms are not document state.

Layout offers Paint, Erase and Rectangle on canonical walkable cells, Select,
Wall, explicit Size and presentation-only map labels. A completed
stroke/rectangle or wall gesture is one bounds/size-checked whole-document history
transaction. The 3D view reuses prop placement, selection, Move/Rotate, repeat,
grouping, support, height and visual-light controls. Both views use the same draft **and complete
site scope**, shared Undo/Redo and persistence. View changes and Layout pan/zoom
create no history. Switching cancels unfinished gestures/transforms/drops and
preserves committed selection and Layout framing; hidden prop mutation shortcuts
are gated in Layout. Undo/Redo retain their existing selection-clearing behavior.
The 3D camera is not promised to survive renderer remounts.

Studio resumes World Builder's local draft under
`rpg.concepts.world-building.room-draft.v3` (`ROOM_DRAFT_STORAGE_KEY`), not a
Studio namespace or copied document. Despite the suffix, the current serialized
room envelope is **version 5** with draft version 3 and optional normalized scope.
Missing current bytes permit the existing legacy-key lookup then blank fallback;
present unreadable/unsupported current bytes are refused and preserved with
visible feedback and autosave blocked. Explicit **Replace unreadable local
draft** replaces those bytes. A failed write retains the latest in-memory
document and last successfully stored bytes. Reload restores content, not history.
The storage key remains origin-global, not world/session-namespaced.

Floor edits/history/reload preserve supported walls/openings/attached doors and
state, props/declarations/bindings, transforms/groups/supports/lights,
monsters/bindings/party start and all scope fields. Shape validation does not grade
gameplay legality. Source availability is not proof of remote write permission.
Studio exposes no publication, lobby launch, Save & Play, world-snapshot,
import/reset or policy-editing commands. Room-management/focus tools, discovery
simulation, new opening/door creation tools, asset markings and gameplay camera
presets are outside this slice. Map labels do not supply those capabilities.
Missing room-navigation controls do not imply unsupported multi-room gameplay.

See [the safe verification procedure](../../../docs/how-to/encounter-studio-verification.md)
for disposable-context interaction checks and the DOM tests' WebGL boundary.
The older sections below describe their own extensions or the standalone prop
composer; they do not narrow this current Studio boundary.

## Studio Layout walls and compact contexts (#1233)

Wall opens searchable repeatable appearance choices, ranking case-insensitive
wall name/ref matches first without inventing asset categories. Other eligible
repeatable choices remain accessible. Generated asset previews use published
provider PNG URLs, not a client model-capture queue. Loading is image-local;
missing/error images retain named selectable fallbacks without loading a GLB,
substituting an asset or deleting an authored wall. Eligibility remains the catalog's measured generated
assets without a door leaf role. No appearance is armed by default.

Wall stays armed for consecutive draws. Hex snapping starts off and targets hex
centres/corners/side midpoints. Wall-endpoint snapping starts on independently,
targets other walls' endpoints within12 CSS pixels, and takes priority over hex
snapping during drawing and endpoint reshaping. The control is labeled **Snap
corners**: a nearby perpendicular pair also previews both ends at their line
intersection, trimming/extending them together while preserving directions. Both
the pointer and the target end must be within the snap radius. A moved target end
already joined to a third wall, or protected by an opening, refuses the pair.
The guarded owner re-derives the second endpoint from its current snapshot and
commits both walls in one history/storage transaction. No sequential partial
commit or automatic region-witness rebinding occurs. It copies the target coordinates
exactly and marks an accepted preview as **Joined endpoint**. Equal-distance ties
use wall id/endpoint order, not input array order. Both settings remain editor-only
and survive context dismissal/view changes; changing either retires the gesture.
Whole-wall translation retains its existing free/hex-snap behavior. Both preview and release use the same pure
helpers. Dismiss hides settings without exiting drawing; Escape/right-click exits
Wall and cancels the unfinished gesture without clearing appearance or snap.

**Right angles** is an independent editor-only setting, initially off, shared by
Walls and selected-wall Arrange controls. It constrains drawing and endpoint
handles, not numeric fields or whole-wall translation. At gesture start, the
accepted drawing start or the fixed opposite endpoint chooses a reference from
other walls meeting that exact point. The gesture retains that reference. Free
starts use world X/Z; a joined wall supplies parallel/perpendicular axes. Compatible
incident directions share a deterministic basis; conflicting directions refuse
with a visible explanation rather than guessing or repairing existing walls.

Projection precedes snapping. Endpoint candidates and optional hex targets must
remain on the chosen axis; otherwise they cannot replace the constrained point.
Cardinal coordinates compare exactly; rotated-axis compatibility accounts only
for floating-point arithmetic roundoff, not a fixed geometric/angle tolerance.
Accepted endpoint snaps still copy the target coordinate exactly. Preview names
the basis/direction; opening clamp feedback takes precedence over any join claim.
Changing the setting retires pending gestures without a document/history write.
This editing aid does not enroll an asset for visual miter fitting.

Select picks a wall body for rigid translation or a selected Start/End handle for
direct reshape. Endpoint reshape reuses protected collinear resize; the opposite
endpoint stays exact, and unclamped edits retain the requested endpoint verbatim
rather than reconstructing it through trigonometry. Opening edges clamp drags;
the preview displays the applied endpoint on the requested ray, never a false
join to an unreachable target. Opening identities and attached doors are retained.

Arrange leads with full-precision Start X/Z and End X/Z fields. Midpoint lives in
collapsed **Position · whole wall** controls. Both endpoints can change in one
atomic transaction without an intermediate zero-length wall. Start-only changes
use the existing End-anchored opening offsets; otherwise local opening distances
remain Start-anchored. An explicitly unchanged end counts as fixed. Blocker end
margins follow the signed length delta; flags/depth/offsets stay authored. Numeric
endpoint edits that would clamp through an opening refuse instead of writing a
different endpoint. Endpoint coordinates cannot be combined with midpoint, length
or rotation in the same Apply; appearance changes may accompany them. Exact no-ops
retain geometry, optional absence, storage and history. This is an authoring snap,
not a region-detector tolerance: no loaded gaps are welded or walls straightened.
Numeric length remains collinear; existing whole-wall dragging remains available.
Selected endpoints have Start/End labels and hover X/Z values; Layout also shows
a Start→End direction arrow. Opposite headings such as0 and−180 can be parallel;
heading display never reverses authored wall identity or opening distances.
Appearance changes do not change the independent blocker. Neither renderer stores
derived spans or a second door pose; the existing 3D consumes the same canonical
walls and door bindings.

### Supported automatic visual corners

Only catalog appearances declaring `wall-miter-90` opt into the plain-wall fit.
The enrolled appearance is an explicit choice, not a silent replacement of older
Castle walls. Two shared authored endpoints, perpendicular directions, matching
authored height/thickness/elevation and solid terminal pieces longer than their
depth allow a common miter. Junctions, opening conflicts, unequal dimensions and
unsupported appearances retain unfitted art with a selected-wall explanation.
Snapping and rendering are separate: disabling snapping does not undo an existing
visual fit, and rendering never moves endpoints, blockers or region witnesses.

The shared asset leaf resolves `WallBody_v1` and all material primitives, plus
transformed Start/End/Front/Back/Top markers. Body planes determine the instance
fit and datum; the existing repeat count remains a distribution heuristic, not an
alternative body-plane authority. Shared0.75 conversion applies once. Parent
piece groups use unit scale for this path; the leaf applies the marker-based fit.
Only participating end positions change in cloned instance buffers. Remote-end
positions, cap materials/UVs and cached geometry/textures stay untouched. Side UVs
use their original chart gradients at physical fitted distances, with derived
per-wall Start-relative offsets continuous across pieces/openings. The fitter
uses each primitive material's declared texture channels, not an assumed UV0;
unused channels and cap UVs remain unchanged. Normals are recomputed and stale
tangent attributes are removed so Three derives the normal basis from the actual
normal-map UV channel (including the released masonry's UV2). No room-loop texture phase or material-selection
behavior is inferred. Owned buffers are disposed on replacement/unmount; unchanged
fit values preserve instance resources. Other props/actors/thumbnails use the
unchanged ordinary model path. Studio derives joins only from its supplied walls;
no gameplay visibility authority is introduced.

### Declared surface material consumption

The shared model leaf accepts transient, fully loaded `surfaceSelections` only
against provider `surfaces` declarations. Exact node/material bindings select all
matching exported primitives; miter tags do not imply enrollment. Absent choices
retain authored materials. Invalid bindings, incomplete map sets, incompatible
families or unsupported chart/basis inputs refuse rather than partially apply.
Legacy non-generated props cannot accept a surface selection.

The existing material-treatment owner applies the finish before memory/lighting
and restores overlays before restoring/disposal of the finish. StrictMode setup
reapplies from authored materials; suspended renders allocate no finish resources.
Only selected material clones are owned here. Role/channel-specific samplers share
immutable pixels, not mutable texture settings. Geometry mapping, room ownership,
selection persistence and resource loading remain caller concerns; this transient
seam does not declare a saved room-finish schema or Play delivery. See
[consumer verification](../../../docs/how-to/verify-world-material-candidates.md).

A provider update may carry aperture-fit doorway assets. The legacy complete-door
tool refuses `wall-opening` candidates until its separate anchor-aware consumer
is implemented; assembly bounds must not be offered as aperture dimensions.

Selected endpoint handles precede labels, then wall bodies, then empty-space
deselection; middle-button pan wins. Paint/Erase/Rectangle remain floor-owned.
Wall ignores existing wall/label hits; Label owns label gestures. Selection and
cosmetic reflow do not invalidate an active drag or create content edits. Preview,
unchanged release, zero-length drawing, cancellation, refusal and retired-epoch
release create no history. Accepted edits submit before settings dismissal, not
after canceling their own owner intent.

Remove deletes the owning wall/openings and attached-door bindings in one history
entry. Site concealment reference lists are independently authored policy and stay
unchanged, even when they name removed identities; server validation names
unresolved references before publication/play. Undo restores the owned identities
and bindings so those unchanged references resolve again. Unrelated bindings and
all other scope fields remain intact. An editable post-removal draft is not a
claim of publishability. Ordinary wall/name edits retain unfinished editable
policy; save/export still require complete codec validation.

## Selected-wall finishes and optional room defaults

A selected wall can choose one finish for both faces or separate choices for A
and B. A identifies the wall's `positive-z` face and B its `negative-z` face;
the map markers follow that source orientation, not camera-relative left/right. Both-side
editing is the default affordance; changing the control mode alone writes no
content. Choices stage beside the other Arrange fields and use the same atomic
Apply/Cancel transaction, with the same selection/document/epoch fences.

Scene7 optionally stores `wallFinishes` by structural wall ID, with independently
optional `positive-z` / `negative-z` material refs. This is presentation intent,
not a second wall model or new server wall grammar. Old scenes refuse the field;
absent faces inherit. Empty face records refuse; an empty map normalizes to
absence. Room validation refuses orphan wall IDs; explicit wall removal prunes
its overrides through existing reconciliation in the same Undo-able transaction.
Later edits never demote scene7. Unknown resource refs remain editable.

Explicit wall-face choice wins over a resolved region default, which wins over
authored appearance. Overrides cover the entire source wall face, including
standalone walls, internal stubs and unowned tails. Resolved region charts remain
in effect on their intervals; elsewhere U repeats from the wall's Start datum
(A forward, B reverse), with the common floor datum for V. No region or mapping
anchor is invented. Clearing a choice restores inheritance. Invalid explicit
intent suppresses that face's inherited finish and shows a named refusal, rather
than appearing successful with another material. Other faces remain independent.
Provider surface capability is still mandatory; this does not enroll new models.

### Optional room finish and shared pattern alignment

Scene6 permits a region's optional `wallFinish:{materialRef,patternStart}`. The
pattern start names incoming/outgoing oriented source wall runs, not label text,
a world point or a second polygon. Earlier scene versions refuse this field;
loading never upgrades, and clearing a finish or editing creature metadata never
demotes scene6. Unknown but shape-valid material/anchor refs stay editable.

First selection chooses one certified corner. Material changes preserve that
choice; moving a label never moves the chart. A missing/reversed/ambiguous corner,
unresolved boundary, incompatible wall or missing resource leaves intent intact
and names an unapplied finish in Regions and the viewport. Repair selects a
current offered corner explicitly. Painted areas do not infer wall ownership.

The geometry owner provides clipped, oriented wall-side spans. The mapping owner
measures the half-thickness-offset room-facing path, intersecting perpendicular
face lines and continuing compatible collinear runs. Collapsed/unsupported paths
refuse rather than guessing. Meter repeats convert once through the canonical
feet/scene adapter, not the asset scale. Fixed repeat size leaves one phase seam
at the chosen corner; openings consume distance without restarting the pattern.
U follows boundary distance and V decreases with height above the common floor
datum, paired with the verified no-tangent derivative normal adapter.

Derived visual pieces partition at side-ownership boundaries. Opposite faces and
different subintervals of one source wall can carry different finishes; wall IDs,
openings, mechanical blockers and corner fitting remain unchanged. Only enrolled
side UVs/materials change. Caps and door artwork retain authored appearance.
The existing document transaction/selection/epoch gates own finish changes, undo,
JSON/YAML and reload. Accepted no-ops add no history.

The normal material registry consumes committed, independently pinned material
resources and world surface declarations. Catalog absence is explicit and cannot
be filled by a miter tag, provider HEAD or a development fixture. Generated pins
and the scoped runtime mirror own delivery; Studio does not fetch asset policy
from the game API or author publication records.

Private candidate previews require explicit development opt-in and verified local
staging. Their resources live outside `public/` and are served by development-only
middleware, never a production build. Candidate geometry must match the pinned
GLB. A working preview is not appearance/scale acceptance or publication. These
settings are Studio-only; no permitted Play layout or proto delivery is implied.

## Centered workspaces and map annotations (#1239)

**Width (hexes)** and **Height (hexes)** stage integer counts in `1..128`.
**Apply dimensions** is one atomic resize; Cancel/Escape or navigation does not
commit. Growth adds capacity, never floor, content translation, scaling or
policy membership. A fresh draft retains the small legacy hex-radius workspace.
Untagged `{hexRadius, horizontalLimit}` documents remain legacy until explicit
Apply; the controls identify them as nonrectangular and do not invent dimensions.

The saved rectangle is `{kind:"centered-odd-r", widthHexes, heightHexes,
hexRadius, horizontalLimit}`. It contains exactly width × height cells (maximum
16384). Absolute odd-r coordinates use `row=r`, `col=q+floor(r/2)`, and
`q=col-floor(row/2)`. Columns range from `-floor(width/2)` through
`ceil(width/2)-1`; rows use the same rule. Even counts take the extra negative-side
cell. Odd rows, including negative odd rows, stagger +½ column. The original
axial/world origin stays fixed, not cosmetically recentered. Both views consume
one shared cell union, boundary and world AABB. The derived enclosing hex radius
and scalar horizontal limit remain saved for existing consumers, are checked on
read, and are not independent membership authorities or editable controls.

A shrink protects floor, actors/start, exit/concealment cells, prop/group anchors,
labels, authored prop footprints, wall line/thickness/blocker and derived
opening/door poses. Protected extent AABBs must fit wholly in the closed union
of workspace hex polygons; boundary contact is allowed. This conservative check
can refuse a rotated shape whose exact shape fits. A refusal names the offending
identity/path and leaves geometry, document, history and stored bytes intact.
Template-local arrangement declarations are not placed geometry. Pure loaded-mesh
overhang is permitted; private model bounds do not define eligibility.

**Label** offers named placement by pointer, keyboard at view center or exact
world X/Z, selection, drag, staged rename, coordinate move and delete. Apply/Enter
commits; Escape, capture loss, navigation or document/tool changes cancel previews
without history. Notes are plain text 2D annotations such as Kitchen/Courtyard,
not gameplay regions, floor ownership, blocking/discovery data, assets, support
relations or arrangement members. No 3D label renderer is promised. Label-only
edits leave workspace and gameplay policy unchanged. Linked Room labels and their
separate authoring boundary intent are described below.

`WorldScene.version` supports 1/2/3/4/5. Scene3 boundaries, scene4 lighting and
scene5 reusable creature palettes are described below. Version 2 optionally carries
`mapLabels:[{id,text,location:{x,z}}]`; label IDs are nonempty and unique within
labels, IDs/text are at most 120 characters, text is nonblank, locations are finite
continuous world points inside the workspace, and at most 256 labels are accepted.
Absent labels means none; deleting the last removes `mapLabels` without demoting
the scene. First Note or explicit rectangular resize on scene1 promotes the scene to 2,
even if the rectangle has no labels; scene3/4/5 are preserved. Version-1 scenes carrying label metadata
are refused. Older scene-1-only web readers refuse scene 2 rather than silently
strip dimensions/labels. JSON, room snapshots and YAML preserve supported authored
data, not YAML comments/formatting. Envelope versions, storage namespaces and
existing v3/v4 local-envelope refusals remain unchanged. Toolkit presentation
retains the opaque authored metadata; labels do not compile into gameplay policy.

Bounds validity, editable-draft size and completed persistence are distinct gates.
Ordinary edits preserve unfinished policy rows while checking existing shapes,
rectangular bounds and canonical serialized size before history insertion. Explicit
resize/label intents and save/export require complete codec validation. An editable
unfinished policy is not thereby persistable; no fact is invented or policy dropped.
Storage quota failure remains a visible save failure, not a successful persistence
claim. The unchanged 500000-character envelope budget includes the complete scope.
Workspace capacity is **not** fully paintable maximum capacity: the populated
73 × 48 / 3504-cell castle fits, but fully painting 128 × 128 exceeds this budget
and is refused before history/storage. A sparse 128 × 128 document fits. These
bounds do not promise browser latency or performance acceptance.

## Studio authoring region boundary (#1245)

**Label kind** explicitly chooses **Note · text only** or **Room · linked boundary**.
Old notes remain unchanged and are never inferred as rooms. Room placement creates
one label/region pair in scene3. `MapLabel` alone owns name/anchor; the linked
`AuthoringRegion` owns automatic oriented source-walk intent or explicit cells.
Scene1/2 reads do not upgrade, materialize empty metadata or strip unknown keys.
Existing scene3 label/resize edits do not downgrade. Empty region collections are
omitted without demotion; authored empty explicit areas retain their intent.

Layout draws only current resolved areas. Linked labels remain selectable through
the existing Arrange arbiter, with automatic/explicit mode, unresolved warning and
reason. Full wall spans, including openings/doors in every state, are logical
boundaries. Supported unambiguous wall motion follows the accepted oriented walk;
breaks, seed moves outside it, duplicates/conflicts and unsupported or uncertain
geometry remain unresolved, with no valid-looking stale polygon or conflict winner.
Only explicit create/bind acquires a witness. Closing an initially unbound room
still requires **Use enclosing walls**. Repairing a known bound walk may resolve
without a metadata write. Missing source references remain persisted intent.

Exact axis-collinear overlap is handled as continuous geometric coverage with
transient source provenance, never endpoint welding or source mutation. An
overlapping maximal straight face boundary run requires exactly one authored
source covering its entire span; partial exterior extensions do not replace that
owner. Multiple full-span owners or no full-span owner remain unresolved, without
an ID/order/length preference. Raw simple-face validation precedes compression;
non-overlapping source transitions retain their junctions. A true uncovered
interval remains open at any representable size. Non-axis collinearity,
uncertified intersections, holes and interior slits remain conservatively refused.

**Use enclosing walls**, **Define explicit area**, and **Delete region and label**
are explicit repair commands. Raw linked-label deletion refuses. Paint/Erase/
Rectangle region controls stage membership locally and submit one complete area
replacement on release, never floor mutators. Paint/Rectangle add cells to an
existing explicit area; Erase removes them. Starting from automatic intent starts
an empty explicit membership set; no floor membership or inferred polygon is
adopted. **Clear explicit area** retains the pair with unresolved empty intent.
No hidden cell transfers, floor/prop deletion, binding or scope changes occur.
Escape, capture loss, view/document/epoch/mode/target retirement cancel previews
without writes. 3D round trips preserve definitions/selection but retire region
painting. There is no 3D boundary overlay, audio control or gameplay visibility
authority.

Linked-label Arrange stages **Background light (%)** (0..100) and **Use baseline
appearance** in the same dirty-only label-edit as rename/move. An unset input is
blank with a100 placeholder and **Baseline · no region light authored**; untouched
fields do not enter the patch. Explicit100 authors `{background:1}`, distinct from
absence: it opts the configured floor into the placed-light receiver. Reset stages
null until Apply. Equal authored values and reset-absent are noops. Apply/Enter is
one transaction; invalid tokens refuse the whole form. Cancel/Escape and
view/target/epoch/document retirement discard linked-label staging without writes.
Sidebar collapse and section navigation preserve staging; blur never submits. Ordinary notes expose no region fields. Configured unresolved
labels show **Lighting saved · not applied until boundary resolves**, alongside the
boundary reason.

Only an actual lighting set opts into scene4. Its optional exact
`lighting:{background:number}` is finite0..1; no defaults, derived polygons or
source settings are persisted. Load never promotes and reset never demotes.
Lighting alone with text/location absent uses the ordinary document gate;
explicit label tokens, including equal values, retain strict complete-policy
validation. Save/export remain strict.

Studio3D consumes only configured, currently resolved projection. Actual floor,
prop, wall, attached-door and cap fragments sample world-XZ rather than object
centres. Background scales directional/indirect illumination, not placed point
lights or emissive terms. The textured Basic workspace floor adds local response
only inside configured resolved regions; outside/unconfigured floor stays legacy.
Unresolved/conflicting definitions retain settings with no stale applied extent.
There is one per-instance material-treatment owner; cached geometry/maps and
Play/thumbnail/actor/guide materials stay unchanged. Unsupported materials or
field/shader failures visibly explain unapplied lighting; fallback is not proof
of required native-surface support. This is editor appearance, not occlusion,
physical transport, gameplay lighting, sight or darkvision.

The one document/history owner enforces strict pair-creation and ordinary
boundary-definition gates. Unresolved alone is valid metadata; it does not relax
existing invalid-policy gates. Accepted no-ops do not add history/storage writes.
The source map and conservative geometric refusals live in the
[region walkthrough](../../../docs/architecture/components/encounter-studio-regions/README.md).
Provider carriage/export acceptance requires a separate actual-pin probe; this
contract makes no provider readiness claim.

### Certified wall-side projection

`projectRegionWallBoundaries` derives wall-side provenance from the same certified
graph and conflict checks as region resolution. Source runs stay aligned with
compressed/rotated face nodes; the independently rotated witness and ring are
never zipped. Oriented spans keep the room on their left, exposing the source
wall's positive-Z or negative-Z side and clipped low/high source distances in
scene units. These are centerline facts, not fitted-face UV distances or material
bindings. Partial exterior coverage is not a second owner of a certified run.

Only resolved wall-enclosed regions yield wall-side spans. A painted region can
remain a resolved area while its wall-side projection reports `not-wall-bound`;
there is no nearest-label/cell ownership inference. Returned points/runs are
copies and projection does not rebind regions or change documents.

Transient pattern-corner references name incoming/outgoing oriented source runs,
not label text, world position or array indices. Initial default selection chooses
a certified geometric turn; flat source transitions are not corners. Resolving an
existing reference never chooses a replacement after missing/ambiguous provenance.
These internal projection types do not introduce persisted finish/anchor fields or
settle material resource, mapping or Play-delivery contracts.

## Structural-wall authoring (#527 in rpg-project)

The room document optionally carries `room.walls`. Each wall owns a stable id,
label, continuous start/end line, openings, appearance and an independent blocking
rectangle. It is not a collection of repeated prop instances. The appearance
names a catalog asset, height, thickness and elevation; the blocker keeps width,
depth, both local offsets and independent movement/LOS flags. Blocker coordinates
are relative to the wall midpoint, with local +X along the line and +Z its
perpendicular in the XZ plane. The per-prop 12-unit clamp does not truncate walls.

Openings have stable identities, local center distances and widths. A doorless
opening carries no state; an opening's optional attached door is documented in
**Attached-door editor** below. Existing placed doors are unchanged.
No stored/generated spans or second door pose are introduced. Import refuses
unsupported fields instead of silently dropping them.

Walls use the existing JSON save/reload and YAML encode/decode paths. Empty walls
normalize to absence; documents without walls retain their previous output.
Documents with walls emit root v4 and embedded room draft v3. Floor walkability,
scene items and existing declarations are unaffected.

This is an authoring extension, not a claim of playable support. The shared
concept draws walls, edits dimensions and openings, attaches doors, previews
starting state and selects explicit concealment members. Toolkit owns gameplay
and the existing room-revealed delivery; this slice does not replace them.
Floor surfaces and a Publish & Play proof are not delivered by this extension.
No protocol change is implied by the YAML shape.

## Discovery lifecycle

Discoveries and attempt history belong to the encounter. A new playthrough starts
fresh; reload/rejoin of that encounter preserves its state. The character sharing
preference may persist, but must not restore learned secrets into another run.
The attempt editor therefore offers count and retry distance, not cross-run memory.
Legacy `attempts.lifetime` values still round-trip on import; editing a policy emits
`run`. They do not override the game's fresh-encounter boundary.

## Structural wall editor

The room/site tool strip gains a `Wall` tool, available only when a repeatable
generated catalog asset with measured dimensions and no door leaf role is
selected. A wall drag previews on the finite ground and commits exactly one
line on release; zero length is a no-op. Escape, right-click, pointer cancel,
lost capture, a tool change and unmount all cancel without history, and a
middle-button camera motion never draws. Both the preview and the commit use one
pure snap helper over the existing `hexMath` centres, corners and side
midpoints; snapping is optional and its setting is explicit. A final line whose
endpoints leave the authoring workspace is refused with a visible message and
no data loss.

Walls have their own selection, distinct from scene prop ids. The wall panel
lists and selects walls and edits label, appearance, exact length, whole-wall
translation/rotation, the independent blocker rectangle/flags and doorless
openings. Every Apply is one undoable room-history transaction — the same
validated `commit`, save and reload path the rest of the room uses, refused
while a Save & Play transaction holds the publishing lock. An appearance change
never alters blocker data; an exact-length resize preserves the doorway's world
position, stops at the closest opening edge, and preserves the blocker's end
margins by changing its width by the same signed delta, refusing a nonpositive
result. A whole-wall move or rotation carries its openings and local blocker
offsets as one structure. Opening add/edit/remove require explicit values and
refuse overlap, out-of-extent or duplicate identities without modifying the
draft.

Visible spans are cut from the authored openings and filled by repeating the
selected asset through the shared `WorldPropModel` leaf; the derived pieces are
presentation, never scene props. The repeat count divides the span by the
asset's catalog width, which already includes the shared runtime scale, and the
parent transform owns the span pose and the full exact fit scale — including
authored heights outside the shared model's own prop clamp. The shared model's
single floor lift is applied exactly once at the authored elevation and is
never scaled by that fit. Loading, error and refusal markers are explicit,
named, non-raycasting, and anchored at the wall or piece they describe rather
than the world origin; a derivation past the explicit piece cap, or a wall whose
appearance asset is missing or not repeatable, renders such a marker instead of
allocating unboundedly or dressing itself up as the selected asset. Derived
meshes stay non-raycasting as the wall list, asset, loading and error state
change. The selected authored blocker is an editor-only wireframe guide, not a
sight calculation, and no wall mesh raycasts for paint, erase, actor,
concealment or wall-drawing gestures.

In Add members mode, dedicated guides pick solid wall spans or attached door
openings by their distinct source ids. Picking a wall never implicitly picks its
door, floor cells or overlapping props. Membership uses the existing
`concealments.<id>.props` list and the same undo/save path. These guides do not
intercept other floor-owned tools; the underlying asset meshes stay non-raycasting.

## Attached-door editor

A wall opening may carry one optional `door: { id, assetRef }`. The opening OWNS
the door's single pose: there is no stored transform and no `scene.items` entry.
The bound door's state lives ONLY at the existing `room.doorBindings[id]` with
its unchanged grammar (`{}` is open, `{closed:true}`, `{locked:[...]}`); a present
door requires a binding, and absence is a bare opening — never a hidden or open
door. Door ids are unique across walls, openings, scene items and other doors,
and the asset must be a known catalog entry whose generated model declares a
`leaf`. Existing standalone prop doors and their state are untouched; no
attachment-to-standalone conversion or automatic migration is offered.

Attach mints one id and one closed binding; swap retains id and state. Removing
the attachment clears its state while keeping the gap. Deleting an
owning opening or wall removes its doors and bindings in the same history entry,
and unrelated scene edits cannot delete a bound door's state. Undo, redo and
reload restore identity, state and attachment together. Every mutation is one
undoable room commit behind the publishing lock; a refused edit preserves the
document and leaves its refusal notice visible.

The editor previews the authored INITIAL state at the shared leaf (explicitly
NOT a live gameplay `OpenDoor`), fits the full existing door assembly to the
opening width and the wall's authored height/thickness with the same
structural-parent scale and single unscaled floor lift used by wall pieces, and
names a missing asset at the opening. Catalog dimensions already include the
shared runtime scale; fitting must not apply that scale a second time. Door
meshes never raycast, so floor tools are unaffected. The fit targets the full
assembly's outer bounds, not a separately declared clear aperture. Existing
assets may retain bundled masonry or different reverse-face trim; asset cleanup
must not alter authored openings or blockers. This slice does not change session
rendering or toolkit-owned reveal/visibility behavior.

## Current room-mode promotion (#1112)

Room mode now supports complete RoomDraft v3 with optional party start and stable
monster placements, separate from visual scene items. Actor markers snap to the
shared hex grid; scenery retains its free poses, groups, supports, lights and
height. Structural validation does not decide gameplay legality. Canonical YAML
v3 carries the full inline room plus its root dungeon key; room snapshots use
wrapper v2. Local v2/v1 and snapshot v1 upgrade explicitly without deleting old
bytes; invalid current v3 never falls back or autosaves over itself.

The main World Builder route injects server validation/save and the selected
character's existing lobby Play flow. Prop-only/local concept mounts do not make
those RPCs. Save/launch freezes document mutation and is fenced by the exact
source/key/room/character/client identity. Existing-key overwrite is explicit;
errors retain work. Runtime rendering uses the same visual leaves through the
canonical member-atlas presentation, without editor guides or duplicate legacy
proxies; the session remains the authority for actors, visibility and rules.

This room-mode addition supersedes the historical **room/gameplay limitations**
below, not the standalone composition interaction or ownership contract. See
`docs/how-to/world-builder-play-verification.md` for current proof and limits.

## NPC appearance selection

A placed monster may carry optional `appearanceRef` beside its existing rules
`ref` and starting cell. Studio Arrange stages this choice with the actor's other
dirty fields and commits one owner transaction. Clearing it deletes only the
optional key; identity, rules/template, faction and position are unchanged unless
explicitly edited in that same transaction. Appearance, Style and Skin palette
controls resolve one complete look ref through provider-declared family metadata;
no filename/ref suffix is parsed to infer a choice and no additional palette
fields persist on the actor. Family changes retain a combination only when the
new family explicitly supplies it, otherwise they use its declared default.
Single-look/unknown families have no editable style/skin controls. Valid unknown
imported refs remain editable and round-trip through local JSON and authored YAML.

Authoring preview resolves explicit appearances through the pinned NPC catalog.
Play resolves `PublicMemberInfo.appearance_ref`, as captured for that observer,
never the private editor document or current unseen member data. A missing/empty
override retains existing rules-based model resolution. A nonempty unknown or
failed asset displays an unavailable-appearance diagnostic instead of silently
substituting another body. Both paths reuse ClassCharacterModel and the existing
standing/downed/animation lifecycle. Appearance selection does not define stats,
faction or weapon fits. Palette variants are provider-published full looks, not
runtime material mutations.

## Concealment authoring

`Concealments` is a site-level inspector section. Each named declaration owns
its search checks, optional notice rows, cell membership and prop membership.
The check-row control is shared with doors. Imported ability and prop references
remain visible; the engine grades references, walkability and overlapping claims
through the publish panel rather than the editor inventing rules.

`Add members` activates canvas picking for one concealment. Clicking an authored
walkable hex, door or prop adds that member; repeated clicks do not toggle or
duplicate it. Empty workspace is not a floor member. Picking does not change the
walkable floor, ordinary selection, groups, transforms or door state. A picked
prop without a placement declaration gets the same measured, nonblocking shape
seed as a new door; existing declarations remain untouched.

Purple marks membership; gold marks the active declaration. `Done`, Escape, or
switching canvas tools exits picking. The panel lists only current members with
explicit removal buttons, not a checkbox inventory of the scene. Each addition
or removal is one undoable transaction. Removing the final declaration omits
the root key.
Intel can name a concealment through a picker; renaming a declaration does not
silently rewrite intel references.

Local draft persistence examines the normalized scope, not a separate inventory
of its keys. A document containing only concealments must survive save/reload
just as one containing factions does.

In play, authored content supplies prop appearance while the observer atlas
supplies floor, wall segments and placed-prop presence. The full workspace floor
is editor-only; hidden placed props contribute neither meshes nor point lights.
The editor's standalone unaware-observer preview is not yet implemented.
Placed-prop doors also require an upstream visible masking segment to appear as
a fitted, continuous wall before discovery; hiding the prop and blocking its
footprint alone does not supply that picture. This editor does not invent a
replacement asset or infer wall segments.

## Wide, tuck-away configuration inspector (#1204)

Room/site mode keeps a persistent navigation strip for root sections and the
current Selection. Opening a section expands the inspector and brings its existing
panel into view. The expanded inspector has a comfortable 640px maximum after
Kirk's table-editing walk; the collapsed navigation stays narrow. Readability
comes from the entry layout rather than stretching every input with the window. Selecting a different canvas object opens
Selection; edits or re-renders of the same selection do not force a collapsed
inspector open. Tucking it away preserves selection, unsaved inputs, and panel
state because the controls remain mounted. On narrower screens configuration
stacks below the canvas; prop-composition mode retains its existing layout.

Answer entries read in condition → action → target order. Deed conditions name
“within N rounds” explicitly and keep the existing perspective control. Action
labels use imperative wording from the shared vocabulary. Optional dialogue,
numeric weight, and removal are secondary; weight is relative chance among
eligible entries, not execution priority. The entry order and YAML meaning are
unchanged. No future action constraints are invented. Creature faction is a select of declared site factions plus
“Kind’s default”; an undeclared imported reference remains visible as
“(not declared)” until the author changes it. The server still judges references.

## Social definitions and selected bindings

Encounter exposes Intel, Factions and Dispositions alongside Tables. The existing
site forms write the canonical scope through guarded ordinary owner transactions;
they do not add a policy store or evaluate runtime graph state. Intel names and
faction names are applied deliberately without rewriting references. Fact ids in
reveal targets and predicates are distinct from the record ids in holds. Faction
minds reference placed individuals, not creature-palette recipes. Reserved sides
remain available to disposition authoring without requiring a custom faction.

Arrange exposes CreatureOrders for one selected actor and PropOrders for one
eligible selected prop, with navigation back to Encounter definitions. Authored
disposition context is labelled as authored, not as the current effective stance.
Unassigned creatures keep their kind default; the editor never writes a default
faction binding merely to display one. Held-record readouts include both creature
and prop holders. Prop orders require the existing explicit footprint declaration
and non-door eligibility; attaching intel does not invent a footprint. Multi/group
selection never picks one prop on the author's behalf.

Scope callbacks retire with their document/intent context; selected binding and
footprint callbacks additionally retire with selection. Normalization, optional
absence, one shared Undo/Redo history and strict complete-save validation remain
owned by the existing helpers and codecs. Incomplete policy drafts remain editable;
no client-side stance fold or knowledge propagation is introduced.

## Authored stat-block carriage

Encounter exposes Creatures, Stat blocks and Tables. Scene5 optionally carries
`creaturePalette`: editor recipes with exact id, name, ref and modelRef fields.
The name labels the reusable editor recipe; ref names an existing rulebook monster
or root template, and modelRef names a declared appearance family. Recipes carry
no scores, coordinates, factions or skin overrides and never instantiate actors.
They round-trip with the editor's scene metadata without adding gameplay grammar;
runtime knowledge never resolves actor appearance or names from this palette.

Encounter creates/configures recipes; it does not place them. Build/3D exposes
Monsters & NPCs beside Props, reading the same saved palette. Choose one published
look/skin ref there and arm the existing monster placement tool. One map click
creates a fresh actor with copied ref and appearanceRef. The list remains visible
and keeps the chosen variation for another placement. Changing the recipe, look,
palette tab or view cancels the armed intent; cancellation creates nothing. Every placement has
its own complete appearanceRef; recipe edits affect future placements only.
Unknown imported model refs remain literal and placement refuses until resolved.
Label, region, lighting and resize edits retain scene5 and its palette.

Scene5 optionally carries `actorNames`, a placement-id to authoring-label map.
New recipe placements snapshot their name in the same transaction. Marker labels,
hover previews and Arrange use that name without changing the rules ref or enriching
runtime knowledge. Older instances keep their rules-based label until explicitly
named with Map name; the editor does not guess their recipe. Removing a creature
removes its label. Move creature arms the existing one-shot destination-hex action,
with snapped hover feedback and explicit cancellation; names and other bindings
remain unchanged.

Roster selection alone never moves an actor. Existing instances reuse Arrange's
staged single appearanceRef transaction; definition edits retain appearance,
identity, location and bindings. Named stat blocks are shared by reference, never
copied into instances. Their form applies only edited fields, keeps ids stable
and preserves untouched optional values. Cancellation and document/intent retirement
discard staged inputs. All commits use the same WorldBuildingConcept document,
ordinary policy-preserving gate and history.

The site scope carries root `templates` through the same SCOPE_KEYS, history,
JSON and YAML boundaries as tables and policies. Nonempty templates require the
existing root dialect4; embedded room/scene/envelope versions do not change.
Template ids are single reference segments, placed as `dnd5e:monsters:<id>`.
Monster declarations and templates use the shared reference parser rather than
separate naming grammars. Unknown but well-formed content refs remain intact.

The authored shape mirrors encounter TemplateSpec: required base, optional name,
partial ability scores, hitDice, armor, proficiency, skills, actions and experience.
Explicit empty overrides/zeros remain as written where the shape allows them;
absent fields are not filled from a client copy of the rulebook. HP, AC, attack bonuses
and passives are not authored totals; the internal rulebook speed field is not
part of this authored dialect. Base resolution,
rulebook shadowing and derivation remain engine-owned. Local template inheritance
is refused by the declared grammar. Whole-source import never strips a template
to bypass a refusal; unsupported play contracts and unavailable scene appearances
remain named failures rather than rewritten source.

The active site disposition reader accepts `until` for hostile or neutral, as in
the released both-ways grammar. Allied still refuses it. A neutral alarm condition
must not be dropped to make a stat-block encounter editable.

## Monster declarations and bindings (#1202)

The current single-room authoring shape uses `room.room.monsterDeclarations`
for identity (`id`, `ref`) and `startingCell`. Membership belongs in
`room.room.monsterBindings[id].faction`, alongside table references and overrides.
A faction-only binding is valid; clearing the last authored binding omits it.
The faction control and actor placement interactions are unchanged.

Import/export and editor state use this shape directly, matching toolkit
`encounter/v0.107.0` and API dev. Old `monsters` keys and declaration-level
`faction` are rejected with migration guidance, not silently converted. This
also applies to current local drafts: old bytes are preserved on refusal.
There is no v5 document or schema alias, and no automatic rewrite of saved
compositions. Server error paths are displayed verbatim by the publish panel.
The engine example is pinned to toolkit merge `6cbee563`.

## Studio authoring homes and options (#1256)

Build, Regions and Encounter are authoring homes, independent of the Layout/3D
map view. Document identity, saving and history remain shared. Build starts in
Select and offers Paint, Erase, Rectangle and Size in Layout. Its right-hand
options contain Arrange, Walls, Doors and Notes. Regions owns the region list,
room-label creation and the existing linked-label boundary/background-light form.
Encounter gives Tables a full configuration workspace, not a map options tab.
Future configuration sections are not represented by enabled placeholder controls.

There is one spatial options slot. Only one section is visible. The Options
button and unmodified N toggle it without remounting the canvas or changing the
active section, tool, selection, document or history. N does not intercept
editable controls, composition, repeated keys or modified shortcuts; it does not
open map options in Encounter. The inactive map stays mounted but hidden and
inert while Encounter is shown. Home changes retire map gestures through the
owner epoch and return Build to Select; hidden map mutation shortcuts and 3D
callbacks are fenced. Undo/Redo remain document actions. Regions3D is inspection,
with existing lighting edits available; placement and boundary painting use Layout.

Sections stay mounted when hidden. Local form drafts survive section changes and
collapse; a canonical document/selection/intent replacement still retires Arrange
staging. Selection changes update Arrange without forcing a different section or
reopening the sidebar. Wall drawing remains a Layout tool; showing its options
alone does not arm drawing. Pickers retain published static PNGs; no model-capture
queue or thumbnail-demand mechanism is introduced.

Tables edit the encounter's root declarations independently of map selection.
The existing TablesPanel, entry grammar and vocabulary are shared, not copied.
Studio table names commit only on explicit Apply/Enter; Cancel/Escape discards the
name token. Entry fields keep their existing document-edit semantics. Multiple
entries may be authored on each trigger. Section or home navigation never submits
a name; table-name drafts remain mounted across homes.

`EncounterStudioSession.commitTables` accepts only `SiteScope.tables`, preserving
all other scope, geometry and bindings through the existing guarded document
transaction. Absence omits the key; equal writes add no history. Retired callbacks
refuse. Undo/Redo, draft storage and strict completed save/export share the one
owner. Renaming/removing tables does not rewrite references or compute behavior.

## Shared answer tables at the root (#1201)

**A table is declared once and NAMED, not pasted.** `tables` at the site root
holds a creature's answer table under an id; a faction or a creature names that
id and the engine layers it under their own `on:`. The reference field already
existed on both (`SiteFaction.table`, `RoomMonsterBinding.table`); #1201 adds the
panel that authors the declaration and the controls that name it.

The reason is a hazard, not tidiness. `time:` **replaces the kind's whole default
table**, so authoring one entry on one creature silently discarded everything its
kind carried — this bit the project three times, once losing `enemy: seen →
toward` so a goblin stood still in a fight it should have walked into. A named
table is total by construction: declared once, seen whole, referenced. There is
no invisible partial edit left to lose a default in.

**A creature no longer authors an inline table.** Kirk's ruling: _"there should
be no inline table defined on a monster anymore."_ The creature's editor is
removed. `on:` is **still read and still round-trips** — a hand-written file with
one opens and shows it read-only, and the engine still reads it as a base for a
named table to lay over. Refusing it here would make an editable file
unopenable while the server accepts it: `holds`' and `arrives'` **carried, not
offered** law (#1176).

**The builder mirrors the grammar and never resolves a name.** Renaming or
removing a table rewrites the declaration and nothing else; a faction's or a
creature's `table:` keeps the old id, and a name that resolves to nothing is the
**engine's** refusal, by name and with the fix (`bindingTable`/`factionTable`).
A hand-written name this site does not declare keeps its own option in the
picker rather than being silently rewritten. Semantic authority is the server's.

The entry editor inside a table is the **one** `AnswerEntryRow` a faction's
table already used, over the one vocabulary declaration — so a root table keeps
the `at:` cell selector, which is refused only on a placement.

## Destinations — the site is the document (#1152, corrected model)

The World Builder route has **two** destinations: **Site** and **Prop
compositions**. The four-destination list was the wrong shape: the design's
§UI surfaces bullets are _sections_, not peers, and `The site` and `Library`
were the same thing twice.

**The site is the document.** Top level of the YAML; one contiguous floor at
absolute positions; one identity; one revision history. `ROOT_KEYS` is
`['version', 'key', 'play', 'room']` — `room` singular, which only makes sense
if the document is the site and a room is a region of it. Rooms are **camera
targets**, not scopes: a room has no coordinate space of its own. The site's
nouns persist across rooms.

`Site` is `roomMode` and renders:

- **Header** — `Back` · the site name · `Identity`. Nothing else. A `role="status"`
  line below the header is the only other chrome, and only when the draft is
  not being autosaved (a world snapshot is open, or stored bytes are
  unreadable).
- **Left, two collapsible sections** — `Rooms`, a navigation list (one entry
  today, because the root has `room` singular; the jump waits on `rooms[]`), and
  `Props`, the asset palette **and** the scene
  tree in ONE section (adding a prop and finding a placed prop are the same
  noun). The tree groups items under their group with loose props after, keeps
  `parentId` (↳) and `supportId` (· attached), removes the checkboxes (a row
  click selects, Shift/Ctrl/Cmd extends), and is collapsed by default.
- **Center** — the canvas and its tool strip, unchanged, including
  `Expand workspace`.
- **Right, collapsible site nouns** — `Monsters` (placement, party start, the
  placed-creature list with Move/Remove, and for the selected creature its
  faction, weapons (`actions`) and the **named root table it answers with**
  (`TableNameSelect`; see the tables section above for why the inline `on:`
  editor is gone), which are named placeholders until those v4 shapes land),
  `Doors` (`doorBindings`
  editable per placed item, whose own state decides what it blocks — see the
  doors section below) and `Policies`
  (editable factions — add/remove; `id`, `mind`, **the root table it names**, and
  `temper` as absent, one
  word, or a word→share mix — editable dispositions — add/remove; `between`,
  `stance`, `until` — and each faction's shared `on:` table, per trigger, with
  weighted `say`/one-word entries; the inherited-vs-overridden readout for a
  selected creature is design slice 2), plus `Intel` and **`Tables`** (the site's
  shared answer tables: add/remove/rename a declaration and edit its triggers and
  entries). An `Edit` collapsible holds Undo/Redo.
  **Selection declarations stay contextual** — they appear only while props are
  selected, because they belong to a selection and not to the site.

**The Identity panel** is opened from the header and overlays the canvas. It is
the merge of the old `The site` and `Library` destinations, and nothing from
the old Library is dropped: the editable site name, the local draft
`Save`/`Reload`/`New`, the **revision history** (the world-snapshot save verb
and the saved snapshot list with open), `Publish & Play`
(`RoomPublishingPanel`), and the arrangement library and portable JSON. Its
`Save`/`Reload`/`New` and publish verbs are refused while a publishing
transaction runs, and the route keeps its `publishingBusy` nav lock.

**The site scope persists with the draft** (#1160). All supported scope fields
are editor state carried in the room document's history entry and beside the
`draft` in the current **v5** local envelope under `ROOM_DRAFT_STORAGE_KEY`.
Empty normalized scope is omitted. Authoring is therefore not lost on reload,
and a reloaded room publishes the document it was saved as. **Semantic checks are the
SERVER's**: the `Publish & Play` `validate_only` preview (with a deliberate
`Validate with server` verb) surfaces the engine's path-addressed refusals
verbatim. The client's strict-shape layer refuses only what it cannot
represent — an unknown trigger or word, a share below 1, a `until` on a
non-hostile pair, a `party` declaration — and it runs on the way OUT, so a
renamed or removed faction may leave a reference the engine names rather than
the form pre-judging it.

**Prop compositions** is deferred this wave and unchanged: its own editor, its
own chrome, its own panel libraries. `worldLibrarySection`,
`arrangementLibrarySection` and `portableJsonDetails` are not part of the
Site's build body; the composer keeps its copies.

**Test that it is navigation and not a scope change:** jumping rooms must leave
the right-hand site nouns unchanged. If a room click changes what policy is
shown, the tab was rebuilt.

The placement anchor and the composition-bounds guide remain the **composer's**
vocabulary: while a site is being built, neither the legend, the
`Show composition bounds` control, nor the meshes are rendered (design
`ideas/site-authoring/design.md` §UI surfaces, violation 3).

## Doors — a prop plus a state (rpg-project#485)

**A door is a prop plus a state, not a position on a wall.** This dialect has no
walls to put one on — walls are props that block, and a door authored "in" one
would no longer mean anything — so instead the door's SHAPE is its ordinary
`propDeclarations` entry, lowered by the same path every table and barrel takes,
and its STATE is `doorBindings[<item id>]`. What the footprint blocks follows
the state rather than the declaration's two flags.

The panel offers one item at a time, in the engine's own four authored states —
no binding (`not a door`), `{}` (`open doorway`), `{closed: true}`, and
`{locked: [...]}`. A lock carries one row per APPROACH, each an ability, an
optional tool and a DC; any one of them beats it, so the rows keep the author's
order. Removing the last row removes the lock, never the door.

Three consequences are load-bearing and each is stated where it lives:

- **`closed` beside `locked` is dropped**, because the engine ignores it there —
  a locked door is shut by definition. Un-locking therefore lands on `open`,
  which is what the document actually claimed.
- **Making an item a door gives it a footprint**, measured from its own mesh
  with both blocking flags false. A door's shape _is_ that declaration and the
  engine refuses one without it; setting either flag true on a door item is
  refused by name, because nothing consults door state to clear an authored
  flag and it would build a wall that never opens.
- **Deleting the item deletes its binding**, exactly as removing a creature
  removes its orders. An orphan here is worse than stale: it refuses the whole
  document at publish.

**State is carried, not graded.** The builder writes the keys and reads them
back; it does not decide whether an ability ref resolves or whether a DC is
beatable. The engine judges the state at `PutDungeon` and answers with the path
and the sentence, which is what the publish panel shows
(rpg-project#481/#483). `concealed` is refused by the engine in this dialect and
has no control here. The item list is the web's own question and only because
the engine cannot answer it: a placed prop is a door CANDIDATE when its asset
declares a `leaf` — the renderer's own signal that something swings — and an
item that already carries a binding stays listed whatever its asset says, so an
authored door can never be edited or removed only by luck.

## Boundary and promoted mount

The same editor implementation has two mounts:

- the original durable Concepts Lab at `?concept=world-building`, with its
  local-only behavior unchanged; and
- the development main-menu **World Builder**, which injects the configured
  current-world CompositionService source and adds explicit immutable
  save/list/open controls.

No second editor or scene dialect was created. Both mounts preserve the local
scene draft, arrangement library, import/export, continuous transforms,
selection, groups/supports, gizmos, and visual-light declarations described
below. The live mount still does not alter dungeon YAML, proto, toolkit, asset,
or gameplay behavior.

The first-run scene is blank and the author-created arrangement library is
empty. Hex lines use the shared hex math and are visible only as scale/planning
references. They are not placement slots. In the **composer**, the highlighted
X0/Z0 hex marks the composition placement anchor, while a separate orange box
encloses the loaded props' measured visual bounds. Both are non-interactive
visual guides; the box is not a mechanical footprint and neither guide changes
authored transforms. Room mode renders neither guide (see Destinations).

## Proved behavior

The concept currently provides:

- continuous X/Z world placement on a finite floor, including sub-hex positions,
  overlaps, and more than one object in the same visual hex;
- real catalog-backed props, rendered by the shared `PropModel` rather than a
  concept-only imitation;
- drag-to-add without a sticky placement mode: a private bounded HTML drag
  payload carries only a catalog ref or current-library arrangement id. A
  valid prop drop on the finite ground creates one selected prop and opens the
  Move tool. Palette/canvas clicks never add or arm placement; malformed,
  external, off-canvas, unknown-ref, and canceled drops leave scene/history
  untouched;
- direct surface drops: the drop ray seeks an upward-facing triangle beneath a
  successfully loaded, catalog-eligible `PropModel` subtree. Loading/error
  fallbacks, transparent selection hitboxes, selection wireframes, hex lines,
  drop previews, and transform gizmos cannot author a support. The authored Y
  is the exact real-mesh intersection and `supportId` is recorded
  automatically;
- always-visible Select / Move / Rotate tools. Left click selects only and
  Shift-left extends selection (including a decoration overlapping its
  selected support). Move uses Three/Drei `TransformControls` X/Y/Z axes and
  plane handles; Rotate exposes only its Y ring, matching the upright-yaw
  schema. There is no implicit whole-object left drag;
- one transform transaction per handle drag: object transforms preview from an
  immutable drag-start scene without history/local-storage writes, pointer
  release validates and commits one snapshot, and Esc/right-click restores the
  drag start. Invalid final transforms reject non-destructively. Pointercancel,
  deferred lost-capture handling, unmount, tool changes, and selection changes
  clear preview/control ownership rather than stranding the camera;
- Blender-style camera ownership through Three/Drei `OrbitControls`: middle
  drag orbits, Shift-middle drag pans, and the wheel zooms. Left/Shift-left is
  reserved for selection/gizmos and right-click is reserved for cancellation;
  camera gestures do not select or mutate scene data, and handle gestures do
  not move the camera;
- group/ungroup, duplicate, delete, undo, redo, and coherent keyboard
  shortcuts (including plain `R`, while Ctrl/Cmd/Alt+R remains browser-owned);
- relationship-aware transforms: moving or rotating a support/group carries
  its descendants, while selecting a descendant edits it independently. One
  rotation uses the union closure of the distinct top-level selected roots,
  rotates every included entity exactly once from the original scene around
  their common pivot, and matches Three.js positive-Y yaw;
- named arrangements saved from a selection closure. Arrangement X/Z is local
  to the saved root pivot while Y stays floor-relative, so grouped tables and
  decorations at unequal heights validate, reopen, and drag-stamp on the ground
  without flattening or negative local heights. Each drop creates one
  independent stamp, deep-copies the template, creates fresh identities,
  remaps internal group/support links, and has no linked-template or sibling
  propagation. The UI truthfully says arrangements stamp on ground; it does not
  imply arbitrary tabletop arrangement anchors;
- versioned scene and arrangement-library JSON import/export and independent
  local-storage auto-save. Parse/write failures are visible and do not replace
  the valid in-memory scene/library or a prior good stored payload;
- a confirmed blank-scene action. There is no silent reset.

Undo retains the newest 80 committed snapshots. Copying only part of a
relationship retains internal links but deliberately drops references to an
external group/support; for example, duplicating or saving a candle without its
table creates a detached copy at the same floor-relative height.

The current real-browser forcing case dragged a torture table onto the ground
and candles onto its loaded mesh, selected through actual canvas clicks,
exercised real TransformControls axis/plane/ring pickers, canceled previews with
Esc/right-click, rejected an invalid Y transform, and undid one committed drag
with one Undo. It then moved a grouped table/support closure, drag-stamped its
arrangement twice with fresh remapped identities, exercised Blender-style
camera gestures, and reloaded exact scene/library data. The complete receipt is
under the current evidence path in Verification evidence.

## World-library persistence

In Vite development, `VITE_DEV_WORLD_ID` selects the visible current world and
defaults to `test-world`, matching the API's `RPG_DEV_WORLD_ID`. The request
world is a selector only; server authentication/authorization remains
handler-owned. Production creates no source or World Builder entry until a
verified Discord guild-to-world mapping exists.

`Save local draft` and `Reopen local draft` retain the existing browser-local
workflow. Ordinary local drafting auto-saves. Opening a listed world snapshot
first flushes the latest locally owned scene, then marks the opened workspace as
world-owned: the snapshot and subsequent workspace edits do not replace the
prior local draft. `Reopen local draft` restores that prior draft. Only the
explicit `Save local draft` action transfers an open world workspace back to
local ownership and deliberately replaces it.

`Save composition to world` calls `CreateComposition` with the same scene JSON;
every save returns a new immutable ID without changing local-draft ownership.
List refreshes on the World Builder mount, an explicit reload, and successful
saves or deletes. Opening a listed entry calls `GetComposition` before replacing
the scene. The authored `scene.name` is the human label; malformed snapshots
fall back to their opaque ID and remain deletable without being opened.
Permanent deletion requires inline confirmation and never edits dungeon
placements: dangling references stay visible for explicit removal. Cancel or
failure keeps the row and data. Success invalidates the current source identity
so composition resolution caches cannot retain deleted models or lights.
Deleting an open snapshot does not replace its editable workspace or prior
local draft. API failure never substitutes the fixed development fixture.

`VITE_ENABLE_DEVELOPMENT_COMPOSITIONS=1` remains an explicit, separate fixture
option for tests. With the flag absent or disabled, the current-world source is
the real RPC adapter.

The isolated local Redis remains ephemeral across a full stack teardown. Local
drafts and exported files remain the durable escape hatch; ordinary page reload
and API-only restart are valid local-library checks, not a durability promise.

## Provisional local JSON

Two independent envelopes are stored/exported:

```text
SceneEnvelope {
  kind: "rpg-world-building-scene"
  version: 1
  scene: WorldScene {
    version: 1 | 2 | 3 | 4
    id, name
    items: WorldProp[]
    groups: WorldGroup[]
    mapLabels?: [{ id, text, location: { x, z } }] // scene 2/3/4
    authoringRegions?: AuthoringRegion[] // scene 3/4; optional lighting only in4
  }
}

WorldProp {
  id
  kind: "prop"
  assetRef                    // must exist in PROP_KEYS
  label
  transform: { x, y, z, rotationY }
  parentId?                   // group identity
  supportId?                  // prop identity
  pointLight?: {
    enabled
    offset: { x, y, z }       // part-local scene-coordinate units
    color                     // #RRGGBB
    intensity                 // rendering control, 0..20
    range                     // scene-coordinate units, 0.01..24
  }
}

WorldGroup {
  id
  kind: "group"
  label
  transform: { x, y, z, rotationY }
  parentId?
}

LibraryEnvelope {
  kind: "rpg-world-building-library"
  version: 1
  library: {
    version: 1
    arrangements: Arrangement[] {
      version: 1
      id, name, createdAt
      items: WorldProp[]      // X/Z-pivot-local, floor-relative-Y copies
      groups: WorldGroup[]
    }
  }
}
```

Standalone prop-composer bounds are deliberately finite: X/Z `[-12, 12]`,
Y `[0, 8]`, at most 200
props and 80 groups per scene/arrangement, at most 40 arrangements, strings up
to their field-specific limits, rotations within `[-100π, 100π]`, and imported
JSON up to 500,000 characters. Parsers reject malformed/wrong-version
envelopes, non-finite or out-of-range transforms, duplicate identities,
unknown asset refs (including arbitrary URLs), missing/invalid relation
targets, and relation cycles. Editor commits pass through the same scene
validator.

Point lights are explicit author declarations only; asset names and meshes never
imply emission. The part-local offset rotates with the part, then the complete
composition placement applies once. Rendering selects at most the established
12 point lights: dungeon selection uses its current view focus, while composer
and standalone/thumbnail selection currently use the composition origin rather
than camera position. Authored sources illuminate meshes but do not add crypt
floor pools. Studio's configured-only Basic floor receiver is the independent
visual authoring path described above, not a gameplay pool. This is visual rendering only: intensity is not a physical
measurement, range is not D&D bright/dim distance, and no visibility or
lit-cell facts are computed.

Local-storage keys are:

- `rpg.concepts.world-building.scene.v1`
- `rpg.concepts.world-building.library.v1`

These shapes are concept-owned and provisional. An exported file is portable
between copies of this concept with the referenced catalog assets available; it
is not a playable dungeon payload.

## Delta from today's dungeon authoring wire

The live builder's `PlacementDoc` in `src/author/dungeonYaml.ts` is still an
axial-cell placement (`ref`, `at`) with optional compass `facing` and a bounded
within-cell visual `offset`. `placeAt` intentionally keeps one placement per
cell and replaces an occupied cell. That contract has no arrangement library,
group identity, support attachment, arbitrary continuous yaw, or many
independent overlapping placements in one cell.

This concept does not reinterpret or alter those rules. Its stable identities,
continuous transforms, groups, and support links are the measured consumer
delta only; this document does not request a proto/backend change or choose a
promotion shape.

## Shared renderer and asset receipt

Generated catalog entries use provider-published default-appearance 128×128 PNGs.
The catalog binds path, digest, byte size and dimensions; its generator verifies
provider and synchronized bytes and includes the image digest in the URL for
cache invalidation. The world provider pin owns both `world-assets/` and
`thumbnails/world-assets/`. Older pins without thumbnails cannot inherit newer
HEAD thumbnails.

Catalog browsing never mounts a GLB thumbnail renderer. Image loading/error state
belongs to the image component, not document history or the palette owner. An
absent or failed image yields a named selectable placeholder; it never triggers
automatic model capture. Actual placement still loads the selected model.
Composition/NPC capture and legacy baked PNGs remain separate and unchanged.

`PropModel` retains its default `source-origin` behavior for every existing game
caller. The concept opts into `bounds-floor-center`, measured from the loaded
mesh, to center the visible bounds and rest their base on the dungeon surface.
The shared Synty scale, companion meshes (including the candle particle
companion), material handling, and GLTF loading remain owned by `PropModel`.
Selection bounds are measured from the primary variant; support drops ray
against the real visible meshes.

For browser verification only, the existing synced root `props` and `env`
runtime directories were copied into the ignored, real (non-symlink) worktree
path `public/models/synty`. This path resolves inside the recovery worktree,
contains 110 prop GLBs, passes nested `git check-ignore`, and has zero tracked
files. All licensed assets remain untracked. Browser responses for the table,
candles, candle companion, and books were HTTP 200. Receipts from the synced
root and local copies match:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `SM_Prop_Toture_StretchTable_01.glb` | `d3481dd7e200056f695462dd97b40716dc63516d7d517151626d4c6f45853264` |
| `SM_Prop_Candles_01.glb`             | `87393fcc2bb684dfc3b5f9cac70e0084065824b058ed6bc2813c05cf632c7c8a` |
| `SM_Prop_Candles_01_Particle.glb`    | `7e24f8d201b5543442b1dffcb747377057ea5d732a1bed1d79b5180124c457ef` |
| `SM_Prop_Book_Pile_01.glb`           | `a8eba6d2c04e7e6848ea483b7578220a5d528780e87598b4bc9d088cb4abb49c` |
| provider `props/manifest.json`       | `0ed3d521aad6d721a9fd4394cc041c6a431e65fb62108248f4b454cd0007a487` |

## Verification evidence

TDD coverage for this interaction pass adds bounded HTML drag payload parsing,
valid/no-op drop creation, visible tool state, transform preview/commit/cancel
semantics, relationship-preserving proxy math, surface eligibility, overlapping
support-child selection, and explicit pointer ownership. Verification on the
candidate included:

```bash
npm test -- --run \
  src/concepts/world-building/sceneState.test.ts \
  src/concepts/world-building/serialization.test.ts \
  src/concepts/world-building/worldBuildingDrag.test.ts \
  src/concepts/world-building/WorldBuildingInteraction.test.ts \
  src/concepts/world-building/WorldBuildingConcept.test.tsx \
  src/concepts/world-building/WorldBuildingViewport.test.tsx \
  src/components/hex-grid/PropModel.test.tsx
# 7 files, 66 tests passed

npx prettier --check <15 scoped paths>
npx eslint <11 scoped TypeScript paths>
npm run typecheck
# passed

npm run build
# 3,549 modules transformed; passed (expected chunk-size warning)

npm test -- --run
# 374 files passed, 1 skipped; 5,346 tests passed, 5 skipped

npm run ci-check
# format, lint, typecheck, build guards, and full tests passed
```

Real R3F/GLB evidence ran in a fresh isolated Google Chrome context at
`http://127.0.0.1:3018/?concept=world-building`. The reusable script, complete
JSON receipt, logs, and screenshots are outside Git at:

```text
/home/kirk/.pi/agent/sessions/--home-kirk-game-dev--/subagent-artifacts/outputs/
86d92fc3-5b35-400f-924a-f3f4d12fd4bc/world-building/evidence/
```

The gesture harness drives the actual HTML `DataTransfer` path and the installed
Drei controls; it does not call editor callbacks or mock the models/editor.
Notable measured facts from `browser-evidence.json`:

- ordinary palette/library/canvas clicks, external text, malformed private
  payloads, and an arbitrary URL left items/history untouched. A real palette
  drag created one selected table; a second real drag hit its loaded triangles,
  authored candle Y `1.0171206342919583`, and stored the table `supportId`;
- actual canvas left-click selected the table and Shift-left selected its
  overlapping candle without losing the table. Empty-ground left-click cleared
  selection but did not author data;
- actual TransformControls X-axis and XZ-plane drags continuously previewed with
  zero storage writes. Esc and right-click restored the drag start; a forced
  negative-Y release was rejected and restored. A valid X drag committed once,
  moved the table and supported candle by the same `1.058167802010371`, left the
  camera unchanged, and one Undo restored it;
- the actual Rotate control exposed and dragged the Y ring, committing yaw
  `1.2249010673966143` to the relationship closure; one Undo restored the prior
  snapshot. No X/Z tilt or scale path is present;
- a grouped table/candle moved through one common gizmo without double-moving
  the child. Dragging the saved arrangement twice produced fresh group/prop
  identities, remapped support ids, retained floor-relative heights `[0,
1.0171206342919583]`, and left the template/sibling stamps independent;
- real middle-drag changed camera position without changing target/data/
  selection; real Shift-middle changed the target; wheel changed zoom. Right
  drag produced no orbit (only `0.0009002` residual damping drift), and the
  earlier handle drag left the exact camera receipt unchanged;
- save/reload round-tripped 6 items, 3 groups, and 1 arrangement exactly, then
  reopened in Select. All six real models loaded. There were zero console
  errors, page errors, failed requests, non-200 model responses, or GLTF errors.
  The harness returns valid empty gRPC-web responses only to unrelated App hooks
  and records them separately; World Building makes no API request.

## Standalone prop-composition limits

These limits describe the original prop composer, not current room-mode or
Encounter Studio floor/structural-wall authoring.

- Persistence is browser-local only: no campaign wiring, backend promotion,
  collaboration, sharing, ACLs, or marketplace behavior.
- Surface eligibility is a concept-local catalog hint and surface drops accept
  upward-facing triangles only. There is no wall snapping, physics, collision
  avoidance, or semantic surface metadata from a provider.
- Attachments are authored relations propagated by editor operations, not a
  runtime constraint solver. An author may intentionally edit an attached
  child away from its support while retaining the relation.
- No scale, full tilt, general numeric transform inspector, advanced precision controls, floor painting, wall
  construction, behavior/quest wiring, or linked-prefab overrides exist.
- Composition point lights have no shadows, flicker, fuel, gameplay on/off verb,
  occlusion, darkness/visibility computation, or physical/D&D illumination meaning.
- The finite limits above are concept safety bounds, not proposed server limits.
- The catalog can only reference locally synced `PROP_KEYS`; missing licensed
  assets cannot be embedded in exports and are not committed here.
