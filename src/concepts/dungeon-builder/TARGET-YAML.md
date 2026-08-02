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
has not reviewed or approved the shape of `walls:`/`holes:`/`start:`/
`end:`/`lighting:`/`facing:`/`mount:`/`height:`/`targeting:` as a
server-side commitment — only as the concept's own authoring surface.

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
up" — it's the steady state. Don't read a `v2` badge as "coming soon";
read it as "here's what this concept found while building the thing
that needed it."

## The core idea: one document, two kinds of fields

A dungeon spec is ONE YAML file. Every field in it is either:

- **v1, real today** — `rooms:`, `connectors:` (including `locked:`),
  `place:`/`boss:`/`obstacles:` inside a room. These compile against the
  real `dungeonspec.Validate`/`PutDungeon` right now, unchanged from
  before this file existed.
- **v2, proposed, not yet compiled** — `walls:`, `holes:`, `start:`,
  `end:`, `lighting:`, and `facing:`/`mount:`/`height:`/`targeting:` keys
  added to any `place:`/`boss:` entry. These are real, meaningful fields
  in THIS concept — the board renders them, the YAML pane round-trips
  them, editing them works — but `PutDungeon` doesn't know about them
  yet. The concept "compiles the implemented subset and badges the
  rest," which literally means: strip every v2-only field out, send what's
  left (a pure v1 document) to the real server for live preview / Save &
  Play, and show a small badge next to each v2 construct saying it isn't
  in that server response.

There is no second file, no second pane style, no "proposed schema"
ghetto. One board, one YAML pane, some of its fields chase-badged.

## The full annotated example

```yaml
# version is OPTIONAL — omitted or 1 means "this document only uses
# fields dungeonspec v1 already compiles." 2 is a concept-only signal
# ("this document may also use the v2-proposed fields below") — the REAL
# server is never sent `version: 2`. When this concept sends anything to
# PutDungeon, it always sends `version: 1` and the v1-only subset (see
# "The v1-subset strip" below) — dungeonspec.Validate hard-rejects any
# version other than 1 (rpg-toolkit encounter/dungeonspec/validate.go:
# `if spec.Version != 1 { return fmt.Errorf(...) }`), so a real "2" would
# just be an instant, uninformative server error, not a richer one.
version: 2
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
# them). This IS the geometry backbone in both v1 and v2 — v2 does not
# replace it with a second, incompatible "freeform canvas" model (the
# creation flow's PRE-this-file draft did that, and that mismatch — one
# tab's board keyed by declared rooms, the other by a canvas with no
# rooms at all — is exactly the seam Kirk asked to kill). Every
# coordinate below (`walls:`, `holes:`, `start:`, `end:`, `place.at`) is
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
      # facing is v2 — see "place:/boss: facing" below.
      - { ref: 'dnd5e:props:statue-reaper', at: [4, 1], facing: SE }
      # mount/height are v2 — see "z-axis: mount + height" below. This
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
      # targeting is v2 — see "monster targeting" below. A REFERENCE to a
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
      facing: W # v2
      targeting: closest # v2

# v1, real today. from/to are NOT independently authorable — see
# "Why connectors have no add/remove UI" below. locked (dc/ability) is the
# one field a connector's own surface actually varies.
connectors:
  - { from: antechamber, to: shrine }
  - { from: shrine, to: vault, locked: { dc: 12, ability: dex } }

# --- v2, proposed: the authored structural overlay ---

# OPTIONAL. Only meaningful when rooms: is empty (a from-scratch canvas,
# nothing declared yet — "New Dungeon"'s starting point) or when you want
# to draw beyond the declared chain's current bounding box. The moment at
# least one room exists, the effective canvas is DERIVED
# (sum of room widths + gaps, by height) and this becomes redundant —
# it exists only to give a blank document something to draw walls inside
# of before any room has been declared.
canvas:
  width: 20
  height: 30

# Edge-native: {from, to, kind}, absolute [col,row] cell coordinates for
# both ends of the wall segment (from/to must be orthogonally adjacent
# cells — a wall sits ON the shared edge between them, matching a hex
# grid's own edge-vs-cell distinction the same way a real wall run does).
# This is not invented from nothing — it deliberately mirrors the REAL
# `EncounterService.Space.walls` wire type, `Wall{from, to, kind, id}`
# (kind: WALL_KIND_SOLID | WALL_KIND_DOOR_* — doors are a kind, not a
# separate list). A freeform-authoring surface built this way needs no
# translation layer between "what the author drew" and "what the wire
# already carries for the same kind of geometry elsewhere in this
# system" — see CONTRACT.md's "walls: edge-native" finding, carried over
# unchanged from the creation flow's original draft of this idea.
walls:
  - { from: [7, 0], to: [7, 1], kind: solid }
  - { from: [7, 4], to: [7, 5], kind: door }

# Cell-native floor openings (Kirk's 2026-08-02 Structural-category ask —
# genuinely new, no prior art in this concept). A hole is a [col, row]
# cell that has NO FLOOR — not a wall, not a placeable cell, a true
# absence. Simple flat list of cells, not edge-native like walls (a hole
# is a property of ONE cell, not a boundary between two).
holes:
  - [3, 6]
  - [3, 7]

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
```

