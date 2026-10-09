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
repeatable choices remain accessible. Generated images use the existing single
serial capture queue/cache; Layout requests capture while the context is visible.
Loading/error images retain named selectable fallbacks, never substitute an asset
or delete an authored wall. Eligibility remains the catalog's measured generated
assets without a door leaf role. No appearance is armed by default.

Wall stays armed for consecutive draws. Snap starts off, can snap to existing hex
centres/corners/side midpoints, and retains its presentation-only choice across
context dismissal and view changes. Both preview and release use the same pure
helpers. Dismiss hides settings without exiting drawing; Escape/right-click exits
Wall and cancels the unfinished gesture without clearing appearance or snap.

Select picks a wall body for rigid translation or a selected endpoint for direct
reshape. Endpoint reshape composes protected collinear resize then rotation about
the opposite endpoint: opening distances/identities and attached doors travel with
the changed bearing. Opening edges clamp length; the preview displays the actual
applied endpoint on the requested ray, not the unreachable raw pointer. Numeric
length remains collinear, and move/rotation/appearance controls are secondary.
Appearance changes do not change the independent blocker. Neither renderer stores
derived spans or a second door pose; the existing 3D consumes the same canonical
walls and door bindings.

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
without history. Labels are plain text 2D annotations such as Kitchen/Courtyard,
not gameplay regions, floor ownership, blocking/discovery data, assets, support
relations or arrangement members. No 3D label renderer is promised. Label-only
edits leave workspace and gameplay policy unchanged.

`WorldScene.version` supports 1/2. Version 2 optionally carries
`mapLabels:[{id,text,location:{x,z}}]`; label IDs are nonempty and unique within
labels, IDs/text are at most 120 characters, text is nonblank, locations are finite
continuous world points inside the workspace, and at most 256 labels are accepted.
Absent labels means none; deleting the last removes `mapLabels` without demoting
the scene. First label or explicit rectangular resize promotes the scene to 2,
even if the rectangle has no labels. Version-1 scenes carrying label metadata
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
    version: 1 | 2
    id, name
    items: WorldProp[]
    groups: WorldGroup[]
    mapLabels?: [{ id, text, location: { x, z } }] // scene 2 only
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
floor pools. This is visual rendering only: intensity is not a physical
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

Generated catalog entries receive palette thumbnails automatically from the
browser's existing serial composition-thumbnail capture surface, using the
exact asset ref and promoted GLB hash as cache identity. There is no operator
bake, thumbnail promotion, persisted composition, or second asset pipeline;
legacy baked PNGs (including the Skeleton Dog Plushie) remain unchanged.

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
