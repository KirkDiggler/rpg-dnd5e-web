# The target dungeonspec dialect

Written for a reader with zero context — you should not need to have read
CONTRACT.md, design.md, or any prior PR to understand this file.

## Why this file exists

Kirk, 2026-08-02, looking at this concept's two tabs (a real-schema
"Edit" board and a fake-schema "New Dungeon" board): "let's make the yaml
that works the way we want it to. this is the point of the concept. make
this easy for future you to understand." The concept's job was never to
render two YAML dialects side by side — it's to **author the ONE dialect
we actually want**, then be honest, per feature, about how much of it the
real server can compile today. This file is that one dialect, written
down. It is the seed for a canonical spec rpg-project will eventually
own; until then, this is the source of truth for what "the target" means.

**Everything in this file is a proposal.** Nothing here is real
dungeonspec except the fields explicitly marked "v1, real today." Kirk
has not reviewed or approved the shape of `walls:`/`start:`/`end:`/
`lighting:`/`facing:`/`mount:`/`height:`/`targeting:` as a server-side
commitment — only as the concept's own authoring surface.

### Settled early model (rpg-project#175)

Rooms are **stable semantic regions** with stable IDs: they own reveal,
placement, spawning, scripting, and archetype meaning. Dungeon space—not
individual adjacent rooms—owns the canonical wall/door edges. An inner wall
changes movement and line of sight; it does **not** create or split a semantic
room. An author who needs distinct gameplay identity draws another region.

`target dialect` is a name for this proposal, **not an actual YAML version
bump**. Additive capabilities stay compatible with the current document version;
a real version bump is reserved for an incompatible room/topology change. The
current concept's legacy `version: 2` marker is only a local UI signal and is not
a target-contract requirement or a server version.

Holes are deliberately deferred from this early dialect. A collapsed-looking
blocked cell is authored and rendered as an obstacle/prop until falling,
bridging, or vertical visibility/traversal establishes a real no-floor primitive.
The concept's existing Hole prototype remains visible as an exploration artifact;
it is not a commitment for the early dialect.

