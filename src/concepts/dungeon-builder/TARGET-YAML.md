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
canvas:
  width: 20
  height: 30

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
```

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

**Open question, not decided here: is 6-direction hex facing too coarse
for a wall-mounted prop?** 6 directions spaced 60° apart is a coarse
division of the circle, and gets sharper as a limitation once `facing`
is driving a mounted prop's actual on-wall rotation rather than a
floor-standing model's general orientation — a
banner or sconce genuinely needs to sit FLUSH and SQUARE against the
wall face it's mounted on, and the wall itself sits at whatever angle
the edge geometry gives it, not necessarily one of the 6 hex-facing
directions. Two ways this could go, both live, neither chosen:

- **Keep `facing` as the only rotation input.** Simpler dialect, one
  facing convention everywhere (place/boss/mount alike, per this
  section's own reasoning above). Requires the renderer to derive the
  correct flush-against-the-wall angle FROM the mounting edge's own
  geometry rather than trusting `facing` as a literal rotation — `facing`
  becomes "which edge," not "what angle," for a mounted prop specifically.
- **Add a finer rotation value to `mount:` entries** (degrees, or a
  fraction-of-circle field) alongside `facing`, so the author can dial in
  an exact angle the 6-direction convention can't express. Breaks the
  "one facing convention everywhere" property this section leads with,
  and raises the same question `place:`/`boss:` facing already begs:
  would floor-standing props eventually want the same finer control, or
  is coarse-6-direction genuinely fine there and only wrong for
  wall-flush mounting specifically?

Recorded per Kirk's 2026-08-02 ask, alongside the wall-mount rotation
bug that surfaced it — deliberately NOT resolved here; the #176–#180
slices should pick a side with the actual renderer requirements in hand,
not a concept spike guessing ahead of them.

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
object rather than argued about in the abstract. This is the probe, not
the answer: the question above is still open, and this only exists to
let Kirk's own hands settle it. Whatever he finds should get recorded
back into this section and into CONTRACT.md's ledger — pending as of
this writing.

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

## The v1-subset strip — what actually reaches `PutDungeon`

This concept NEVER sends a target-dialect document to the real server. Before any
live `validate_only` preview call or a real `Save & Play`, the current
document is stripped down to exactly what v1 compiles
(`dungeonYaml.ts`'s `stripToV1Subset`):

| Field                                              | v1 subset                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                          | forced to `1` (never `2` — see the annotated example's own note)                                                                         |
| `key`, `name`, `theme`, `height`                   | kept as-is                                                                                                                               |
| `rooms:`                                           | kept, but every `place:`/`boss:` entry has its `facing:`/`mount:`/`height:`/`targeting:` keys dropped                                    |
| `connectors:`                                      | kept as-is, including `locked:`                                                                                                          |
| top-level `place:`                                 | mapped down into a containing room (absolute → room-local `at`) if one exists there, otherwise dropped — see "Top-level placement" above |
| `canvas:`, `walls:`, `start:`, `end:`, `lighting:` | dropped entirely                                                                                                                         |

If, after stripping, `rooms:` has fewer than 2 entries (dungeonspec's own
`minRooms = 2`), there IS no compilable subset — a from-scratch canvas
with zero or one declared room can't be saved at all yet, honestly, until
at least 2 rooms are declared. The UI says this plainly rather than
attempting a doomed `PutDungeon` call.

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

## Structural palette category (Kirk's 2026-08-02 addition)

The early Structural palette is **Wall, Door**. Unlike the other categories
(draggable/placeable refs), these are TOOLS: selecting one arms a board click
behavior (paint a wall or toggle a wall's kind) rather than placing a single
ref at a cell. The existing Hole control is a retained prototype, not early-
dialect UI; use Obstacles & Props for collapse visuals. Door here means "toggle
an authored wall segment's `kind` between `solid` and `door`" — a target-dialect-only
concept, distinct from `ConnectorInspector`'s real, v1 `locked:` editing
on the chain's own doors (both are real, both are "doors," they answer
different questions: a connector's door is WHERE the chain already
crosses between two declared rooms; a wall's door is a door on a
segment the author drew, wherever they drew it).

The retained Hole prototype is not part of this early target dialect.
For now, use an obstacle/prop for a collapse visual; do not infer no-floor,
movement, line-of-sight, falling, bridging, or vertical-traversal semantics
from that prototype.

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
