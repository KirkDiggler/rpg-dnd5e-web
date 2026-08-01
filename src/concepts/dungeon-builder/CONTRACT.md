# Dungeon Builder board — contract log (rpg-dnd5e-web#666)

Produced by the fixture-first Dungeon Builder concept (`/concepts` →
Dungeon Builder), ported from a standalone HTML prototype
(`~/game-dev/concepts/dungeon-builder/`) into this repo's real
`/concepts` sandbox. Same method as `combat-pacing/CONTRACT.md` and
`fog-of-war/CONTRACT.md`: what the concept needed, what the wire carries
today, and where those differ. Not a pre-authored feature request —
nothing here becomes a cross-repo ask until Kirk reviews the concept.

Design: `rpg-project/ideas/dungeon-builder/design.md` (rpg-project#170).
Plan: `rpg-project/ideas/dungeon-builder/plan.md` (rpg-project#169), S4a/S4b.

Checked against the real proto at rpg-api-protos **v0.1.115**
(`dnd5e/api/authoring/v1alpha1/service.proto`), the real `FloorPlan`
responses recorded in rpg-api PR #750/#752, a **real recorded
`PutDungeon(validate_only)` response for showcase.yaml itself**
(`fixtures.ts`'s `SHOWCASE_FLOORPLAN`), and a **live end-to-end run**
against an isolated `rpg-api:local` instance with
`RPG_AUTHORING_ENABLED=1` (see "Live verification" below) — not guessed
from memory of the plan.

## Two findings from the standalone prototype, now resolved

The standalone concept had no live server and had to guess two things.
Both are now settled with real evidence:

1. **`start_column` chain accumulation past 2 rooms — CONFIRMED.** The
   only two real fixtures then available (PR #750/#752) were both 2-room
   chains with identical widths. A real `PutDungeon(validate_only)` call
   against showcase.yaml's actual 3-room, non-uniform-width chain
   (6/14/8) now exists (`SHOWCASE_FLOORPLAN` in `fixtures.ts`) and
   matches `compileFloorPlanLocally`'s output exactly —
   `floorPlanCompile.test.ts` asserts this against all three real
   fixtures. The `next.startColumn = prev.startColumn + prev.width + 1`
   rule is real, not a guess.
2. **`entrance` cell derivation — still the weakest link, unchanged.**
   All three real fixtures (smoke-test, s2-loop-test, AND showcase) share
   the same shape for this purpose: the entrance room is first-in-chain
   and `entrance.row == door_row` in every case. This doesn't distinguish
   "entrance is always the entrance room's own start_column, row=door_row"
   from other equally plausible rules. Still needs a fixture whose
   entrance room ISN'T first-in-chain or ISN'T centered to close.

## Contract findings (verified against the real proto/wire)

- **Hex orientation/parity is not on the wire, anywhere.** `FloorPlan`
  carries `rooms`, `connectors`, `height`, `door_row`, `entrance` — no
  orientation enum. "Pointy-top, odd-q" lives only in the web client's
  TypeScript (`hexMath.ts`, `wallRuns.ts`). A future toolkit change to
  the generator's hex convention has nothing on the wire to signal it.
- **Cell legality is a clean one-line derivation, not a gap**: `col ∈
[start_column, start_column+width) AND row != door_row`. Confirmed
  working for all three of showcase.yaml's rooms in this port. This is
  exactly what `door_row`'s own proto comment promises — a real design
  win, not just an assumption.
- **Room display names**: not a proto gap. dungeonspec has no separate
  room-name field — `id` doubles as the label. `FloorPlanRoom` correctly
  omits a redundant field.
- **YAML room-local `[col,row]` → absolute column IS fully determined by
  `start_column` alone**, confirmed again in this port:
  `absCol = start_column + localCol`, `absRow = localRow`, no per-room
  row offset, because `height` is one value for the whole spec.
- **Connector door position as a cell** must still be derived
  (`[connector.column, door_row]`) — `FloorPlanConnector` only carries
  `column`.
- **Prop visual metadata (footprint, facing) is absent from the wire and
  confirmed intentional.** This port now sources the palette from the
  REAL `propManifest.ts` (`role`/`footprintHexes`/`blocksLoS`) instead of
  the standalone concept's invented per-key colors — but that data is
  still entirely client-side, disconnected from dungeonspec. Facing has
  zero schema support anywhere (confirmed by `authorGridHelpers.ts`'s own
  doc comment).
- **"End/goal" has no schema representation at all**, not even a
  derivable one — unlike start (`FloorPlan.entrance`) and door
  (`column`+`door_row`). The palette's read-only "End / goal" legend item
  is the one with nothing behind it on the wire.
- **General (non-boss) monster placement via `place:` is now VERIFIED
  real**, not just described. A real `GetEncounter` after
  `PutDungeon`+`StartEncounter` against a "monster-place-check" dungeon
  shows a monster entity (`monster-entrance-0`, type
  `ENTITY_TYPE_MONSTER`) seated in the entrance zone via `place:`, not
  `boss:` — evidence at
  `~/game-dev/concepts/dungeon-builder/fixtures/monster-place-check.json`,
  referenced in `fixtures.ts`. The standalone concept's "unverified"
  finding here is closed.

## New finding from this port: `yaml` doesn't fully close the round-trip requirement

plan.md S4a's checklist says to use the `yaml` npm package for
comment-preserving round-trip, implying it's a solved problem once you
reach for the right library. Two things worth knowing before assuming
that:

1. **Byte-stability needs `{ lineWidth: 0 }`, and even then one residual
   diff remains.** Default stringify options reflow every flow-style
   `{ ref: ..., at: [...] }` entry onto multiple lines the moment you
   round-trip showcase.yaml — `lineWidth: 0` fixes that, but the library
   still pads flow _sequences_ (`[ 1, 1 ]`) where the source has none
   (`[1, 1]`), and no single top-level stringify option reconciles
   padded-brace/unpadded-bracket styling at once (`flowCollectionPadding`
   is one knob for both). `dungeonYaml.test.ts`'s round-trip test
   normalizes this one specific diff before asserting byte-stability —
   everything else (comments, field order, flow-vs-block style) is
   genuinely exact. A production implementation may want a custom
   per-node stringifier to close this last gap, or may just accept it.
2. **Comment attachment is a per-node property in the REAL library too —
   this is not a hand-rolled-parser artifact.** The standalone concept's
   naive parser attached each comment to the single next `place:` entry,
   and I assumed a real CST library would model this more richly. It
   doesn't: `yaml`'s own `commentBefore` is likewise attached to exactly
   one node. Confirmed directly against showcase.yaml —
   `# colonnade: 8 pillars framing the center lane (rows 3-5 clear)`
   lands on `commentBefore` of the pillar at `[2,2]` only, none of the
   other 7. `dungeonYaml.test.ts`'s two tests
   (`movePlacement mutates in place and keeps an attached comment` /
   `deletePlacement on a comment-carrying item silently drops the
comment too`) demonstrate both directions of the failure mode this
   causes: dragging that first pillar carries the heading away with it;
   deleting it removes the heading even though 7 pillars remain. **This
   is a real, load-bearing UX question for S4a/S4b, not solved by
   picking the recommended library** — a production implementation needs
   an explicit decision (attach group comments to the room instead of the
   first item? warn on delete/move of a comment-carrying item? accept the
   loss?), not just "use `yaml`".

## Live verification

Ran the actual arc end to end against an isolated `rpg-api:local`
instance (image built from rpg-api HEAD, which already includes S1/#750
and S2/#752), gate on:

```bash
docker run -d --name rpg-api-lab3-authoring \
  --network rpg-deployment_rpg-network \
  -e LOG_LEVEL=info -e REDIS_ADDR=redis:6379 -e AUTH_DEV_MODE=true \
  -e DND5E_API_URL=http://dnd-api:3000/api/2014/ \
  -e RPG_AUTHORING_ENABLED=1 -e RPG_CONTENT_DIR=/content -e PORT=50051 \
  -v <host-content-dir>:/content \
  rpg-api:local
# + an envoy sidecar (grpc-web translation) cloned from
# rpg-deployment/envoy/envoy-lab2.yaml with its cluster address changed
# to rpg-api-lab3-authoring, published on host port 8090.
```

With `VITE_API_HOST=http://localhost:8090 npm run dev`, the concept's
mount-time probe reached the real service and:

- got a genuine `[invalid_argument] key "" must match ^[a-z0-9-]+$` back
  from the real `PutDungeon` handler (the probe's own deliberately-bad
  payload) → `serverState` correctly became `live`.
- a subsequent debounced edit call round-tripped a real
  `PutDungeon(validate_only: true)` and rendered the response.

Pointing the same build at the shared, gate-off `rpg-api` instance
(`localhost:8080`, no `RPG_AUTHORING_ENABLED`) produced a real
`[unimplemented] unknown service dnd5e.api.authoring.v1alpha1.AuthoringService`
and `serverState` correctly became `gate-off`, showing the FIXTURES MODE
badge. Both outcomes are console-error-visible in the browser (the
connect-web logging interceptor logs every RPC, including this one's
expected failures) — screenshots in `docs/evidence/`.

Not exercised live: the `Unavailable`/transport-failure branch (would
need killing the container mid-session) and a `success:false` /
`field_errors` response from a genuinely invalid dungeonspec YAML — both
are covered by `usePutDungeonPreview.test.ts`'s mocked cases instead.

## Biggest structural finding, carried over: the floor plan shears diagonally

Rendering `FloorPlan`'s `[col,row]` addressing through the game's real
hex math (`hexTrueCellCenter`, reusing `hexMath.ts`/`wallRuns.ts` per
S4a's own checklist instruction) shears diagonally across a wide room
chain: `hexRow(col,row) = row + floor(col/2)`, so at a fixed row,
world-Z drifts roughly linearly with column. Verified analytically, not
a porting bug. This port adds the `flattened` layout mode
(`hexLayout.ts`'s `flatCellCenter` — plain Cartesian, no hex-parity
correction) specifically so this can be compared in place, one FloorPlan,
two renderings, via the board's own toggle — see the evidence
screenshots. **S4a's own checklist ("reuse the odd-q/hex-position
helpers... for hex-to-screen positioning") needs an explicit decision
here**: embrace the sheared/authentic-hex look, or specify a different
flattening for the 2D top-down authoring board. This should not be
inherited silently from reusing production code written for a different
rendering context (revealed 3D rooms, not a flat multi-room chain).

## UX learnings

1. **Loud beats subtle for the door-row affordance** — an amber diagonal
   hazard-stripe pattern (SVG `<pattern>`) reads instantly; a
   barely-different fill color (the standalone concept's first pass) did
   not.
2. **The entrance-blocked warning is the single best "aha" interaction.**
   Placing a `blocks_movement: true` prop on the party spawn cell flips
   the marker to a red "⚠ PARTY SPAWN (BLOCKED!)" instantly — the exact
   scenario `design.md` invented the `entrance` field to guard against
   becomes visible in about one second.
3. **The live YAML pane, now genuinely live against a real server, sells
   the "view over the real file" principle even harder than the
   standalone concept did** — watching a board click produce a real
   round-tripped `PutDungeon` response, not a client-side guess, is a
   qualitatively different feeling.
4. **Sourcing the palette from the real `propManifest.ts` (role-based
   colors: obstacle/cover/decor) reads better than the standalone
   concept's arbitrary per-key colors** — the same three-color grouping
   the real 3D game could plausibly use for its own author-mode overlay
   someday, for free, since it comes from the same manifest.
5. **The flattened/hex-true toggle is worth keeping in whatever ships.**
   Seeing the same door-row band go from a diagonal streak to a level bar
   side by side (well, toggle by toggle) makes the shear finding
   immediately legible to someone who hasn't read this file — a stronger
   argument than the writeup alone.

## What plan.md's S4a/S4b should change

1. **Revisit "reuse the existing odd-q/hex-position helpers" given the
   shear finding** — make the flattened-vs-hex-true call explicit in the
   plan rather than inherited from a checklist item written before this
   was known.
2. **Widen S4a's board contract test fixture past 2 rooms** — its
   pointer ("a recorded FloorPlan response, e.g. captured from S1's
   grpcurl smoke test") is the 2-room smoke-test fixture; a 3-room
   fixture (showcase.yaml's own, now available — see `fixtures.ts`)
   would actually catch a chain-accumulation regression.
3. **The comment-preservation requirement needs a real design decision,
   not just "use the yaml package."** See this file's "yaml package
   doesn't fully close..." finding above — group-comment orphaning on
   delete/move is real even with the recommended library.
4. **S4b's "rolled content" panel still has no real fixture to test
   against** — showcase.yaml (and everything else checked) has zero
   `obstacles:` entries. `RolledContentPanel`'s non-empty path is
   implemented but genuinely untested against real content.

## Proposed schema from the creation flow (Kirk's day-one pitch, 2026-08-01)

Kirk, after seeing the edit-mode concept: "wow it looks amazing" — then the
real ask: "want 20x30 room -> get 2d top down board -> draw the walls in
place -> start here, end there -> add door here, monster there, reaper
statue there facing this way -> load up and play." That's CREATION, not
editing — a second concept mode (`src/concepts/dungeon-builder/creation/`)
built to know exactly how that flow should feel, entirely client-side (no
schema exists for any of this — design.md explicitly defers wall/shape
authoring to P4+). `proposedYaml.ts` renders the invented schema live,
styled as a visually distinct "PROPOSED SCHEMA" pane so it's never
mistaken for something dungeonspec accepts today. This section is the
write-up; the schema itself is best read live (`ProposedYamlPane.tsx`'s
output), not re-transcribed here.

### Walls: edge-native, matching a wire type that already exists

The proposed `walls: [{ from: [c,r], to: [c,r], kind: solid|door }]`
shape is not invented from nothing — it deliberately mirrors
`EncounterService.Space.walls`' real wire type, `Wall{from, to, kind, id}`
(edge-native, doors as a `WALL_KIND_DOOR_*` kind, not a separate list —
confirmed against `fog-of-war/CONTRACT.md`'s own research into that
message). A freeform-room authoring surface built this way wouldn't need
a translation layer between "what the author drew" and "what the wire
already carries for the SAME kind of geometry elsewhere in this system" —
it's the same shape, just before compilation instead of after. This is
the strongest single argument for _this_ proposed shape over a
`grid: [[0,1,1,0],...]` solid/floor bitmap (the other obvious option,
plainer to author from a full-grid dump but with no natural place for a
door to attach — a door is inherently an edge concept, not a cell one).

### Wall-drawing interaction: edge-painting, chosen and then fixed once

Built as click-drag edge-painting (draw a wall by tracing it), not
cell-painting (mark cells solid/floor and let the room shape fall out of
the boundary). Edge-painting was chosen for two reasons: it's literally
what Kirk described ("draw the walls"), and per the wire-shape argument
above, it's the representation with a real precedent already in this
codebase. Cell-painting would have been simpler to hit-test (one bucket
per cell, no edge geometry) but has no natural home for a door — you'd
still need to convert "this edge between two differently-filled cells" to
a wall after the fact, which is exactly the edge model, just derived
late instead of drawn directly.

**A real, load-bearing interaction bug surfaced and got fixed during
this build, not just theorized about**: the first implementation snapped
each pointer-move to whichever edge orientation was geometrically
nearest _at that exact pixel_ — correct for a single click, but for a
drag, that comparison flips every time the pointer crosses a cell
boundary, so a perfectly straight horizontal mouse drag produced a
crenellated comb (alternating short vertical ticks and horizontal
stubs), not a straight wall. Confirmed by actually drawing one and
looking at the result, not by reasoning about it in the abstract. Fixed
by locking the whole stroke's orientation to the DRAG'S direction
(horizontal drag → horizontal wall, vertical → vertical) once the
pointer clears a small movement threshold, rather than to whichever edge
the very first touched pixel happened to be closest to — the two are
not the same thing, and using the wrong one is what broke it. Any real
wall-drawing tool needs this exact fix (or an equivalent), not just "hit
the nearest edge" — that's the finding worth carrying forward, not the
implementation detail.

### Start/end: authored, in real tension with the generator-chosen entrance

`start: [c,r]` / `end: [c,r]`, both null until placed. This sits in
genuine, unresolved tension with `FloorPlan.entrance` — the compiled
response's entrance is explicitly generator-chosen (design.md: "not
derivable from any room's archetype"), which only makes sense for the
linear room-chain model edit mode authors. A freeform canvas with an
author-placed start doesn't have a generator to choose FOR the author;
the author IS choosing it directly. If wall/shape authoring becomes
real, `entrance` either needs a freeform-canvas-compatible sibling field,
or the freeform case needs to feed the author's `start:` straight through
as the compiled entrance with no generator step at all — worth deciding
explicitly rather than discovering by accident when the two models meet.
"End" has no analog in the compiled `FloorPlan` today at all (see this
file's earlier "end/goal has no schema representation" finding) — a
freeform canvas is the first place this concept needed one.

### Facing: reused the existing 6-direction convention, not a rectangular compass

`place:` entries grow a `facing: E|NE|NW|W|SW|SE` field, reusing
`authorGridHelpers.ts`'s existing `HEX_FACING_LABELS` enum verbatim
rather than inventing a rectangular canvas's more natural 4/8-way
compass. Deliberate: the codebase already has exactly one facing
convention (defined for the hex-true board, currently mechanically inert
— its own doc comment says so), and a second, incompatible one for a
rectangular canvas would immediately create a reconciliation problem the
moment both were real. The genuine, unresolved tension this creates: 6
directions spaced 60° apart is a hex-native division of the circle: it
reads naturally on a hex grid and slightly oddly on a rectangular one
(no direction points along either canvas axis — see the arrow angles in
the evidence screenshots, computed via the SAME `cubeToWorld` math
hex-true mode uses, not a hand-typed table, so this isn't a rendering
artifact, it's the real shape of the convention applied somewhere it
wasn't designed for). If freeform/rectangular authoring becomes real,
whoever picks up facing needs to either accept hex-native angles on a
rectangular canvas, or design ONE convention that works for both —
reconciling two separately-invented ones later would be strictly worse.

### What `FloorPlan` (or a freeform sibling message) would need to grow

Not a request — evidence for whoever scopes P4+: a freeform canvas
response can't reuse `FloorPlan.rooms`/`connectors` (there's no room
chain), so it's a distinct message, not an extension of the existing
one. It would need, at minimum: the canvas dimensions; a wall list in the
edge-native shape above (ideally the SAME `Wall` type
`EncounterService.Space` already defines, not a parallel one); an
explicit entrance/start cell (no generator to derive it from); and
either a real `end`/goal concept on the wire for the first time, or an
explicit decision that "end" stays author-only bookkeeping the compiled
response never carries. Facing needs a field on `place:`/`FloorPlanRoom`
placements either way, hex-true or freeform — that part isn't new to
freeform authoring, freeform authoring just made it impossible to keep
deferring.