Implementation is deliberately sliced, not started here: generated wall/door
truth (#176), authored start (#177), floor-prop facing (#178), canonical
wall/door edges including inner walls (#179), then cell-authored semantic room
regions (#180).

**This gap is permanent, not a phase.** Kirk, same conversation: "what
we built was just to start... we cannot be held down by our early
ideas." Read that as the operating assumption for this whole file, not
a one-time caveat: the target dialect is expected to keep running ahead
of what `dungeonspec.Validate` compiles, indefinitely. New fields will
keep landing here before there's any server-side plan to implement them
— that's the concept doing its job (discovering the requirement by
building the screen that needs it), not the concept getting ahead of
itself. The per-feature compile-badge/subset-save mechanism this file
describes isn't a transitional shim to delete once the schema "catches
up" — it's the steady state. Don't read a target-dialect badge as "coming soon";
read it as "here's what this concept found while building the thing
that needed it."

## The core idea: one document, two kinds of fields

A dungeon spec is ONE YAML file. Every field in it is either:

- **v1, real today** — `rooms:`, `connectors:` (including `locked:`),
  `place:`/`boss:`/`obstacles:` inside a room. These compile against the
  real `dungeonspec.Validate`/`PutDungeon` right now, unchanged from
  before this file existed.
- **target-dialect-only, proposed, not yet compiled** — `walls:`, `start:`,
  `end:`, `lighting:`, and `facing:`/`mount:`/`height:`/`targeting:` keys
  added to any `place:`/`boss:` entry. These are real, meaningful fields
  in THIS concept — the board renders them, the YAML pane round-trips
  them, editing them works — but `PutDungeon` doesn't know about them
  yet. The concept "compiles the implemented subset and badges the
  rest," which literally means: strip every target-dialect-only field out,
  send what's left (a pure v1 document) to the real server for live preview /
  Save & Play, and show a small badge next to each target construct saying it isn't
  in that server response.

There is no second file, no second pane style, no "proposed schema"
ghetto. One board, one YAML pane, some of its fields chase-badged.

**This two-bucket split is no longer static, as of 2026-08-04.** A few
target-dialect fields (`walls:`, bare `start:`, and `facing:` on a
room-scoped floor prop) have genuinely graduated into the first bucket on
at least one real server — see "Status tracking: capability-probed, not
hand-recorded," further down, for the mechanism (`capabilityProbe.ts`)
that now checks this live instead of this section claiming it by hand.
The framing above ("v1, real today" vs. "target-dialect-only, not yet
compiled") still describes the MAJORITY of fields correctly; treat it as
the default, and the later section as the live exception list.

## The full annotated example

```yaml
# version is OPTIONAL — omitted or 1 means "this document only uses
# fields dungeonspec v1 already compiles." "target dialect" is not a
# version value: additive target fields do not require `version: 2`.
# The legacy concept marker is never sent to the real server. When this
# concept sends anything to PutDungeon, it always sends `version: 1` and
# the v1-only subset (see
# "The v1-subset strip" below) — dungeonspec.Validate hard-rejects any
# version other than 1 (rpg-toolkit encounter/dungeonspec/validate.go:
# `if spec.Version != 1 { return fmt.Errorf(...) }`), so a real "2" would
# just be an instant, uninformative server error, not a richer one.
version: 1 # optional; target-dialect naming does not bump this
key: shrine-hall # v1. [a-z0-9-]+, must match the request's key
name: 'The Shrine Hall' # v1. display name
theme: crypt # v1. optional
height: 8 # v1. shared by every room in the chain

# --- v1, real today: the room chain ---
# A room is DECLARED here: an id, an archetype (entrance|chamber|
# corridor|boss), and a width. dungeonspec's generator lays declared
# rooms out left-to-right in array order, each with its own
# start_column (server-computed: next.start_column = prev.start_column +
# prev.width + 1 — the "+1" is the reserved connector gap column between
# them). This IS the geometry backbone in both the current and target dialects —
# the target dialect does not
# replace it with a second, incompatible "freeform canvas" model (the
# creation flow's PRE-this-file draft did that, and that mismatch — one
# tab's board keyed by declared rooms, the other by a canvas with no
# rooms at all — is exactly the seam Kirk asked to kill). Every
# coordinate below (`walls:`, `start:`, `end:`, `place.at`) is
# expressed in this SAME absolute [col, row] space a compiled `FloorPlan`
# already uses, not a second coordinate system.
rooms:
  - id: antechamber
    archetype: entrance
    width: 6
    place:
      - {
          ref: 'dnd5e:props:brazier',
          at: [1, 1],
          blocks_movement: true,
          blocks_los: false,
        }
      # facing is target-dialect-only — see "place:/boss: facing" below.
      - { ref: 'dnd5e:props:statue-reaper', at: [4, 1], facing: SE }
      # mount/height are target-dialect-only — see "z-axis: mount + height" below. This
      # banner hangs on the wall at this cell's SE edge, 2m up, instead
      # of standing on the floor.
      - {
          ref: 'dnd5e:props:wall-banner',
          at: [2, 0],
          mount: wall,
          facing: SE,
          height: 2.0,
        }
  - id: shrine
    archetype: chamber
    width: 14
    place:
      # targeting is target-dialect-only — see "monster targeting" below. A REFERENCE to a
      # toolkit AI strategy key, never behavior (Boundary Rule) — the
      # toolkit's monster decision chain is what would give this meaning.
      - {
          ref: 'dnd5e:monsters:skeleton-captain',
          at: [7, 2],
          targeting: lowest-health,
        }
  - id: vault
    archetype: boss
    width: 8
    boss:
      ref: 'dnd5e:monsters:skeleton-captain'
      at: [5, 5]
      facing: W # target-dialect-only
      targeting: closest # target-dialect-only

# v1, real today. from/to are NOT independently authorable — see
# "Why connectors have no add/remove UI" below. locked (dc/ability) is the
# one field a connector's own surface actually varies.
connectors:
  - { from: antechamber, to: shrine }
  - { from: shrine, to: vault, locked: { dc: 12, ability: dex } }

# --- target-dialect-only, proposed: the authored structural overlay ---

# OPTIONAL. Only meaningful when rooms: is empty (a from-scratch canvas,
# nothing declared yet — "New Dungeon"'s starting point) or when you want
# to draw beyond the declared chain's current bounding box. The moment at
# least one room exists, the effective canvas is DERIVED
# (sum of room widths + gaps, by height) and this becomes redundant —
# it exists only to give a blank document something to draw walls inside
# of before any room has been declared.
#
# HEX-TRUE (2026-08-03): width/height are cell-count DIMENSIONS only —
# unchanged by this note. What changed is the GEOMETRY every [col,row] in
# this dialect resolves to when rendered: the creation canvas now uses the
# SAME real hex math (hexLayout.ts's cellCenter/edgeBetweenCells) the
# compiled edit-mode board renders with, not a second, square-grid
# coordinate system. One coordinate space, one rendering, for both boards
# — see CONTRACT.md's "hex-true creation canvas" ledger entry for the full
# finding (false enclosure, disconnected wall segments) that drove this.
canvas:
  width: 20
  height: 30

# Canvas floor semantic (rpg-project#169's creation-mode 3D preview unit,
# 2026-08-04): a from-scratch canvas has no compiled FloorPlan, so there is
# no server-derived floor-cell set to render — the 3D preview needed one
# anyway and settled it: the floor is EVERY [col,row] cell inside
# canvas.width x canvas.height, minus holes:. Deliberately NOT also
# subtracting a walls:/wallLines: footprint cell — Kirk's rule ("any hex
# that is not 100% uncovered would not be traversable") makes a footprint
# cell BLOCKED, not floorless; the tile still renders, dimmed/flagged, the
# same "flag, don't silently remove" discipline this file's other
# footprint-interaction notes already follow. See
# `creation/canvasFloor.ts`'s own doc comment for the implementation and
# `preview3d/DungeonPreview3D.tsx` for how it consumes this list (a new
# `floorCells` prop, alongside the existing `floorPlan`-driven path edit
# mode still uses — the two are alternate inputs, not a mode flag).

# TOP-LEVEL place:/boss: — same shape as a room's own place: (ref, at,
# facing, mount/height, targeting, blocks_*), room-scoping made OPTIONAL
# rather than required. See "Top-level placement" below for the full
# rationale; this is what "New Dungeon" writes for every placement now —
# a from-scratch canvas with zero declared rooms has nowhere else for a
# placement to live. `at` here is absolute [col,row], the SAME space
# everything else in this file uses — no conversion needed if a room
# later gets carved around it.
place:
  - { ref: 'dnd5e:props:pillar', at: [10, 15] }
  - { ref: 'dnd5e:monsters:skeleton-captain', at: [5, 18], targeting: closest }
# No top-level boss: — a boss stays room-scoped even here (dungeonspec's
# validateBossCardinality needs an owning archetype: boss room; see
# "Top-level placement" below for what canvas mode does about this today).

# Edge-native: {from, to, kind}, absolute [col,row] cell coordinates for
# both ends of the wall segment (from/to must be orthogonally adjacent
# cells — a wall sits ON the shared edge between them, matching a hex
# grid's own edge-vs-cell distinction the same way a real wall run does).
# This is a flat, dungeon-scoped AUTHORING list. Runtime
# `EncounterService.Space.walls` no longer exists: canonical runtime wall
# geometry is carried on `HexRecord.edges`. Compilation/projection must turn
# this source list into those canonical edges, deduplicating a shared edge
# rather than assigning it independently to both rooms. Doors remain an edge
# kind, not a separate list — see CONTRACT.md's "walls: edge-native" finding.
walls:
  - { from: [7, 0], to: [7, 1], kind: solid }
  - { from: [7, 4], to: [7, 5], kind: door }

# STRAIGHT walls — a separate sibling construct, NOT a variant of walls:
# above. from/to are hex CORNERS (not cells — see this file's own
# "Straight walls" section for why corner anchoring replaced the original
# cell-center anchoring, Kirk's "it always hangs over a little" finding),
# typically several corners apart — the wall is the straight WORLD-SPACE
# line between them, which clips through every hex it passes over (a
# footprint, not just a boundary). A door is a CARVED OPENING at a
# specific footprint cell along the line (doors:), not a property of the
# whole line — see this file's own "Straight walls" section, below, for
# the full footprint rule (Kirk's "any hex not 100% uncovered would not be
# traversable"), the corner-lattice addressing/dedup convention, the door
# traversability semantic, and why this needed a new list rather than a
# style: discriminator on walls: above.
wallLines:
  - { from: { cell: [10, 5], corner: 0 }, to: { cell: [10, 12], corner: 3 } }
  - {
      from: { cell: [3, 3], corner: 1 },
      to: { cell: [8, 3], corner: 4 },
      doors: [{ cell: [5, 3] }],
    }

# No `holes:` in the early dialect. Use an obstacle/prop for a collapsed
# visual; a true no-floor cell waits for mechanics that require one.

# Author-placed party spawn — in real, unresolved tension with the
# compiled `FloorPlan.entrance` field (generator-chosen, only meaningful
# for a linear declared-room chain: "not derivable from any room's
# archetype" per design.md). A freeform canvas with an author-placed
# start has no generator to choose FOR the author; the author IS
# choosing it. If/when this becomes real: either FloorPlan grows a
# freeform-compatible sibling field, or the freeform case feeds `start:`
# straight through as the compiled entrance with no generator step at
# all. Null/omitted = not placed yet.
start: [0, 4]

# The goal. Unlike start, this has NO analog anywhere in the compiled
# FloorPlan today, not even a derivable one — a freeform canvas is the
# first place this concept ever needed one. Null/omitted = not placed.
end: [19, 25]

# Dungeon-wide lighting config (Kirk's 2026-08-01 ask: "an intensity
# knob now, full light-source configuration later"). Precedent: the
# game's rendering stack already has exactly this "coarse global knob
# now, per-source config later" shape as dev-only URL dials
# (?wallHeight=/?wallCutaway=1/?floorPools=1 — calibrationConstants.ts,
# EncounterMap.tsx) — this promotes that same direction from a runtime
# query param to an AUTHORED, per-dungeon setting.
lighting:
  ambient: 0.8 # 0..1, dungeon-wide multiplier. The only knob today.
  # sources:      # P4+: per-source config, once this exists at all.
  #   - ref: dnd5e:props:brazier
  #     at: [1, 1]
  #     intensity: 1.0
  #     radius: 3

# Dungeon-wide, ref-keyed default fields (Kirk's ask, verbatim: "maybe we
# can set a default for all skeletons") — see "defaults:" below for the
# full design. A placement's own explicit field always overrides its
# ref's entry here; the serialized YAML stays SPARSE either way (a
# placement never needs to repeat what its ref already defaults).
defaults:
  'dnd5e:monsters:skeleton': { targeting: lowest-health }
  'dnd5e:props:candles': { blocks_movement: false, height: 1.2 }
```

## Straight walls: `wallLines:` — a footprint-bearing alternative to `walls:`

Target dialect, proposed — prototyped alongside the existing `walls:` edge-
painting tool this round (rpg-project#169's "straight walls with visible
footprint" unit), both survive in creation mode as the direct comparison
Kirk asked for. Kirk's own diagnosis, verbatim, looking at the hex-true
creation canvas's zigzag walls: "we talked about our walls being straight" —
he drew straight red lines across a room envelope and stated the governing
rule directly: **"any hex that is not 100% uncovered would not be
traversable"** — a straight wall has a FOOTPRINT, not just a boundary.

### Why this needs a genuinely different shape than `walls:`

`walls:`'s `{from, to, kind}` is edge-native: `from`/`to` are always
hex-ADJACENT cells, and the wall sits on the one shared edge between them —
a chain of these, drawn one edge at a time, is how the existing zigzag Wall
tool traces a boundary that hugs real hex edges.

A straight wall is not that. Verified directly against this codebase's own
hex math (`hexMath.ts`'s `hexCorners`, corners at `30° + 60°·i`): a
pointy-top hex has exactly 3 edge-line orientations — 30°, 90° (vertical),
and 150° from the board's horizontal axis. **There is no 0°/horizontal edge
family at all.** So a straight wall drawn along board-space "horizontal" (one
of the two axes Kirk asked to snap to) can never run along hex boundaries —
it always cuts through hex interiors. Even "vertical" only coincides with
real hex edges for specific endpoint pairs; in general it also clips through
cell interiors ("shoulder-clipping" — see below). `from`/`to` on a straight
wall are therefore typically SEVERAL cells apart, not adjacent, and the
wall's true geometry is the straight WORLD-SPACE line between their centers
— a structurally different claim than `walls:`'s "this exact shared edge."

### Schema shape chosen, and the alternative rejected

**Chosen: a separate sibling list, `wallLines: [{from: CornerRef, to:
CornerRef, doors: [{cell:[c,r]}]}]`** — same "sibling list, not a variant of
`walls:`" shape as originally chosen, now with corner-anchored endpoints and
a real doors model (both this section's own subsections below cover the
"why", each following a follow-up round after Kirk played with the first
prototype).

**Rejected: overloading `walls:` with a `style: edge|straight` discriminator**
on the existing `WallDoc` shape. Weighed and rejected because `from`/`to`
mean something incompatible depending on `style` (hex-adjacent-cell vs.
arbitrary-cells-apart) — every existing `walls:` consumer (`wallAtEdge`,
`openBoundaryEdges`, `connectRegions`'s shared-boundary search, the door
tool's edge lookup) assumes adjacency and would need a style branch added to
stay correct, for a prototype round where the zigzag tool's own code needed
to keep working unchanged. A sibling list needed zero changes to any
existing `walls:` consumer — `doc.wallLines` is simply empty on every
document that doesn't use it, the same "additive, absent by default" shape
every other target-dialect field in this file already follows.

### Corner anchoring — endpoints are hex CORNERS, not cell centers (follow-up round)

Kirk, playing with the first prototype: "I could not get the edges quite
right. would be nice if I could fine tune the edges — oh I could edit the
yaml directly, right. It always hangs over a little." Two related, but
distinct, complaints:

1. **The hangover** — a wall drawn cell-center-to-cell-center OVERSHOOTS its
   intended extent by up to half a hex at EACH end, always, by construction.
   A cell center is never where a real room boundary actually sits; it's the
   MIDDLE of a hex, which is at best a rough approximation of where an
   author meant a wall to stop.
2. **No fine-tuning path** — even editing the YAML directly (Kirk's own
   proposed workaround) couldn't fix it: the only addressable points were
   cell centers, one per hex. There was no finer lattice to move an endpoint
   INTO. Precision was capped at "which hex," never "where in/around that
   hex."

**The fix**: `from`/`to` are hex CORNERS — the finest lattice this grid
actually has, and the one a real wall run's own boundary geometry already
lives on (`hexEdgeBetween`'s edges are corner-to-corner). A corner is where
a hex wall belongs; a cell center never was.

```yaml
wallLines:
  - { from: { cell: [10, 5], corner: 0 }, to: { cell: [10, 12], corner: 3 } }
```

**Corner-ref shape**: `{cell: [c, r], corner: 0..5}` — `corner` matches
`hexCorners`' own `30° + 60°·i` indexing (`hexMath.ts`), the SAME convention
every other hex-corner consumer in this codebase already uses; no new
convention invented. The alternative considered — a dedicated corner-lattice
coordinate system with one intrinsic address per vertex — was rejected as
more mathematically demanding to justify and implement for the actual gain:
`{cell, corner}` plus a canonicalization rule (below) gets the same "one
address per real point" property with far less new machinery, and is
directly testable against the existing per-cell hex math this concept
already has.

**Dedup convention — canonicalization.** A hex vertex is shared by exactly 3
cells in the tiling's interior (1 or 2 at a canvas boundary — verified
directly, not assumed: `hexCorner.test.ts`'s `cornerOwners` cases). So the
same real point has up to 3 equally valid `{cell, corner}` spellings. Two
authors drawing toward the same corner from different sides — or the same
corner shared by two DIFFERENT wallLines forming an L-join — need to agree
on ONE spelling for equality/hit-testing to work without a geometry
comparison every time. **The rule: canonical = the owner with the
lexicographically smallest `[col, row]`**, candidates restricted to
`col >= 0 && row >= 0` (an off-canvas geometric co-owner is real math but not
a cell any author could have drawn from, so it can never BE the canonical
address). Every `wallLines:` mutator canonicalizes on write
(`addWallLine`/`setWallLineEndpoint` in `dungeonYaml.ts`) — a document never
carries a corner reference in a non-canonical form once anything has
written to it.

**Migration — a deliberate, honest, self-healing break, not a permanently
dual-supported format.** A PRE-corner-anchoring `wallLines:` entry (`from`/
`to` as a bare `[c, r]` cell — the shape the very first prototype round
shipped) is picked up at PARSE time: `migrateLegacyCenterEndpoint` chooses
whichever of that cell's own 6 corners sits nearest the OTHER endpoint's
resolved position, so the migrated line keeps pointing the direction it
always drew rather than snapping to an arbitrary corner. This heals the
in-memory `doc` immediately — every consumer (footprint/crossing math,
rendering) only ever sees the corner-anchored shape, regardless of source.
**It does NOT rewrite the underlying CST/YAML text by itself** — consistent
with this concept's own CST-preservation discipline (untouched content is
never silently rewritten), a legacy line's saved text stays legacy until
some mutator actually touches that entry (dragging an endpoint, adding a
door), at which point it converges to the corner-anchored shape as a side
effect of that write. Given how little real `wallLines:` content existed
anywhere at the time of this change, this was judged cheaper and more
honest than carrying two live representations through every downstream
consumer indefinitely — the same "break in place while consumers are few"
trigger CLAUDE.md's proto-versioning section names, applied to this
concept's own client-only document shape rather than a real wire proto.

### Footprint rule and the epsilon that makes it precise

**Kirk's rule, exactly**: every hex the wall's line genuinely passes through
is BLOCKED (not just its crossed edge — the whole cell is impassable), UNLESS
the line only touches a vertex or runs exactly along one of the hex's own
edges (a touch, not a clip). "Genuinely passes through" needs a concrete
boundary between a real clip and a floating-point-noise false positive —
`creation/straightWallGeometry.ts`'s `FOOTPRINT_EPSILON` is
`BOARD_HEX_SIZE * 1e-3` (~0.024 board units, under a fortieth of a percent of
the hex's own radius): every one of a hex's 6 edges is shrunk inward by this
much before testing for intersection (Cyrus-Beck half-plane clipping against
the shrunk hexagon). A touch never survives that shrink; a genuine clip,
however shallow, always does. This is several orders of magnitude larger
than the floating-point noise `Math.cos`/`Math.sin` introduce computing hex
corners (~1e-13 at this scale — verified, not assumed), so it can't be
fooled by trig rounding, and small enough to be visually and physically
meaningless at render/gameplay scale.

**Still true after corner anchoring, unchanged.** The clip math below
(`clipSegmentToShrunkHex`/`isCellClipped`/`candidateCells`) operates on raw
world-space points, not on cell/corner addressing — corner anchoring only
changed HOW `from`/`to` resolve to those points (`cornerPoint` instead of
`cellCenter`), not the clipping itself. The two cases below were originally
demonstrated with cell-center fixtures; the underlying epsilon/touch-vs-clip
behavior they illustrate is exactly as true for corner-anchored endpoints —
see this section's own "corner anchoring" boundary case, below, for what's
GENUINELY new once endpoints stopped being forced to cell centers.

Two concrete cases worth naming directly, both covered by
`creation/straightWallGeometry.test.ts`:

- **Shoulder-clipping (vertical).** A genuinely vertical line (constant
  world X — e.g. `[4,4]` → `[6,1]`, verified analytically to share the same
  world X) clips only the 3 cells whose CENTERS the line threads exactly
  through, and merely GRAZES (touches, does not clip) the cells immediately
  flanking them — their vertical edge sits exactly on the line. A vertical
  wall does not clip "a whole column" in `[col,row]` terms — a `[col,row]`
  column isn't vertical in world space at all (it's one of the 30°/150°
  diagonal edge families); this is why the test fixture is two columns
  apart with a compensating row offset, not a same-column pair.
- **Every-other-hex (a "same row index" line is NOT horizontal).** Two
  cells sharing a `row` index are NOT a horizontal line in world space —
  `hexRow`'s own parity-correction formula (`z = row - trunc((col-(col&1))/2)`,
  `wallRuns.ts`) means world-Y drifts substantially between them (the same
  diagonal-shear fact CONTRACT.md already documents for compiled `FloorPlan`
  rendering, showing up again here). Naively connecting two same-row cells
  produces a footprint that clips exactly every OTHER column, skipping the
  rest — confirmed directly, not assumed. A genuinely world-horizontal line
  (two cells with the SAME cube `z`, hence the same world Y — e.g. `[0,3]`
  → `[10,8]`) clips one cell per column with no skips, a structurally
  different result from the naive "same row" attempt. Both are exercised
  side by side in the test file specifically so this distinction is
  provable, not asserted on faith.
- **A wall ENDING at a corner shared with a cell does not clip that
  cell** — the boundary case corner anchoring specifically makes possible
  (a cell-center-anchored endpoint was ALWAYS deep inside its own cell,
  hence always clipped; a corner-anchored one can legitimately terminate
  at a point three cells share, clipping zero, one, or two of them
  depending on approach direction). Verified with the shortest possible
  non-trivial case: a segment from one corner of a hex to its
  DIAMETRICALLY OPPOSITE corner (corners 2 and 5 are 180° apart) is a full
  diameter of that ONE hex — it clips that cell dead-center but never
  enters either of the OTHER two cells that also own its terminal corner,
  even though the line visibly "ends at" a point they touch too. The
  simplest case of all — a segment that IS one cell's own true edge
  (corner `i` to corner `i+1`) — clips nothing at all, the purest form of
  "ending at a shared corner blocks nothing." Both cases are exercised
  directly in `straightWallGeometry.test.ts`'s own "corner-anchored
  endpoint boundary cases" describe block, not just asserted from the
  general epsilon rule above.

### Movement semantics

Two distinct effects, both implemented:

**(a) Every footprint cell is blocked entirely** — not traversable, full
stop, regardless of which of its edges the line actually crossed.

**(b) Every cell-to-cell edge the line crosses BETWEEN TWO CLEAR
(non-footprint) cells is also blocked**, even though neither adjacent cell
is itself footprint-blocked — a wall that only grazed their shared boundary
still cuts off that specific step between them.
`straightWallCrossedEdges` implements this: for every hex-adjacent pair of
cells where NEITHER side is in the footprint, test whether the wall's line
crosses their shared edge; a crossing (including a graze, via the same
`FOOTPRINT_EPSILON` tolerance) blocks that edge.

**Honestly-recorded finding**: for the CURRENT representation (`from`/`to`
anchored to cell CENTERS), (b) is provably empty in every case this unit
tested — 3 hand-derived geometric cases plus 400 randomly sampled cell pairs
(`straightWallGeometry.test.ts`'s own search, done while building this unit)
all produced zero both-clear crossings. This isn't a coincidence: a straight
line's path through a hex tiling is continuous, and every point where it
merely touches a boundary sits adjacent to a cell it's already clipping (the
line can't graze a shared edge between two clear cells without having
entered one of the two cells bordering that edge's own neighborhood first).
The mechanism is still real and implemented, not dead code — it's exercised
directly in the test file against a hand-placed segment collinear with one
real hex edge. **Update, corner-anchoring round**: this prediction — "load-
bearing the moment a wall's endpoints are no longer forced to cell
centers" — has now come true for real, not just as a forward-looking note.
Corner-anchored endpoints CAN produce a genuine both-clear-cells crossing
that the original cell-center-anchored representation never could (see this
section's own "a wall ending at a corner shared with a cell does not clip
that cell" boundary case, above) — mechanism (b) is exercised by real,
reachable `wallLines:` geometry now, not only by a hand-constructed edge
segment bypassing the normal endpoint representation.

### Corners: no special-case joining logic needed

Kirk's red-lines picture showed clean L corners where two segments meet.
This "just works" by construction, now at the finer corner lattice:
consecutive straight-wall segments that SHARE AN ENDPOINT CORNER (draw one
from A to the corner, a second from that same corner to C) resolve to the
exact same `cornerPoint(...)` world point — the two lines touch exactly,
with no gap and no special corner-detection code, EVEN when the two
segments address that corner via DIFFERENT (but canonically equivalent)
owner cells (`hexCorner.ts`'s `sameCorner`/`canonicalCorner` — see this
file's own "corner anchoring" section above for the dedup rule).
`straightWallGeometry.test.ts`'s "corner/L continuity" test and
`hexCorner.test.ts`'s own dedicated coverage assert this directly rather
than trusting it by construction alone.

### Interaction: axis snap, then closest-available corner

Drag locks to whichever of 2 screen-space axes (vertical/horizontal) the
drag's own direction is closer to, past a small movement threshold (mirrors
the existing zigzag Wall tool's family-lock UX, `pickStraightAxis` a 2-way
analog of `dragFamily`'s 3-way pick). 60°/120° diagonal snapping was
considered and skipped this round — cheap to add later (widen
`pickStraightAxis`/`snapStraightEndpoint` to 4 target directions using the
same scoring search) but not needed to prove the footprint mechanic, which
is this unit's actual point.

Because this is a discrete hex grid, an EXACT vertical/horizontal line
generally isn't reachable between two lattice corners at all (see above —
no edge family is horizontal, and vertical only lines up exactly for
specific from/to pairs). `snapStraightEndpoint` searches a small window of
cells around the pointer's own nearest corner — checking all 6 of each
candidate cell's own corners, not just cell centers — and picks whichever
candidate corner keeps the locked axis's OTHER world coordinate closest to
the starting corner's own — the closest AVAILABLE approximation, not a
mathematically exact one. The footprint is always computed honestly from
whatever line actually results, never from a pretended-exact one.

### Endpoint fine-tuning: draggable handles, corner-to-corner snapped

The second half of Kirk's "it always hangs over" feedback — corner
anchoring fixes the coarseness of the anchor lattice, but an author still
needs a way to move an already-drawn wall's endpoint onto a DIFFERENT
corner without deleting and redrawing the whole line. Selecting a straight
wall (click its line — no longer deletes, see below) shows two small
draggable handle circles at its `from`/`to` corners; dragging one snaps it,
corner-to-corner, to the nearest lattice point under the pointer
(`nearestCorner`), with the footprint/crossing overlay updating live during
the drag. Dropping a handle onto the line's OTHER endpoint (collapsing it to
a single point) is rejected, not silently clamped elsewhere — the author
sees why nothing moved rather than the handle jumping somewhere unrequested.
The YAML pane remains the exact-edit path underneath all of this — corner
coordinates are meaningfully hand-editable now, not just drag-adjustable.

**A necessary UX trade-off, named explicitly**: the original prototype's
click-on-an-existing-line-to-delete-it gesture is retired — a click now
SELECTS (shows the handles) instead. Deleting a selected straight wall moved
to the Delete/Backspace key, mirroring the existing global delete gesture
this concept's edit-mode placements already use
(`DungeonBuilderConcept.tsx`'s own keydown handler) rather than inventing a
new convention. This was necessary, not incidental: click-to-select and
click-to-delete are mutually exclusive interpretations of the same gesture,
and endpoint fine-tuning is only reachable through selection.

### Doors: a carved OPENING at a specific cell, not a property of the whole line

The original prototype's `kind: solid | door` lived on the WHOLE line — Kirk,
directly: "I cannot set a wall or a door — just realized the gashes are
walls," and separately, after seeing a `kind: door` line rendered: doors were
"still visually/semantically hex-edge creatures" — a whole long wall segment
re-colored amber, with no real opening carved anywhere along it (the
footprint math never read `kind` at all; a "door" wallLine was exactly as
impassable as a "solid" one). An entire multi-cell wall being "a door" never
made physical sense in the first place — a door is a point-sized opening IN
a wall, not a wall that IS a door.

**Chosen shape: `doors: [{cell: [c, r]}]`** — a list on each `wallLines:`
entry, each referencing ONE footprint cell the line otherwise blocks. Zero
or more per line (a list, not a single optional field) so a wider opening —
double doors spanning 2 cells — is just two entries, no special case.

**Alternative considered and rejected: `doors: [{at: t}]`**, a continuous
parametric position (0..1) along the line. Weighed seriously — a server
compiler already has to walk the line's own `[t0,t1]` clip intervals
cell-by-cell to derive the footprint in the first place
(`clipSegmentToShrunkHex`), so mapping a `t` to "which cell" would be a
direct reuse of that same machinery, not new complexity. Rejected anyway for
two reasons that outweighed that convenience:

- **Editing robustness.** A `t` value's meaning depends on exactly how the
  line is parameterized end-to-end. The moment an author fine-tunes an
  endpoint (the handle-drag feature above), the line's geometry changes and
  a stored `t` could silently drift to point at a DIFFERENT cell than the
  one the author actually meant — a real, if narrow, class of "the edit
  moved something the author didn't touch" bug. A `cell:` reference stays
  anchored to a real, named cell regardless of small endpoint adjustments;
  if the edit shrinks the footprint enough that the door's cell falls out of
  it entirely, that's a detectable, FLAGGABLE state (see below), not a
  silent repositioning.
- **Author-UX and consistency.** Every other coordinate in this whole
  dialect (`place.at`, `start`, `end`, `walls:`, wallLine `from`/`to`
  themselves) is `[col, row]` cell-space. A `t`-parameterized door would be
  the one construct in the file an author can't reason about by looking at
  cell coordinates — clicking a point on the rendered line and resolving it
  to the nearest real cell (`wallLineDoorCellAt`) is both simpler to
  implement AND simpler for a hand-editor typing directly into the YAML
  pane to understand and adjust.

**Exact traversability semantic, precisely, for whoever compiles this**: a
door's `cell` is excluded from ITS OWN wallLine's footprint entirely — as if
that line's clip never touched it. Mechanically: `straightWallFootprint`
takes an optional `doorCells` exclusion set; a door cell is removed from the
raw clipped result. Because `straightWallCrossedEdges`'s own "skip a crossing
if either side is footprint-blocked" rule (movement semantic (b), above)
reads the SAME footprint set, a door cell excluded from the footprint
automatically participates in the (b) crossing-check as an ordinary CLEAR
cell too — its boundary crossings toward neighboring cells become subject to
the normal both-clear-cells test, no separate "door crossing" mechanism
needed. **The whole semantic is "this cell acts as though the wall line
never clipped it at all," nothing more, and nothing less** — a door only
reverses THIS line's own claim on that cell; something else (another
wallLine, an edge wall, an obstacle prop) can still legitimately block it
independently.

**A door must reference one of the line's own RAW (door-blind) footprint
cells to mean anything** — `isValidDoorCell` is the exact check. A door left
STRANDED by a subsequent endpoint drag (the footprint shrank out from under
it) is FLAGGED with a ⚠ marker at that cell, not silently dropped — same
"flag, never silently delete or move" discipline this section's own
"Interactions with everything else" subsection already follows for
placements/start/end/regions.

**Rendering**: the solid line stroke is simply not drawn across a door's own
clip interval (a visible gap), with a small amber hinge-dot marker at the
opening's midpoint — the same hinge-dot visual language the edge Wall/Door
pair's own per-edge door already uses, now placed mid-line instead of at an
edge's own midpoint. The Door tool, with a straight wall's line clicked,
resolves the click to the nearest real footprint cell along the line
(`wallLineDoorCellAt`: project the click onto the line, then find which
cell's own `[t0,t1]` clip interval contains that point) and toggles a door
there — add if absent, remove if present, the same symmetric affordance the
edge Wall/Door pair already gives `doc.walls`.

**A genuine, honestly-recorded gap, not silently ignored**: this round's
door model is scoped to footprint CELLS only. Corner anchoring is exactly
the change that makes movement semantic (b) reachable in isolation — a wall
segment that merely GRAZES a shared edge between two clear cells without
clipping either one (see "Honestly-recorded finding," above, now updated) —
and `doors:` has no address for THAT case: an opening on a purely-grazed
EDGE with no clipped cell to reference. Scoped out deliberately this round
(the common, expected case — an author punching a cell-wide opening in a
wall — is what `doors:` covers), named here so whoever picks this up next
doesn't rediscover the gap from scratch.

### Interactions with everything else on the board: flag, never silently delete or move

Per this file's own discipline elsewhere (a mapped top-level placement, an
inherited default) — a straight wall's footprint landing on existing
content is FLAGGED, not silently deleted or relocated:

- **Placements** (`doc.place`) inside a footprint render an extra warning
  ring + "⚠ IN WALL FOOTPRINT" label, live, including while a wall is still
  being dragged (not just after release) — the placement itself is
  untouched.
- **Start/End** reuse `Board.tsx`'s own "⚠ ... (BLOCKED!)" visual language
  verbatim (the same convention edit mode's entrance-blocked check uses)
  rather than inventing a new one.
- **Region cells** (`doc.regions`) inside a footprint get a small ⚠ glyph
  overlaid on the affected cell — the region's own `cells:` membership is
  never rewritten by a wall mutator, per the settled model's own "an inner
  wall never splits a semantic region" rule (this file's "regions:"
  section).
- **A door stranded by an endpoint drag** (its `cell` no longer part of the
  line's own raw footprint) gets its own ⚠ marker at that cell — see the
  "Doors" subsection above. The `doors:` entry itself is left untouched,
  same principle as every other case here: flag, don't silently repair or
  delete.

### Compiler responsibilities (server-authoritative, this is a preview)

Per this file's own operating principle (client viz previews what a real
compiler will own): a real implementation would derive footprint cells and
blocked crossings SERVER-SIDE from the authored `wallLines:` list, the same
way `walls:` compiling to canonical `HexRecord.edges` is already the
documented plan for edge-native walls. This concept's client-side
`straightWallGeometry.ts` is that computation done once, client-side, for
live visual feedback — not a claim that the client is the source of truth.
This now includes the door-exclusion step (`doorCells` parameters on
`straightWallFootprint`/`straightWallCrossedEdges`) and the corner-lattice
resolution (`hexCorner.ts`'s `cornerPoint`) a real compiler would need too —
see the "Doors" and "Corner anchoring" subsections above for the exact
semantics/addressing a server-side implementation should match.

### `stripToV1Subset`

`wallLines:` drops entirely, same treatment as `walls:` (no v1 analog at
all), counted and reported SEPARATELY in the compile-badge/dropped summary
("N straight walls", never folded into the edge-wall "N walls" count) —
they're genuinely different constructs, and conflating their counts would
misrepresent which tool an author actually used. A line's own `doors:`
entries are nested data on a construct that already has no v1 analog at
all — they drop along with their parent line, with no separate count of
their own (counting "doors" as a sibling tally to "straight walls" would
misrepresent them as an independent authoring action, when they only ever
exist attached to a wallLine that's already being dropped).

## Top-level placement: rooms are semantic, not placement containers

Every `place:` in dungeonspec v1 lives inside a room — that's not
incidental, it's the v1 heritage: a room is what a placement has always
needed to exist at all. The target dialect keeps that as real,
v1-expressible content, but stops treating it as the ONLY shape a
placement can take. A TOP-LEVEL `place:` (a sibling of `rooms:`, not
nested inside one — see the annotated example above) carries the exact
same fields a room-scoped entry does — `ref`, `at`, `facing`,
`mount`/`height`, `targeting`, `blocks_movement`/`blocks_los` — the only
difference is that `at` is unconditionally absolute (a room-scoped
entry's `at` is room-local, added to that room's compiled
`start_column`) and there is no owning room at all. That does not weaken
rooms into disposable geometry: they remain stable semantic regions owning
reveal, placement, spawning, scripting, and archetype meaning. They are not
**existential** placement containers — a placement does not stop being real
just because no room claims it yet.

This is what makes `rooms: []` a genuinely complete, non-fictional
from-scratch canvas: nothing needs to pretend a room exists just to give
a placement somewhere to live. `dungeonYaml.ts`'s mutators
(`placeItem`/`movePlacement`/`deletePlacement`/`setPlacementFlags`/
`setPlacementMount`/`setPlacementTargeting`/`setPlacementFacing`) all
take `roomId: string | null` now — `null` writes to the top-level
`place:` list, a real id writes into that room's own, and it's the exact
same function either way (`dungeonYaml.ts`'s `placeSeq` helper resolves
which list before any of them touch the CST).

**Boss stays room-scoped, deliberately, even in the target dialect.**
`dungeonspec`'s `validateBossCardinality` needs an owning
`archetype: boss` room — there is no "boss, unattached to anything" that
means something server-side, today or in any near-term plan, so there's
no honest top-level `boss:` to propose. A from-scratch canvas ("New
Dungeon," `rooms: []`) has no boss-archetype room yet, so its own Boss
tool currently rejects with an honest message rather than either
crashing (the real failure mode discovered building this — `moveBoss`
throws on a room with no existing `boss:`) or silently doing nothing.
When the target dialect eventually frees boss placement from a room
requirement — the same organizational-not-existential move `place:` just
made — that's real, separate future work; it needs dungeonspec's own
cardinality rule to change first, not just this concept's authoring
surface.

### `stripToV1Subset`'s conversion: map down, or drop and say so

A top-level placement has no v1 analog — dungeonspec only ever reads
room-scoped `place:`. `stripToV1Subset` resolves this the same way it
resolves every other target-dialect-only construct — convert what can honestly
convert, drop and count what can't:

- If the placement's absolute column falls inside a DECLARED room's own
  column range (computed with the same `start_column` accumulation rule
  the real server uses — `next.start_column = prev.start_column +
prev.width + 1`), it's **mapped down**: `at` converts absolute →
  room-local, and the entry moves into that room's `place:` list. This is
  not a loss — v1's room-scoped `place:` is a real, compilable subset of
  what a mapped entry meant, the same as any other v1-subset conversion
  elsewhere in this file.
- If it falls outside every declared room's range, it's **dropped**,
  counted honestly like every other target field this file strips.

Both outcomes are named in the compile badge ("Uses: N top-level
placement(s)...") — a mapped placement is genuinely IN USE even though
it isn't lost, so it has to show up there too, worded so the same list's
other job (the post-save "Dropped: ..." honesty note) doesn't
misleadingly claim something that survived was erased.

### What this file tried first, and why that was wrong

An earlier round tried a different bridge for the exact same "a
from-scratch canvas has no room to hold a placement" gap: a single
SYNTHETIC room (`id: "canvas"`, `archetype: canvas`) that every
placement got nested under, invented specifically so the existing
room-scoped mutators wouldn't need to change at all. It worked, and it
shipped for one round. It was also wrong in exactly the way Kirk's own
framing warns against: "we cannot be held down by our early ideas" isn't
just about not being SLOW to add new fields — a synthetic room bakes
room-scoping's status as EXISTENTIAL (rather than organizational) one
level deeper into the artifact, since now a fictional room has to exist
to make the old assumption keep looking true. The fix wasn't cheaper
than the honest one; it just deferred where the assumption lived. Top-
level `place:` is the version that actually changes the assumption
instead of working around it — record this here, not silently erase the
git history, so a future reader who finds a stray `archetype: canvas`
reference in an old commit understands it was a real, reasoned dead end,
not an oversight.

## `place:`/`boss:` facing

Any `place:` entry or a room's `boss:` entry may carry an optional
`facing:` key, one of `E | NE | NW | W | SW | SE` — reusing the SAME
6-direction hex-facing convention already defined in this codebase
(`src/components/hex-grid/authorGridHelpers.ts`'s `HEX_FACING_LABELS`),
not a new rectangular 4/8-way compass. Deliberate: the codebase already
has exactly one facing convention (defined for the hex-true board,
currently mechanically inert per that file's own doc comment) — inventing
a second, incompatible one for board authoring would create a
reconciliation problem the moment both became real at once. 6 directions
spaced 60° apart is a hex-native division of the circle, and reads
naturally on the hex-true board — the tension this used to name against
a flattened/rectangular comparison mode no longer applies: that mode was
explored and rejected (Kirk, 2026-08-02: "I like hex. turning them into
squares feels way off and not what it will actually look like" —
CONTRACT.md's "Flattened layout mode: explored and rejected"), so
hex-true is grounded as the only board this convention has to read
naturally on.

## z-axis: `mount` + `height`

The dialect's first departure from the floor plane. Every coordinate
elsewhere in this file (`place.at`, `walls`, `holes`, `start`, `end`) is
a 2D `[col, row]` — the floor plan is flat. Wall-mounted props (banners
today; sconces/trophies/shields later) don't sit on the floor at all,
which the schema had no way to say until now.

```yaml
- {
    ref: 'dnd5e:props:wall-banner',
    at: [2, 0],
    mount: wall,
    facing: SE,
    height: 2.0,
  }
```

- **`mount`**: `floor` (default, omit it) | `wall`. Whether this
  placement stands on the floor or hangs on a wall.
- **`height`**: meters above the floor. **DECOUPLED from `mount`**
  (Kirk-batch, 2026-08-02: "height: decouples from mount... any
  placement may carry height (floating candles); mount:wall remains the
  wall-flush case"). A `mount: wall` placement typically still carries
  it (how far up the wall it hangs), but so can a `mount: floor`
  placement — a floating decoration (a candle, `blocks_movement: false`
  so it stays passable) hovering above the floor plane, unrelated to any
  wall. Omit for the common case: a floor-standing prop whose vertical
  position is derived from its own model, same as before this field
  existed.

```yaml
# a floor-standing floating candle -- no mount:, height alone.
- {
    ref: 'dnd5e:props:candles',
    at: [4, 4],
    height: 0.5,
    blocks_movement: false,
    blocks_los: false,
  }
```

**Why this shape and not a bare `z: <number>` field**: a raw Z offset
answers "how high" but not "on which surface, positioned how" — `mount`
carries the intent (this is WALL furniture, not a floating floor prop
someone nudged upward), which is the thing a renderer actually needs to
decide HOW to place it, not just where. And it deliberately reuses two
fields that already exist rather than inventing a parallel
wall-reference system: `at` says which cell the prop is near, `facing`
(already real, see above) says which of that cell's edges/walls it
mounts on — the same 6-direction convention every other facing use
already reads. `height` is the one genuinely new field.

**What the wire/renderer would need, if this becomes real**: `PlacedEntry`
(`rpg-toolkit/encounter/dungeonspec/spec.go`) would grow `mount`/`height`
fields alongside `ref`/`at`/`blocks_movement`/`blocks_los`. The 3D
renderer (`PropModel.tsx`) would need to read `mount: wall` +
`facing` + `height` and compute a wall-relative position/rotation
instead of the floor-center placement it does today for the wall case,
and a simple vertical offset above the floor plane for the
`mount: floor` + `height` case — both real, scoped pieces of render
work. This concept's own 3D preview (`DungeonPreview3D.tsx`) already
does both (verified live, CONTRACT.md's "height decouples from mount"
section) — the real game's renderer does not yet.

**Was an open question, RESOLVED 2026-08-02 by Kirk's own hands in live
play: is 6-direction hex facing too coarse for a wall-mounted prop?**
Originally recorded per Kirk's 2026-08-02 ask alongside the wall-mount
rotation bug that surfaced it, with two live options and neither chosen.
Both halves are now settled:

- **The rotation-MATH half.** Kirk: "fine tuning is cool for sure but
  the other direction is a 30 deg to be flat on the wall." That 30° is
  the pointy-top interleave between neighbor/facing directions and edge
  orientations — the two are never aligned by construction, so
  `facing`'s 6-direction ENUM can never produce a wall-flush rotation by
  stepping alone, no matter how it's wired. This confirms (doesn't
  change) the direction `wallMountRotationY` already took: orientation
  is EDGE-derived (`hexEdgeBetween`), never `facingToRotationY`'s literal
  enum-to-angle mapping. **Resolved model**: floor-standing props keep
  `facing` as the plain 6-direction neighbor enum (never in question);
  wall-mounted props derive orientation from the edge, with the
  `rotate_degrees` EXPERIMENT (`dungeonYaml.ts`'s own doc comment) as an
  optional fine offset WITHIN that edge's plane — re-scoped by this
  finding from "an independent granularity to compare" to "the correct
  within-edge fine control," which is what it always functionally was
  once the edge, not the enum, is understood as the base rotation.
- **The edge-SELECTION half.** A distinct gap the math being correct
  didn't fix: Kirk, same session — "I can only line up 1 direction —
  flush with a wall on one side but not the other — oh that is which
  tile I put it on, but still." Which wall EDGE a mount uses was
  implicit (nearest/facing-implied), not an explicit, steppable choice.
  **Resolved**: the Inspector's facing stepper, for `mount: wall`
  placements only, now cycles exactly the owning cell's wall-BEARING
  edges (`boardGeometry.ts`'s `wallBearingFacings`/`stepWallFacing`) —
  skipping any of the 6 directions with no real wall to be flush
  against — plus a "flip to other side" affordance that moves the
  placement to the wall's far cell and mirrors facing, one click instead
  of delete-and-replace. See CONTRACT.md's "Wall-mount edge-selection
  rework" section for the full landing writeup and live verification.

**Update, 2026-08-03 — "nothing left open" was true for wall-mounted
props specifically, not for the fine-rotation field in general.** See
"Fine rotation, generalized to floor-standing props" below for the gap
this missed: `rotate_degrees` had been scoped to `mount === 'wall'`
placements from the moment it was introduced, which silently meant a
FLOOR-standing prop had zero fine-rotation control at all — the same
interleave finding above applies to a floor prop sitting next to a wall
just as much as to one mounted ON it, and nothing before this date had
generalized the field to say so. A possible future refinement (not
queued, not asked for): the `flip to other side` affordance is edit-mode
only today (no compiled `FloorPlan` exists in creation mode to validate
the far cell against) — extending it there would need a canvas-bounds-based
validity check instead of a `FloorPlan`-based one.

## Fine rotation, generalized to floor-standing props (2026-08-03)

Kirk, reporting a regression after the wall-mount edge-selection rework
above shipped: "we lost the ability to fine tune the rotate or more
importantly to adjust it the 30 [degrees] so on some hexes it can be
flush with the wall." Git archaeology (not guessed — walked every commit
that touched `rotate_degrees`/`Inspector.tsx`'s rotation section) found
**no code regression**: the fine-rotation slider was gated to
`mount === 'wall'` from its very first commit (#683, "free-rotation
prototype for wall-mounted props") and every subsequent PR that touched
this area (#686's wall-mount edge-selection rework, #688's height
decouple) deliberately preserved that scope rather than widening it —
#688 even named the asymmetry explicitly in its own code comment
("Rotation stays mount-gated, deliberately... height no longer is").
So this was **over-narrowing, not data loss**: the control was built and
gated as a wall-mount-only experiment from day one, and the underlying
`rotationDegrees` field/mutator/strip handling in `dungeonYaml.ts` never
actually checked `mount` at all — only the Inspector's render condition
did. Kirk's report is the correct signal that the original scope was too
narrow, not evidence of a bug.

**Why floor props need this just as much as wall mounts do.** The same
geometry fact drives both: a hex's 6 neighbor/facing directions
(`facingToRotationY`'s angle set, `{0°,60°,...,300°}`) and its 6 edge
orientations (`wallMountRotationY`'s angle set, `{30°,90°,...,330°}`) are
two DIFFERENT sets, interleaved 30° apart — verified numerically, not
assumed (`boardGeometry.test.ts`'s `facingToRotationY / wallMountRotationY`
suite). A floor-standing prop's `facing` enum can therefore never land
exactly edge-parallel (flush) against an adjacent wall by stepping alone,
for exactly the same reason a wall-mounted prop's facing enum couldn't —
`mount: wall` was never actually what made the enum insufficient; being
NEXT TO or ON a wall is.

**Resolved model**: `rotationDegrees` (`rotate_degrees:` in YAML) is now
available on ANY non-monster placement, not gated on `mount`:

- **`mount: wall`**: unchanged — offsets the coarse `wallMountRotationY`-
  derived flush rotation within that edge's own plane, same as before.
- **Floor-standing** (`mount` unset or `'floor'`): offsets the coarse
  `facingToRotationY(facing)` base angle instead. Meaningless without a
  `facing` set (there's no base angle to nudge) — the Inspector disables
  the slider in that state with an honest hint, rather than letting it
  silently no-op.
- **Range stays ±30°**, unchanged — this was never an arbitrary choice
  to begin with (half of one 60° facing step), and the interleave
  geometry above means ±30° exactly covers the reachable gap for BOTH
  branches: any wall-flush angle is reachable as some floor `facing` ±30°
  gets no closer or further whether the placement is mounted on the wall
  or standing next to it.
- **Monsters are excluded, named honestly rather than silently omitted**:
  `PreviewMonsterModel.tsx` (the 3D preview's monster renderer) has no
  `rotationY` prop at all — a monster placement's `rotate_degrees` would
  parse and strip correctly but render with zero visible effect. Same
  `isMonster` gate `blocks_movement`/`blocks_los`/height already use.

**"Snap flush to nearest wall"** — a new Inspector button, floor-standing
placements only (a `mount: wall` placement is already flush by
construction once on a real wall-bearing edge). Kirk's actual use case
was never "give me a slider," it was "make this prop flush" — a bare
slider makes the author find the right angle by feel/trigonometry, which
is exactly the friction the "30 deg to be flat on the wall" report was
about in the first place. The button computes the exact
`(facing, rotationDegrees)` pair via `boardGeometry.ts`'s
`computeFlushRotation` (round-trip-verified against `wallMountRotationY`'s
real edge-flush angle in `boardGeometry.test.ts`, not just spot-checked)
and sets both fields at once. Disabled with an honest tooltip when the
cell has no adjacent wall to snap to.

Verified live: see CONTRACT.md's "Fine rotation, generalized to
floor-standing props" section for the browser walkthrough (a floor prop
placed next to a wall, snapped flush via the button, screenshot
evidence).

**Update, 2026-08-02 — the second option now exists as a live, testable
prototype, not just a described option.** `PlacementDoc.rotationDegrees`
(`rotate_degrees:` in YAML) is an ADDITIVE fine adjustment, ±30°, layered
on top of the coarse `facing`-derived flush rotation for `mount: wall`
placements only — never a replacement for `facing`, and never proposed
as a target-dialect field (see its own doc comment in `dungeonYaml.ts`
and the `ExperimentBadge` in `Inspector.tsx`). Both controls — the
existing 6-direction facing stepper and this new fine-rotation slider —
are visible and independently settable on the Inspector at the same
time, so the two granularities can be felt side by side on the same
object rather than argued about in the abstract.

**Resolved, 2026-08-02, by Kirk's own hands in live play**: "fine tuning
is cool for sure but the other direction is a 30 deg to be flat on the
wall." The question above is now answered, not still open: a
wall-mounted prop's flush rotation must be EDGE-DERIVED
(`hexEdgeBetween`, what `wallMountRotationY` already computes), never
`facing`'s 6-direction ENUM stepped directly (`facingToRotationY`) — the
30° Kirk found is exactly the pointy-top interleave between neighbor/
facing directions and edge orientations, which are never aligned by
construction, so no amount of stepping the enum could ever land flush.
The resolved model, going forward:

- **Floor-standing props**: `facing` stays the 6-direction neighbor-
  direction enum, unchanged — it was never the thing in question.
- **Wall-mounted props**: orientation is EDGE-derived (this file's own
  `wallMountRotationY`/`hexEdgeBetween` convention), with an optional
  fine offset WITHIN that edge's plane for sub-30° adjustment — the
  free-rotation prototype's additive `rotate_degrees` field, re-scoped
  by this finding from "an independent granularity to compare" to "the
  correct within-edge fine control," which is what it always
  functionally was once the edge (not the enum) is the base rotation.
  The 6-direction facing enum does not apply to how a mount orients
  against its wall.

**Still open, queued as the next round** (a distinct gap from the
rotation-math question above, which this data point closes): WHICH edge
a mount uses is currently implicit — Kirk, same session: "I can only
line up 1 direction — flush with a wall on one side but not the other —
oh that is which tile I put it on, but still." Queued: (1) restrict the
`facing` stepping interaction, for `mount: wall` placements only, to
cycle through the OWNING CELL's wall-bearing edges specifically (skip
edges with no wall), making edge choice explicit and authorable with the
existing field rather than implicit/nearest; (2) a "flip to other side"
Inspector affordance — move the placement to the wall's far cell and
mirror facing, one click instead of delete-and-replace, disabled with an
honest tooltip when the far cell is out of bounds or not a floor cell.

## Monster targeting

`place:`/`boss:` entries for a monster ref may carry an optional
`targeting:` key — a REFERENCE to an AI strategy, never behavior itself
(the Boundary Rule this whole codebase runs on: client/author sends
keys, the toolkit's monster decision chain is what would give a key
meaning).

```yaml
- {
    ref: 'dnd5e:monsters:skeleton-captain',
    at: [7, 2],
    targeting: lowest-health,
  }
```

Proposed starting vocabulary: `lowest-health | lowest-ac | closest`.
This is deliberately NOT an exhaustive list — it's a starting set, and
every value in it is, functionally, **an open feature request against
the toolkit's monster-AI work**, formalizing the loop Kirk's already
described informally: an author picks a targeting behavior they want
while placing a monster, the builder can only capture the KEY (never
implement the strategy — that would be calculating a rule client-side,
exactly what the Boundary Rule forbids), and the toolkit's monster
decision chain is the only place `lowest-health` etc. can ever mean
anything. A `targeting:` key with no matching toolkit strategy is not an
error in this concept — it's a recorded ask, same status as any other target-dialect-only
field: authored, badged, not yet compiled.

UI this round: a targeting dropdown in the monster/boss inspector,
badged as target-dialect-only like every other Structural/Markers control.

## `defaults:` — dungeon-wide, ref-keyed default fields

Kirk's ask, verbatim: "maybe we can set a default for all skeletons." A
dungeon-wide, ref-keyed map — target dialect, proposed, same status as
every other construct in this file. A placement's own explicit field
always overrides its ref's entry here; when it doesn't set the field at
all, it inherits the ref's default.

```yaml
defaults:
  'dnd5e:monsters:skeleton': { targeting: lowest-health }
  'dnd5e:props:candles': { blocks_movement: false, height: 1.2 }
```

### Defaultable fields, and why each one qualifies

| Field             | Why it's defaultable                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targeting`       | Purely a property of the REF (a skeleton's preferred AI strategy doesn't vary by which cell it's standing in) — the textbook case for a ref-level default.        |
| `blocks_movement` | Usually a property of what the prop IS (a pillar always blocks; a candle never does) — an instance overriding it is the exception, not the rule.                  |
| `blocks_los`      | Same reasoning as `blocks_movement` — most props of one ref agree on whether they block sight, and per-instance overrides stay rare and worth flagging as such.   |
| `height`          | A ref usually has one natural resting height (a floating candle floats every time) — worth stating once per ref rather than repeating on every placement.         |
| `facing`          | Some refs have a natural canonical orientation (a wall-banner ref that's always hung one way) even though most individual placements still want their own facing. |

### `mount` is deliberately NOT defaultable

Every other field above is a property of the REF. `mount` isn't: WHICH
wall edge a `mount: wall` placement uses is a property of the specific
CELL it sits in (see "wall-mount edge-selection rework" under "z-axis:
`mount` + `height`," above) — two placements of the identical ref at two
different cells can need two different edges, or one might not even be
adjacent to a wall at all. A single ref-level default has no one honest
value to carry, so `mount` stays a purely per-instance field with no
inheritance path.

### Inheritance lives in an accessor, not in the parse

`resolvePlacement(doc, placement)` (`dungeonYaml.ts`) is the ONE place
this inheritance is resolved: it returns the placement's effective
`blocksMovement`/`blocksLos`/`height`/`facing`/`targeting`, using the
placement's own field wherever it's explicitly set and falling back to
its ref's `defaults:` entry otherwise, plus an `inheritedFrom` map saying
which fields came from the default. Deliberately NOT resolved at parse
time and NOT written back into the document — `PlacementDoc`'s own
fields stay exactly what's literally on that instance (a placement
without an explicit `height` still parses to `height: null`, `defaults:`
or no `defaults:`), and telling "explicitly absent" apart from
"literally false/null" is what `PlacementDoc.explicit` (a small
`{ blocksMovement, blocksLos, height, facing, targeting }` boolean
companion, populated straight from which raw YAML keys were actually
present) exists for.

This keeps the serialized YAML SPARSE: a placement only ever carries
`defaults:` itself plus whatever explicit overrides genuinely differ
from the default, never every inherited value stamped onto every
instance. Any consumer that renders a placement's fields — the board,
the 3D preview, the entrance-blocked check — must read them through
`resolvePlacement`, not off `PlacementDoc` directly, once a document has
any `defaults:` at all; reading the raw field would silently miss an
inherited value (a defaulted `height` that should float a candle, a
defaulted `blocks_movement` that should trip the entrance-blocked
warning). `DungeonPreview3D.tsx`'s placement builder and
`boardGeometry.ts`'s `isEntranceBlocked` both do this now.

### Inspector: inherited vs. explicit, override-in-place, revert-to-default

A field currently following its ref's default renders muted with a small
"inherited" tag, distinct from the existing "dialect"/"experiment"
badges (those mark a CONSTRUCT as not-yet-compiled; "inherited" marks a
VALUE as not-this-instance's-own — a field can be both at once, and a
reader needs to tell the two facts apart). Editing any control always
writes an explicit value on THAT placement — override-in-place needs no
separate affordance, since every setter (`setPlacementFacing`,
`setPlacementHeight`, `setPlacementTargeting`, `setPlacementFlags`)
already writes a literal value the moment an author touches it. A
"revert to default" button appears only when a field is BOTH explicit
on this placement AND has a ref-level default to fall back to (nothing
to revert to, or from, otherwise) — it deletes the explicit key rather
than re-setting it to match the default's current value, so the
placement goes back to genuinely INHERITING (and keeps tracking the
default if it changes later, rather than freezing a copy of today's
value). `blocks_movement`/`blocks_los` route through a dedicated
`clearPlacementFlag` mutator for this, since the board's own flag
checkboxes (`setPlacementFlags`) always want to write both fields
explicitly and have no reason to ever delete them.

**A named, honest limitation, not silently glossed over**: for
`height`/`targeting`/`facing`, "clear this field" and "revert to
default" are the SAME action (calling the field's existing
`setX(cst, ..., null)`, which deletes the key) — there is no way to
author "explicitly no height, overriding a ref default that provides
one" today, because absence of the key IS the inherit signal. Concretely:
unchecking an inherited `height` checkbox is a documented no-op (nothing
explicit exists yet to delete), so the value keeps floating until either
overridden with a real number or the ref default itself is cleared. This
never corrupts state — it's a UX rough edge, not a data bug — and is
recorded here rather than worked around with a new explicit-null
sentinel, which would be a real schema decision (`height: null` written
literally IS already distinguishable from absence by
`PlacementDoc.explicit`, so the plumbing exists — nothing currently
writes that value on purpose) worth deciding deliberately, not as a
side effect of this prototype.

### Board/3D rendering uses RESOLVED values

A defaulted `height` floats the candle in `DungeonPreview3D.tsx` exactly
like an explicit one would; a defaulted `blocks_movement` trips
`isEntranceBlocked`'s warning exactly like an explicit one would. Both
consumers call `resolvePlacement` now rather than reading
`PlacementDoc.height`/`blocksMovement` directly — see "Inheritance lives
in an accessor," above.

### `stripToV1Subset`: `defaults:` drops, but MATERIALIZES first

`defaults:` itself is target-dialect-only and is dropped like any other
construct in "The v1-subset strip," below — but not silently. Before it's
removed, every placement that INHERITS a `blocks_movement`/`blocks_los`
value from its ref gets that value baked onto it as a literal key first
(`materializeRefDefaults` in `dungeonYaml.ts`), so the compilable subset
preserves the authored behavior the default was standing in for — a
`blocks_movement: true` default silently vanishing on save would
reintroduce exactly the entrance-blocked gap this file's own UX learning
exists to catch, just moved from the live board to the saved document.
`targeting`/`height`/`facing` have no v1 wire representation at all,
inherited or not, so they simply drop — counted the same way an explicit
one would be, via the existing per-field facing/height/targeting tallies
"The v1-subset strip" already describes; they are NOT double-counted
against the `defaults (...)` entry. Monster placements are skipped
entirely (dungeonspec rejects `blocks_movement`/`blocks_los` on a
monster ref) — a monster ref's `defaults:` entry is only ever meaningful
for `targeting`, which materialization doesn't touch anyway since it has
no v1 form to preserve.

### Open questions this prototype records, and deliberately does NOT decide

- **Does `defaults:` apply to a room's `boss:` entry?** Not implemented
  either way here — `resolvePlacement` only ever takes a `PlacementDoc`,
  never a `BossDoc`, so a `defaults:` entry matching a boss's own ref is
  simply inert today (confirmed by this unit's own test: a
  `targeting` default for the exact ref a room's `boss:` uses does not
  change `BossDoc.targeting`). `BossDoc` doesn't even carry
  `blocksMovement`/`blocksLos`/`height` fields at all (a boss isn't wall
  furniture) — only `facing`/`targeting` would be in scope if this were
  ever decided yes.
- **Wildcard/category keys** (e.g. "all monsters," "all props") — the
  map today is keyed by an exact ref string only; nothing here proposes
  or implements a broader match.
- **Interaction with a future toolkit prop registry** — if a real
  prop/monster registry ever grows its OWN server-side defaults (a
  registry-level "skeletons block movement by default" fact, as opposed
  to this dungeon-level authoring convenience), the two would need a
  reconciliation rule (which wins? does a dungeon-level default only
  override a registry default, or can it also unset one?) that this
  prototype does not attempt to answer.

## Why connectors have no add/remove UI, and what that means for walls

Verified against the real Go source
(`rpg-toolkit/encounter/dungeonspec/validate.go`'s `validateChain`), not
guessed: a spec must have EXACTLY `len(rooms)-1` connectors, and
connector `i` must ALWAYS join `rooms[i]` to `rooms[i+1]`. `from`/`to` are
a pure function of room declaration order — never independently
authorable, no arbitrary pairs, no skipping a room. The only field a
connector's author-facing surface actually varies is `locked:`.

This is precedent for `walls:`, not just a connector-specific
fact: when/if a wall schema becomes real server-side, keeping the same
discipline (position/topology mostly server-derived or tightly
constrained, only the gameplay-relevant knob author-facing) is a
reasonable default to reach for FIRST, rather than assuming full freeform
placement is the only option. This concept's own `walls:` are currently
freeform (any `[col,row]` pair, any edge) because nothing server-side
constrains them yet — that's a property of "not real yet,"
not a design recommendation for what a real wall schema should allow.

**The bigger consequence of this constraint: v1 can only express LINEAR
dungeons.** `rooms[i]` always connects to exactly `rooms[i+1]` and
nothing else — no room can have two doors leading to two different
places, no loop, no branch. Every dungeon this schema can compile today
is topologically a single hallway of rooms. That's not a missing
feature so much as the CURRENT shape of "connector" itself: a connector
is defined as "the gap between adjacent declared rooms," which only
has one meaning in a linear chain.

**The linear chain is a current encoding, not the permanent geometry
model.** Once authored canonical edges and cell-authored semantic regions are
compiled, a room means a stable gameplay region, not one link in an ordered
array. Doors are openings on canonical edges. Crucially, an inner wall affects
movement and line of sight without splitting a room; an author draws a second
semantic region only when gameplay identity—not geometry alone—requires it.
Branching topology then follows from the same canonical-edge/semantic-region
model, rather than from giving every wall its own room boundary.

## `regions:` — cell-authored semantic room regions (rpg-project#180)

Target dialect, proposed — not compiled server-side, and not emitted by
this concept before this round (the "Regions section" this file used to
carry, and the matching sketch posted to rpg-project#175, were both
proposed-shape-only with no mutator behind them; a real create/edit/
attach UI and CST mutators now exist — see `dungeonYaml.ts`'s
`createRegion`/`addCellToRegion`/`removeCellFromRegion`/`renameRegion`/
`setRegionArchetype`/`deleteRegion`/`connectRegions` and
`creation/RegionPanel.tsx`).

Per the settled early-authoring model above (rpg-project#175): dungeon
space owns canonical wall/door edges; rooms are stable semantic regions
carrying reveal/placement/spawning/scripting/archetype meaning; an inner
wall never splits a semantic room. `regions:` is the CELL-NATIVE
alternative to the declared `rooms:` chain for expressing that same
"stable semantic region" concept — instead of an `id`/`archetype`/`width`
against a server-computed `start_column`, a region is an explicit list of
absolute `[col,row]` cells, so it can be non-rectangular and takes no part
in the linear connector chain at all.

```yaml
regions:
  - id: shrine-inner
    name: 'Shrine — Inner Sanctum' # optional; id doubles as the label otherwise, same as a room (RoomDoc has no separate name field either)
    archetype: chamber # same vocabulary RoomDoc.archetype uses: entrance | chamber | corridor | boss
    cells: [[9, 2], [9, 3], [9, 4], [10, 2], [10, 3], [10, 4]] # absolute [col,row], same space every other cell-native field uses
```

### Shape

`RegionDoc { id: string; name?: string; archetype: string; cells:
[number, number][] }` — see `dungeonYaml.ts`'s own doc comment for the
full rationale. `name` is the one field a declared room doesn't have
(CONTRACT.md's "room display names" finding: `id` doubles as the label for
a room); it's offered here only because a hand-authored region id is more
likely to be an opaque slug (`region-3`) than a room chain's own
meaningful ids (`entry`, `vault`).

**Alternatives considered for the cell encoding**, before settling on the
plain `[[c,r],...]` array Kirk's own rpg-project#175 sketch already used:

- **A compact run-length encoding** (e.g. row ranges per column) — rejected
  as premature: every region this concept has authored or is likely to in
  the near term is small (a handful to a few dozen cells), so the byte
  savings don't yet justify a harder-to-hand-edit, harder-to-diff shape. A
  plain cell list is also what a future real validator's own error
  messages (à la the connector/boss messages already seen in the backend
  probe) can point at directly, cell by cell.
- **A bitmap/grid mask scoped to the region's own bounding box** (`origin:
[c,r], mask: [[0,1,1],[1,1,0]]`) — rejected for the same reason
  cell-painting lost to edge-painting for `walls:` (CONTRACT.md's
  "wall-drawing interaction" finding): a mask needs a second decode step
  before any consumer (this board, a future server) can answer "is cell
  X in this region," where a flat cell list answers it by direct
  membership. It would also complicate a sparse/scattered region (unusual,
  but not disallowed — see "Open questions" below) far more than it helps
  a compact rectangular one.
- **Reusing `rooms:`'s `width`-against-`start_column` shape, generalized
  to non-rectangular via a per-row `[startCol, endCol]` pair list** —
  rejected: this is really the run-length encoding above wearing a
  room-flavored name, and inherits the same "premature" objection; it also
  couldn't express a region with more than one contiguous span in a single
  row (an author drawing an L-shape or a room with a wall-hugging alcove)
  without escalating to a list-of-lists anyway, at which point it's no
  simpler than the flat cell list.

### Invariants — validated client-side, matching rpg-project#180's own acceptance criteria

`dungeonYaml.ts`'s `validateRegionCells` enforces exactly what #180's
issue body already states as acceptance criteria ("Overlapping,
disconnected, empty, and invalid cell sets fail with author-facing
validation errors"), so this concept's authoring surface can never
produce a region shape the eventual real #180 validator is already known
to reject:

- **Non-empty** — a region needs at least one cell.
- **Hex-contiguous** (updated 2026-08-03; was 4-neighbor-only) — every
  cell must be reachable from every other cell in the same region via
  REAL hex adjacency (`regionGeometry.ts`'s `cellsAreContiguous`, a plain
  BFS/flood-fill over `cellsAdjacent`'s `hexDistance === 1` check), not
  the 4-neighbor orthogonal check this concept used before the creation
  board went hex-true. The old rule undercounted: a hex cell has 6 real
  neighbors, and exactly 2 of a square grid's 4 "diagonal" directions
  turn out to be genuine hex neighbors (which 2 depends on column
  parity — verified numerically, see `regionGeometry.test.ts`). This is a
  strictly WIDER relation — every cell set that validated as contiguous
  under the old rule still does (4-adjacency was always a subset of real
  hex adjacency), so no previously-authored valid region breaks; the
  change only lets a previously-rejected (diagonal-only-touching) cell
  set validate correctly now. `walls:`'s own "orthogonally adjacent
  cells" phrasing (this file's annotated example, above) means the same
  thing: hex-adjacent, not axis-aligned-only.
- **Non-overlapping** — no cell may belong to more than one region at
  once (`cellsOverlapAnotherRegion`). Enforced on create AND on every
  membership edit (`addCellToRegion`), not just at creation time.
- **No duplicate cell within one region's own list.**

These four are enforced on every mutator that changes a region's cell
set — `createRegion`, `addCellToRegion`, and (its own mirror-image
version: removing a cell must not leave the region empty or split it in
two) `removeCellFromRegion`.

### Open questions this prototype records, and deliberately does NOT decide

Per rpg-project#180's own acceptance criteria and non-goals, plus what
this round's implementation had to assume to ship something usable —
recorded here rather than silently decided, same discipline
`defaults:`'s own "Open questions" section above follows:

- **Precedence between a declared `rooms:` chain and `regions:` in the
  SAME document.** #180's acceptance criteria call for "existing
  rectangular specs retain a documented compatibility path," but don't say
  what that path IS. This prototype does not attempt reconciliation: a
  document can carry both `rooms:` and `regions:` today with no
  cross-validation between them (a region's cells are never checked
  against a declared room's own column range, or vice versa) — the two
  are simply independent lists as far as this concept's own parser/board
  are concerned. Recommendation, not a decision: the cleanest eventual
  answer is probably that `regions:` supersedes `rooms:` once a document
  declares any — i.e. a document picks ONE of the two topology models,
  not both at once — but that's a real server-side compiler decision
  #180's own implementer should make, not something a client-side
  prototype should quietly assume by, say, hiding `rooms:` the moment
  `regions:` appears.
- **Must regions fully tile the dungeon's space?** No — not enforced, and
  recommended not to be. Per the settled model, dungeon space owns
  edges independent of semantic rooms/regions; a region is a claim about
  gameplay identity for the cells it lists, not a partition of the whole
  canvas. Sparse, disjoint regions (with "unclaimed" cells between or
  around them) are allowed by this prototype's own validation.
- **Minimum region size.** A single-cell region is allowed (trivially
  contiguous, trivially non-overlapping) — not explicitly ruled in or out
  by #180's issue body, but nothing about the acceptance criteria implies
  a floor above 1.
- **Does an inner wall inside a region ever split it?** No — this follows
  directly from the settled model (rpg-project#175/#179), not a new
  decision this file is making: "an inner wall never splits a semantic
  room" applies to a `regions:`-declared region exactly as it does to a
  `rooms:`-declared one. Drawing a `walls:` edge entirely inside one
  region's cells changes movement/line-of-sight only; the region's own
  `cells:` membership is untouched by any wall mutator.

### Regions are scopes (2026-08-04 model refinement, rpg-project#180) — landed as read-only tree rendering this round

Platform settled a refinement of the model above across four
consumer-position comments on #180 the same day (issue comments
`5183646492`, `5183689311`, `5183885326`, `5184744940`). This supersedes
parts of "Open questions" above — recorded here as a dated refinement, not
by silently rewriting what was previously true-as-written:

1. **An implicit root region replaces "regionless."** Refines the prior
   "Must regions fully tile?" answer above: rather than unclaimed floor
   having no region, EVERY cell belongs to exactly one region — unpainted
   floor belongs to the implicit generic/root region. The model is now
   total, no "regionless" special case in any future semantic. Runtime
   behavior is unchanged (unclaimed cells still fall back to space-level
   defaults) — only the framing is: "the root region's defaults," not
   "no region at all." The "sparse, disjoint regions are allowed" claim
   above is still true for AUTHORED regions specifically — they need not
   tile the space — it's just that the gaps between them now have a name.
2. **Regions may nest, by strict containment ONLY, resolved
   innermost-wins** — like lexical scopes. This refines "Non-overlapping"
   above: overlap remains forbidden EXCEPT strict containment (Venn/partial
   overlap stays invalid either way). A cell's semantics resolve through
   the innermost containing region; names compose ("the Vault, in the
   Crypt"). The shipped flat model (every region a direct child of the
   implicit root) is exactly one level of this — nesting extends it
   without breaking any existing document.
3. **Nesting is DERIVED from cell-subset relationships, never written** —
   no `parent:` field, ever. A region is inside another because its cells
   are a strict SUBSET of the outer region's own declared `cells:` (the
   outer region's list literally includes the inner one's). Because
   overlap is allowed only by containment, any two regions sharing a cell
   must be nested, hence comparable — the parent of a region is its unique
   smallest strict superset (none exists means the implicit root).
4. **Authored region ids compile to the runtime's existing zone ids** — no
   new runtime concept. `encounter/data.go`'s `SpaceData.Regions`
   (`ID`/`Hexes`/`Archetype`, the same `entrance|chamber|corridor|boss`
   vocabulary `RoomDoc.archetype` already uses) and the perception layer's
   per-hex `ZoneID` stamp already exist server-side; #180 is authors
   painting more of them, including nested ones, onto the same structure
   that already drives fog, spawn seeding, and door naming today.

**Landed this round (region-tree unit, rpg-project#180)**: `RegionPanel.tsx`
renders this model truthfully — the derived containment forest
(`regionTree.ts`'s `buildRegionTree`, parent = smallest strict superset by
cell-subset check) with the implicit root as a real row (`(everything
else)`, cell count = canvas floor cells minus every claimed cell at any
depth), children indented under parents, and a partial-overlap warning for
any Venn pair a hand-edited document might contain. **Not landed**: nested
authoring via the brush (`validateRegionCells` is unchanged — still flat
non-overlap, so the interactive tool can only ever produce a one-level
forest); the compiler-side derivation (still platform's call, per every one
of the four comments above); root-scope defaults (the root row is
informational only — a noted future home, nothing implements it). See
CONTRACT.md's "Region tree unit" section for the full implementation
writeup, tests, and live-verification evidence.

### Region attachment vs. chain `connectors:` — deliberately distinct constructs

"Attach to the next region" (Kirk's ask) is implemented as placing a DOOR
edge on the shared boundary between two regions — mechanically nothing
more than an ordinary `walls:` entry with `kind: door`
(`dungeonYaml.ts`'s `connectRegions`, `regionGeometry.ts`'s
`sharedBoundaryEdges`/`pickAttachmentEdge`). This is DELIBERATELY NOT the
same construct as a chain `connectors:` entry, and the distinction matters
enough to spell out, not just imply:

|                         | chain `connectors:`                                                                                                                                                       | region-attachment door                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `from`/`to`             | fixed by declared-room ARRAY ORDER — never independently authorable (`validateChain`, verified against the real Go source: "Why connectors have no add/remove UI," above) | freely chosen — any shared boundary edge between any two regions |
| Cardinality             | exactly `len(rooms)-1`, always                                                                                                                                            | zero, one, or many between any pair of regions                   |
| Server validation today | real, v1, `dungeonspec.Validate`                                                                                                                                          | none — this is a `walls:` entry, itself target-dialect-only      |
| What it IS              | a required link in the linear room chain                                                                                                                                  | wall/door geometry only                                          |

Per rpg-project#175's own spot-check finding (confirmed against the real
`validateChain` source): **an authored door edge does NOT replace,
satisfy, or count as a chain connector.** A document with two regions
connected by a region-attachment door still needs its OWN, independently
satisfied `connectors:` list if it also declares a `rooms:` chain — the
two constructs coexist without one implying the other. Connecting two
regions this way, on a `regions:`-only (no `rooms:`) document, produces a
dungeon with real wall/door geometry between two semantic areas but NO
chain topology at all — consistent with "the linear chain is a current
encoding, not the permanent geometry model" (see "Why connectors have no
add/remove UI," above): a `regions:`-only document was never trying to
express a linear chain in the first place.

**Which edge, when a boundary has more than one**: the MIDPOINT edge
along the shared boundary run, chosen automatically
(`pickAttachmentEdge`) rather than letting the author click a specific
edge — the simplest first-pass choice, at the cost of not handling an
L-shaped or multi-segment boundary as gracefully as an interactive picker
would. See `regionGeometry.ts`'s own doc comment for the exact
(deterministic, but not physically-distance-ordered) tie-breaking rule.
An author who wants a DIFFERENT edge than the one auto-picked can still
draw one directly with the Wall/Door tools — `connectRegions` is a
convenience for the common case, not the only way to place a door between
two regions.

### UI: creation-mode-only this round

The Region tool (Palette's Structural category, a 4th row alongside
Wall/Door/Hole) exists only in creation mode
(`creation/CreationBoard.tsx`, `creation/RegionPanel.tsx`,
`creation/useRegionEditing.ts`) — matching this file's own "Settled early
model" framing that a from-scratch canvas is the natural home for
freeform, cell-native authoring. Painting cells with no region selected
builds a PENDING (not-yet-created) region; a floating panel
(`RegionPanel.tsx`, same visual language as `Inspector.tsx`) lets the
author set an auto-suggested id, an optional name, and an archetype, then
Create. Clicking an already-existing region selects it for editing:
rename, change archetype, add/remove member cells by clicking board
cells, connect to any other existing region, or delete. Immediately after
a create, if a PREVIOUS region exists and shares a boundary, the panel
offers a one-click "Connect to '<previous region>'?" prompt — the
"ideally attaching it to the next region" flow Kirk's ask named directly.

Edit mode (`Board.tsx`, the hex-true board) renders any `regions:` a
document carries — hand-authored in the YAML pane, or round-tripped from
a document first built in creation mode — as a read-only tinted-hex
overlay + centroid label, same archetype coloring
(`markerStyle.ts`'s `regionArchetypeColor`) as the creation board's own
overlay, but with zero interaction: no tool exists there to create, edit,
or delete a region this round.

## `place:`/`boss:` facing — compile status varies by entry type

**Superseded, 2026-08-04, by the capability-probed graduation unit —
status here is no longer a manually-recorded snapshot.** The finding
below was first recorded 2026-08-03 from a one-off backend probe
(rpg-project#175's "Backend feedback: exercising the new authoring API"
comment, read by a human, pasted into this file by hand) — that framing
is retired. `src/concepts/dungeon-builder/capabilityProbe.ts` now
MECHANIZES the same kind of check: on every live connection, the concept
sends one minimal `validate_only` doc per entry-type shape and records
what the CURRENTLY-CONNECTED server actually says, live, in the running
app — not a claim transcribed from an issue comment at a point in time.
The table below documents the mechanism and what it found the last time
this file was updated (2026-08-04, against `rpg-api-dungeon-builder-763`)
— for what the app's OWN "server capabilities" readout (beside the LIVE
badge, `YamlPane.tsx`) says right now, run it; that number is the live
truth, this table is one observation of it.

Reflection + `validate_only` calls show floor-prop `facing` genuinely
COMPILES — but only for one specific shape: a room-scoped, non-monster,
non-`mount:wall` placement. Every other entry type still decodes (the
field is schema-known) and is then explicitly rejected, with an
author-actionable message naming the constraint: `"facing only supported
on room-scoped floor props"`.

| Entry type                                                        | Compile status (verified live, 2026-08-04)                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| room-scoped floor prop (`mount` unset/`floor`, not a monster ref) | **compiles** — `success: true`, confirmed live                                                                                                                                                                                  |
| monster `place:` entry                                            | decodes, rejected ("floor props" only)                                                                                                                                                                                          |
| `boss:` entry                                                     | decodes, rejected (same message)                                                                                                                                                                                                |
| `mount: wall` placement (any ref)                                 | decodes, rejected (same message)                                                                                                                                                                                                |
| top-level `place:` (any ref, any mount)                           | rejected for an INDEPENDENT reason first — top-level placement itself isn't supported yet ("place[0]: unsupported capability: top-level placement is not supported") — facing's own support never gets evaluated for this shape |

The Inspector still renders TWO different badges on the same `facing`
control depending on which of these applies to the currently-selected
placement (`Inspector.tsx`'s `FacingConservativeBadge` vs.
`TargetDialectBadge`) — this unit did not touch `Inspector.tsx` (out of
scope; the strip/save/badge/probe subsystem was). Whoever picks up
wiring the Inspector's own badges to `capabilityProbe.ts` next should
read THAT module first, not re-derive the entry-type split from scratch —
`facingCapabilityFor` in `dungeonYaml.ts` already encodes it once.

## Status tracking: capability-probed, not hand-recorded (rewritten 2026-08-04)

**This section used to track individual fields by hand** ("two fields
now compile on Kirk's branch, unreleased" — the prior version of this
section, preserved in git history) **— that model is retired.** The
"which server, which branch, is it released yet" bookkeeping a
hand-maintained note requires is exactly what `capabilityProbe.ts` now
does automatically, every time the concept connects to a live server, for
every target-dialect field at once — a note that goes stale the moment
anyone merges anything is a worse tool than a probe that can't go stale
because it re-asks the question on every connection.

**What capability-probed graduation actually verified live, 2026-08-04**
(against `rpg-api-dungeon-builder-763` / its envoy sidecar — see
`capabilityProbe.ts`'s own doc comment for the full per-field transcript
this table summarizes):

| Field                                                                                                         | Status                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `walls:`                                                                                                      | **compiles** — real edges, `success: true` (rpg-api#769 / toolkit#881)                                |
| `start:`                                                                                                      | **compiles** — overrides the generator-chosen `FloorPlan.entrance`                                    |
| `facing` (room-scoped floor prop only)                                                                        | **compiles** — see the entry-type table above                                                         |
| `holes:`, `end:`, `canvas:`, `lighting:`, `defaults:`, `regions:`, `height:`, `rotate_degrees:`, `targeting:` | decode-unknown — `"field X not found in type dungeonspec.Y"`                                          |
| `mount:` (any placement)                                                                                      | schema-known, rejected — `"unsupported capability: mounted placements are not supported"`             |
| `facing` (monster / boss / `mount:wall`)                                                                      | schema-known, rejected — `"unsupported capability: facing only supported on room-scoped floor props"` |
| top-level `place:`                                                                                            | schema-known, rejected — `"unsupported capability: top-level placement is not supported"`             |

A **real, load-bearing finding from building the probe suite, not
previously documented anywhere in this file**: dungeonspec now rejects a
room chain with zero boss-archetype rooms outright
(`"dungeon must have exactly one boss room, found 0"`) — a stricter,
CHAIN-level requirement than the boss-archetype-room-needs-a-boss
constraint this file already documented elsewhere. `stripToV1Subset`'s
`compilable`/`compilableBlockers` check for both `minRooms = 2` AND this
requirement now — see "The v1-subset strip," immediately below.

**Every badge in this concept now reads this probe's live result
directly** — `YamlPane.tsx`'s compile-badge strip and Save & Play's
enable/disable, and (as of this unit) creation mode's `ProposedYamlPane`
too, all read `stripToV1Subset`'s `dropped`/`compiling`/`compilable`
output, which is itself computed from whatever `capabilityProbe.ts`'s
`probeAllCapabilities()` found on THIS connection. There is no more
"badge state should track the shared server, not an unmerged branch"
caveat to state by hand — the badges structurally can't drift from the
connected server, because they ARE its answer, re-asked every time.

## Response-side wire consumption: canvas floor + region tree (2026-08-05, dormant)

The capability table above is the SEND side (what the request can carry
without being stripped). This is the RESPONSE side: once a live server
answers with `FloorPlan.floor_cells`/`FloorPlan.regions`
(`FloorPlanRegion.parent_id`) — rpg-api-protos **v0.1.120**, spec.md
§4.5.9/§4.10.4 — this concept renders FROM the wire instead of its own
client-derived approximations:

- `creation/canvasFloor.ts`'s `resolveCanvasFloor(doc, floorPlan)` prefers
  `floorPlan.floorCells` over `deriveCanvasFloorCells` the moment it's
  non-empty; `DungeonPreview3D`'s `FLOOR: SERVER (N)` / `FLOOR: DERIVED`
  badge shows which one won.
- `regionTreeWire.ts`'s `resolveRegionTree(regions, floorPlan)` prefers
  `floorPlan.regions`/`parent_id` over `regionTree.ts`'s cell-subset
  inference the moment it's non-empty, cross-checking the two and
  surfacing a named warning on disagreement (or a dangling `parent_id`);
  `RegionPanel`'s `REGIONS: SERVER` / `REGIONS: DERIVED` badge mirrors the
  floor badge.

**Ready, currently dormant.** Canvas mode (spec.md §1 group (c),
rpg-project#192) and regions (group (d), rpg-project#180/Wave 1) are both
not started server-side — every live server today answers with empty
`floor_cells`/`regions` (decode-unknown fields as of the 2026-08-04
capability probe, same table above), which both consumers treat
identically to no response at all, never as "the document declares
zero." The client-side plumbing exists and is tested against constructed
fixtures now so the flip to server truth needs zero further client
changes the day Wave 0/1 lands — see CONTRACT.md's "v0.3 wire consumption
unit" ledger entry for the full writeup and live-verification notes.

## The v1-subset strip — what actually reaches `PutDungeon`, capability-aware

This concept NEVER sends a target-dialect document to the real server
verbatim. Before any live `validate_only` preview call or a real
"Save & Play," the current document is stripped down to exactly what
THIS server compiles (`dungeonYaml.ts`'s `stripToV1Subset`, now taking an
optional `ServerCapabilities` — capability-probed graduation, this unit).
A field the server accepts is kept, not dropped; a field it doesn't (or
no `capabilities` at all — fixtures mode, or a probe still in flight) is
dropped exactly as this table's "no capabilities" column describes, same
as every version of this concept before capability probing existed:

| Field                                                  | No capabilities (fixtures mode / probe in flight)                                                                                                                                                       | With capabilities (live, 2026-08-04 observation)                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                              | forced to `1` (never `2`)                                                                                                                                                                               | same                                                                                                                             |
| `key`, `name`, `theme`, `height`                       | kept as-is                                                                                                                                                                                              | same                                                                                                                             |
| `rooms:`                                               | kept, but every `place:`/`boss:` entry has its `facing:`/`mount:`/`height:`/`targeting:` keys dropped                                                                                                   | a room-scoped floor prop's `facing:` survives; monster/boss/`mount:wall` facing, `mount:`, `height:`, `targeting:` still dropped |
| `connectors:`                                          | kept as-is, including `locked:`                                                                                                                                                                         | same                                                                                                                             |
| top-level `place:`                                     | mapped down into a containing room (absolute → room-local `at`) if one exists there, otherwise dropped — see "Top-level placement" above                                                                | still mapped/dropped — not yet accepted verbatim by any server this concept has reached                                          |
| `walls:`                                               | dropped, counted ("N walls")                                                                                                                                                                            | **kept verbatim** — real edges, this concept's own headline finding (this unit)                                                  |
| `start:`                                               | dropped, counted ("start")                                                                                                                                                                              | **kept verbatim** — overrides the compiled `FloorPlan.entrance`                                                                  |
| `canvas:`, `wallLines:`, `holes:`, `end:`, `lighting:` | dropped entirely — `wallLines:` is NEVER probed (client-side sugar, see `capabilityProbe.ts`'s own doc comment) and always drops regardless of capabilities                                             | still dropped — none of these decode on this server today                                                                        |
| `regions:`                                             | dropped entirely — no v1 representation of any kind (dungeonspec only knows the declared `rooms:` chain); a region-attachment door edge (`walls:`) is stripped/kept independently, see "regions:" above | still dropped                                                                                                                    |
| `defaults:`                                            | dropped, but not silently — every placement INHERITING a `blocks_movement`/`blocks_los` value first gets it materialized as a literal key; see "`defaults:`" above                                      | still dropped/materialized — the whole block decode-unknown on this server today                                                 |

If, after stripping, the result has fewer than 2 rooms, OR does not
contain exactly one boss-archetype room with a declared `boss:`
(dungeonspec's own `minRooms = 2` AND the "exactly one boss room"
requirement this unit's probing discovered — see "Status tracking,"
above), there IS no compilable subset — a from-scratch canvas with no
declared rooms can't be saved at all yet, honestly, until both real
minimums are met. `stripToV1Subset`'s `compilableBlockers` names WHICH of
the two is missing; the UI's Save & Play tooltip shows it directly rather
than one hardcoded message that may not be the actual reason.

## Compile badges

Per-feature, not per-line — the `yaml` CST doesn't cheaply give this
concept real line/column spans without more plumbing than the honesty
this badge is trying to convey needs. When the current document uses any
target-dialect-only construct, the YAML pane shows a small summary strip naming
exactly which ones ("Uses: 2 walls, start/end, facing (2 placements),
targeting (1 placement) — not yet compiled server-side") and the board
renders each target-dialect construct with a visually distinct treatment
(dashed/muted, not the solid confident style server-compiled geometry gets)
so the SAME board that shows real compiled rooms/props also shows proposed
walls/start/end without pretending they're the same kind of fact.

## Save & Play vs "Save the compilable subset"

- Document uses ONLY v1-expressible constructs → **Save & Play** behaves
  exactly as before this file existed: a real `PutDungeon(validate_only:
false)` of the whole document.
- Document uses ANY target-dialect-only construct → the button becomes
  **"Save the compilable subset"**: computes `stripToV1Subset`, shows a
  diff summary of exactly what's being dropped, and — only on confirmation —
  saves THAT reduced document. The play loop stays alive while the schema
  catches up to the concept, instead of Save & Play just going dark the
  moment an author touches a target field.

## Structural palette category (Kirk's 2026-08-02 addition, Region added 2026-08-03)

The early Structural palette is **Wall, Door, Hole**, plus **Region**
(creation mode only — see "regions:" above) since this round. Unlike the
other categories (draggable/placeable refs), these are TOOLS: selecting
one arms a board click behavior (paint a wall, toggle a wall's kind, paint
region membership) rather than placing a single ref at a cell. Door here
means "toggle an authored wall segment's `kind` between `solid` and
`door`" — a target-dialect-only concept, distinct from
`ConnectorInspector`'s real, v1 `locked:` editing on the chain's own doors
(both are real, both are "doors," they answer different questions: a
connector's door is WHERE the chain already crosses between two declared
rooms; a wall's door is a door on a segment the author drew, wherever they
drew it) — and ALSO distinct from a region-attachment door (see "Region
attachment vs. chain connectors," above): three different "door" concepts
in this one dialect, each answering a different question.

**Holes reconciled (2026-08-03) — moved out of the main kitchen-sink
specimen, into an exploration appendix.** The retained Hole prototype is
NOT part of this early target dialect (unchanged from before this round —
see "Holes are deliberately deferred," above) — but the v0.1/v0.2
kitchen-sink specimen (`specimens/kitchen-sink.yaml`) inconsistently
included a `holes:` entry anyway, which read as a stronger commitment than
"deferred exploration" actually is: a reader skimming the specimen would
reasonably conclude holes are as real as walls/start/end, since they sat
in the same main document. Fixed by regenerating the kitchen-sink specimen
WITHOUT `holes:` (v0.3, see `specimens/README.md`'s changelog) and moving a
minimal holes sample into a clearly-labeled
`specimens/exploration/holes.yaml` appendix instead — the main pack now
only contains constructs this file treats as real dialect proposals,
whether compiled today or not; holes stay demonstrable without implying
that same status. Use an obstacle/prop for a collapse visual in any
real document; do not infer no-floor, movement, line-of-sight, falling,
bridging, or vertical-traversal semantics from the retained prototype.

**A `walls:`/`start:`/`end:` cell can sit outside the compiled
`FloorPlan`'s own bounding box** — a from-scratch canvas draft, or a
hand-edited YAML coordinate, has no reason to stay inside whatever a
room-chain happened to compile to. The board's viewBox **grows** to keep
any such cell reachable rather than clamping or hiding it — the same
rule this whole file follows everywhere else (authored-but-uncompiled
content stays visible, never silently dropped). See CONTRACT.md's
"viewBox grows for content authored beyond the compiled bounding box"
section for the live verification and the one named follow-up (growing
makes distant content _reachable_, not yet _discoverable_ — no minimap
or auto-scroll).

## What this file is not

Not a request. Not Kirk-approved as a server-side commitment. Not a
replacement for the design approval gate (rpg-project#170) and its
ordered #176–#180 slices — it's the concrete artifact those slices should
read once they're ready, so implementers build
against a written document instead of reverse-engineering this concept's
UI behavior (the exact failure mode `[[outside-in-waves]]` names).