## `place:`/`boss:` facing

Any `place:` entry or a room's `boss:` entry may carry an optional
`facing:` key, one of `E | NE | NW | W | SW | SE` — reusing the SAME
6-direction hex-facing convention already defined in this codebase
(`src/components/hex-grid/authorGridHelpers.ts`'s `HEX_FACING_LABELS`),
not a new rectangular 4/8-way compass. Deliberate: the codebase already
has exactly one facing convention (defined for the hex-true board,
currently mechanically inert per that file's own doc comment) — inventing
a second, incompatible one for board authoring would create a
reconciliation problem the moment both became real at once. The genuine,
unresolved tension this keeps: 6 directions spaced 60° apart is a
hex-native division of the circle — it reads naturally on the hex-true
board and slightly oddly on the flattened one (no direction points along
either axis). Carried over unchanged from the creation flow's original
finding — not re-litigated, just now living on real `place:`/`boss:`
entries instead of a separate invented `Placement` type.

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
- **`height`**: meters above the floor. Only meaningful when
  `mount: wall`; ignored/omit for `mount: floor` (a floor-standing prop's
  vertical position is derived from its own model, same as today).

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
instead of the floor-center placement it does today — a real, scoped
piece of render work, not attempted this round (doc-only construct; the
placement inspector's optional height field, when cheap to add for a
known wall-mountable ref, is the only UI this round ships).

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
error in this concept — it's a recorded ask, same status as any other v2
field: authored, badged, not yet compiled.

UI this round: a targeting dropdown in the monster/boss inspector,
badged `v2` like every other Structural/Markers control.

## Why connectors have no add/remove UI, and what that means for walls

Verified against the real Go source
(`rpg-toolkit/encounter/dungeonspec/validate.go`'s `validateChain`), not
guessed: a spec must have EXACTLY `len(rooms)-1` connectors, and
connector `i` must ALWAYS join `rooms[i]` to `rooms[i+1]`. `from`/`to` are
a pure function of room declaration order — never independently
authorable, no arbitrary pairs, no skipping a room. The only field a
connector's author-facing surface actually varies is `locked:`.

This is precedent for `walls:`/`holes:`, not just a connector-specific
fact: when/if a wall schema becomes real server-side, keeping the same
discipline (position/topology mostly server-derived or tightly
constrained, only the gameplay-relevant knob author-facing) is a
reasonable default to reach for FIRST, rather than assuming full freeform
placement is the only option. This concept's own `walls:`/`holes:` ARE
currently freeform (any `[col,row]` pair, any edge) because nothing
server-side constrains them yet — that's a property of "not real yet,"
not a design recommendation for what a real wall schema should allow.

**The bigger consequence of this constraint: v1 can only express LINEAR
dungeons.** `rooms[i]` always connects to exactly `rooms[i+1]` and
nothing else — no room can have two doors leading to two different
places, no loop, no branch. Every dungeon this schema can compile today
is topologically a single hallway of rooms. That's not a missing
feature so much as the CURRENT shape of "connector" itself: a connector
is defined as "the gap between adjacent declared rooms," which only
has one meaning in a linear chain.

**The linear chain should be understood as a special case of drawn
walls + placed doors, not a separate, permanent geometry model.** Once
`walls:`/a real door-on-a-wall-segment concept are genuinely compiled
(not just this concept's proposed overlay), a "room" stops needing to
mean "one link in an ordered array" — it can mean "a region walls
happen to enclose," and a door stops needing to mean "the one gap
between array neighbors" — it can mean "an opening in any wall
segment, connecting whatever two regions sit on either side." Under
THAT model, today's `rooms:`/`connectors:` linear chain isn't wrong or
replaced — it's the specific, degenerate case where every wall
happens to form one hallway end-to-end. Branching topology (a room
with three doors leading to three different areas, a loop back to an
earlier room) is exactly what the wall evolution unlocks, not a
separate ask layered on top of it. Worth stating explicitly so whoever
eventually scopes real wall/door geometry doesn't treat "make rooms
linkable in more than one direction" as a second project after walls
land — it's the SAME project; walls are what make it possible.

## The v1-subset strip — what actually reaches `PutDungeon`

This concept NEVER sends a v2 document to the real server. Before any
live `validate_only` preview call or a real `Save & Play`, the current
document is stripped down to exactly what v1 compiles
(`dungeonYaml.ts`'s `stripToV1Subset`):

| Field                                                        | v1 subset                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `version`                                                    | forced to `1` (never `2` — see the annotated example's own note)                                      |
| `key`, `name`, `theme`, `height`                             | kept as-is                                                                                            |
| `rooms:`                                                     | kept, but every `place:`/`boss:` entry has its `facing:`/`mount:`/`height:`/`targeting:` keys dropped |
| `connectors:`                                                | kept as-is, including `locked:`                                                                       |
| `canvas:`, `walls:`, `holes:`, `start:`, `end:`, `lighting:` | dropped entirely                                                                                      |

If, after stripping, `rooms:` has fewer than 2 entries (dungeonspec's own
`minRooms = 2`), there IS no compilable subset — a from-scratch canvas
with zero or one declared room can't be saved at all yet, honestly, until
at least 2 rooms are declared. The UI says this plainly rather than
attempting a doomed `PutDungeon` call.

## Compile badges

Per-feature, not per-line — the `yaml` CST doesn't cheaply give this
concept real line/column spans without more plumbing than the honesty
this badge is trying to convey needs. When the current document uses any
v2-only construct, the YAML pane shows a small summary strip naming
exactly which ones ("Uses: 2 walls, 1 hole, start/end, facing (2
placements), targeting (1 placement) — not yet compiled server-side")
and the board renders each v2 construct with a visually distinct
treatment (dashed/muted, not the solid confident style server-compiled
geometry gets) so the SAME board that shows real compiled rooms/props
also shows proposed walls/holes/start/end without pretending they're
the same kind of fact.

## Save & Play vs "Save the compilable subset"

- Document uses ONLY v1-expressible constructs → **Save & Play** behaves
  exactly as before this file existed: a real `PutDungeon(validate_only:
false)` of the whole document.
- Document uses ANY v2-only construct → the button becomes **"Save the
  compilable subset"**: computes `stripToV1Subset`, shows a diff summary
  of exactly what's being dropped, and — only on confirmation — saves
  THAT reduced document. The play loop stays alive while the schema
  catches up to the concept, instead of Save & Play just going dark the
  moment an author touches a v2 field.

## Structural palette category (Kirk's 2026-08-02 addition)

A fourth palette category, alongside Monsters / Obstacles & Props /
Lighting: **Structural** — Wall, Door, Hole. Unlike the other categories
(draggable/placeable refs), these are TOOLS: selecting one arms a board
click behavior (paint a wall, toggle a wall's kind, mark/unmark a hole)
rather than placing a single ref at a cell. Door here means "toggle an
authored wall segment's `kind` between `solid` and `door`" — a v2-only
concept, distinct from `ConnectorInspector`'s real, v1 `locked:` editing
on the chain's own doors (both are real, both are "doors," they answer
different questions: a connector's door is WHERE the chain already
crosses between two declared rooms; a wall's door is a door on a
segment the author drew, wherever they drew it).

Rendering:

- **Holes, 2D** — a distinct dark void cell, deliberately NOT the same
  visual as the door-row hazard stripe (that's a legality rule; a hole is
  authored content) and not the same as an empty placeable cell.
- **Holes, 3D** — the floor tile simply isn't generated for that cell
  (`DungeonPreview3D.tsx`'s `buildFloorTiles` skips it, same shape as the
  existing door-row skip) — the honest render, and nearly free given
  `SyntyHexFloor` already only renders whatever's in the tile map handed
  to it.
- **Movement/LoS semantics** — proposed: impassable (nothing occupies a
  cell with no floor). Fall damage / a pit-trap-style consequence is
  flagged here as a genuine future GAME-RULE question for the toolkit to
  decide, not something this concept resolves — "impassable" is the only
  claim being made now.

**A `walls:`/`holes:`/`start:`/`end:` cell can sit outside the compiled
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
replacement for design.md/plan.md's own P4+ scoping — it's the concrete
artifact THAT scoping should read once it's ready, so implementers build
against a written document instead of reverse-engineering this concept's
UI behavior (the exact failure mode `[[outside-in-waves]]` names).
