# Dungeon Builder board — contract log (rpg-dnd5e-web#666)

Produced by the fixture-first Dungeon Builder concept (`/concepts` →
Dungeon Builder), ported from a standalone HTML prototype
(`~/game-dev/concepts/dungeon-builder/`) into this repo's real
`/concepts` sandbox. Same method as `combat-pacing/CONTRACT.md` and
`fog-of-war/CONTRACT.md`: what the concept needed, what the wire carries
today, and where those differ. Not a pre-authored feature request —
nothing here becomes a cross-repo ask until Kirk reviews the concept.

Design approval gate: rpg-project#170. After approval, implementation proceeds in order through rpg-project#176 (generated wall/door truth), #177 (authored start), #178 (floor-prop facing), #179 (canonical authored wall/door edges), and #180 (cell-authored semantic regions).

Checked against the real proto at rpg-api-protos **v0.1.115**
(`dnd5e/api/authoring/v1alpha1/service.proto`), the real `FloorPlan`
responses recorded in rpg-api PR #750/#752, a **real recorded
`PutDungeon(validate_only)` response for showcase.yaml itself**
(`fixtures.ts`'s `SHOWCASE_FLOORPLAN`), and a **live end-to-end run**
against an isolated `rpg-api:local` instance with
`RPG_AUTHORING_ENABLED=1` (see "Live verification" below) — not guessed
from memory of a superseded proposal.

## Settled early authoring model (rpg-project#175)

This supersedes earlier exploratory claims below where they conflict:

- Rooms are stable semantic regions with stable IDs; they own reveal,
  placement, spawning, scripting, and archetype meaning.
- Dungeon space owns canonical wall/door edges. Inner walls affect movement
  and line of sight without splitting a semantic room; draw another region
  only when independent gameplay identity is needed.
- Runtime `EncounterService.Space.walls` is gone. Runtime geometry is on
  `HexRecord.edges`; the flat dungeon-scoped `walls:` list remains a useful
  authoring source representation only if compilation/projection produces
  canonical edges and deduplicates shared edges.
- Holes are deferred from the early dialect. Collapse visuals use
  obstacles/props until no-floor mechanics justify a distinct primitive.
- “Target dialect” names a proposal, not a YAML version bump. Additive
  capability stays on the current document version; reserve a real bump for
  incompatible room/topology semantics.

No slice implementation starts on this concept branch. The ordered cross-repo
slices are #176 (generated wall/door truth), #177 (authored start), #178
(floor-prop facing), #179 (canonical authored wall/door edges, including inner
walls), and #180 (cell-authored semantic regions).

## Operating bar: this concept incubates the real components (2026-08-02)

#667 merged into `dev`. Kirk's direction update, verbatim intent: "our
concept could make the real components we will use while we wait for the
protos to be done and implemented." **This changes the quality bar for
everything built or touched in `src/concepts/dungeon-builder/` from here
on.** The throwaway-friendly standard that governed the concept through
#667 — "iterate fidelity later," crude-but-visible first landings, code
written to prove a shape rather than to last — ENDS here. It was the
right bar while the concept's job was discovery (find the requirement by
building the screen that needs it, per `[[outside-in-waves]]`); it is the
wrong bar now that `dev` contains this code and Kirk's own framing has
named it as the source for the real editor's components, not just their
proof-of-concept.

From now on:

- **Clean interfaces, not concept-only scaffolding.** A component should
  not deep-couple into this concept's own state shape (`DungeonDoc`/CST,
  `PlacementSelection`, etc.) any more than necessary to do its one job —
  the coupling that's fine for a spike becomes the rewrite tax the moment
  a real editor tries to reuse the piece wholesale instead of wiring it.
- **Typed against the generated proto shapes where they exist.** Where a
  real wire type already exists (`FloorPlan`, its rooms/connectors), keep
  using it directly, as this concept already does (`fixtures.ts`'s own
  doc comment: "the board component cannot tell a fixture from a real
  `PutDungeon` response"). Where no proto exists yet (everything
  target-dialect: walls, holes, mount/height, targeting, facing), that's
  exactly the gap #176–#180 are closing — build against this concept's
  own `DungeonDoc` types today, but shaped so a future proto-typed
  `DungeonDoc` swap is a type change at the boundary, not a rewrite of
  the component's internals.
- **Tests that survive extraction.** A test that only makes sense
  wired into this concept's own `DungeonBuilderConcept.tsx` harness
  isn't testing the component, it's testing the harness. Prefer testing
  a component's own props/behavior directly (this file's own
  `dungeonYaml.test.ts` already does this for the data layer — the
  bar now extends to the render layer too).
- **The graduation path is wiring, not rewriting.** When a #176–#180
  slice lands a real proto for a target-dialect field, the matching
  component (already built to the bar above) should graduate by having
  its prop types swapped to the real generated shape and its concept-only
  parsing/mutation layer (`dungeonYaml.ts`'s hand-rolled CST parsing)
  retired in favor of the real wire — not rebuilt from scratch. If a
  future graduation attempt turns out to require a rewrite anyway, that's
  a signal this bar wasn't actually met at build time, worth naming
  honestly rather than quietly absorbing as normal churn.

**What this does NOT change**: the concept is still not a pre-authored
cross-repo ask (see this file's own opening paragraph) — nothing here
becomes a server-side commitment until Kirk reviews it. It does not
retroactively demand a quality pass over everything already shipped
through #667; the bar applies going forward, to what gets built or
TOUCHED from here on, the same "don't rewrite history, note it and move
forward" principle this file already applies to the rejected
synthetic-room approach and the "v2" terminology retirement. Mechanically:
`dev` now contains this concept (no more stacking on a feature branch —
`#667`'s mega-PR shape is retired too), so new work is a fresh branch off
`origin/dev`, one coherent chunk per PR, still visible-first/self-directed
off this file's own ledger.

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

## New finding from this port: `yaml` doesn't fully close comment preservation, and that's fine

**Demoted from hard requirement to best-effort/incidental (Kirk,
2026-08-02).** The original concept brief said to use the `yaml` npm
package for comment-preserving round-trip, framed as a hard
requirement. Kirk's settled call: the builder itself never authors
comments — only a hand-editor typing directly into the YAML pane would
ever introduce one, and hand-editors own the consequences of their own
edits. Comment preservation stays exactly as good as it already is (the
CST round-trip behavior below is UNCHANGED — it works, and ripping it
out would be pure loss for zero gain), but it's no longer a gate on
anything, and the group-comment-orphaning question the finding below
raises is CLOSED AS MOOT, not solved — see its own closure note. No
further investment in comment semantics is planned unless Kirk reopens
this.

The original concept brief says to use the `yaml` npm package for
comment-preserving round-trip, implying it's a solved problem once you
reach for the right library. Two things worth knowing before assuming
that (kept for the record — see the demotion note just above for why
neither is being chased further):

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
   deleting it removes the heading even though 7 pillars remain. This
   was originally framed as a real, load-bearing UX question for the
   approved delivery slices, needing an explicit decision (attach group
   comments to the room instead of the first item? warn on delete/move
   of a comment-carrying item? accept the loss?), not just "use `yaml`".

   **Closed as MOOT (Kirk, 2026-08-02), not solved.** The scenario this
   describes only arises when a HAND-EDITOR has typed a group comment
   into the YAML pane and then the BUILDER's own UI (drag/delete) acts
   on the item it's attached to — the builder itself never authors a
   comment in the first place, so it can orphan one but never has to
   decide how to preserve one it wrote. Given comment preservation is
   now explicitly best-effort/incidental (see this section's opening
   note), that's an acceptable, honestly-recorded gap, not a defect
   pending a decision. The analysis above (the two demonstrating tests,
   the exact `commentBefore` attachment behavior) stays as accurate,
   useful documentation of how the underlying library actually behaves —
   only the "needs a decision" framing is retracted.

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
the original concept brief) shears diagonally across a wide room
chain: `hexRow(col,row) = row + floor(col/2)`, so at a fixed row,
world-Z drifts roughly linearly with column. Verified analytically, not
a porting bug. **This finding is still real hex geometry** — only the
"what should the 2D board do about it" question below has since been
settled (see "Flattened layout mode: explored and rejected," next).

### Flattened layout mode: explored and rejected (2026-08-02)

This port originally added a `flattened` layout mode (`hexLayout.ts`'s
now-removed `flatCellCenter` — plain Cartesian, no hex-parity
correction) specifically so the shear finding above could be compared
in place, one `FloorPlan`, two renderings, via a board toggle — see the
(now historical) evidence screenshots this section used to point to.
That was the right way to SURFACE the question; it was not itself the
answer. Kirk, choosing between the two once the toggle made the
comparison genuinely legible: **"I like hex. turning them into squares
feels way off and not what it will actually look like."** Hex-true is
now THE board — the toggle, `flatCellCenter`, and the `LayoutMode` type
are removed entirely (`hexLayout.ts`/`Board.tsx`/`boardGeometry.ts`/
`DungeonBuilderConcept.tsx`), not merely defaulted or hidden. The
diagonal shear itself remains exactly as true and as documented as
before — it's no longer being treated as a legibility problem a second
rendering mode should work around.

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
   argument than the writeup alone. **Superseded 2026-08-02**: the toggle
   did its job (making the comparison legible enough for Kirk to decide),
   then was removed — see "Flattened layout mode: explored and
   rejected," above. Worth having built it temporarily; not worth
   keeping once it had answered the question it existed to surface.

## What the approved design gate and ordered slices must retain

1. **Make the flattened-vs-hex-true call explicit** given the shear
   finding, rather than inheriting it from the original concept brief.
   **Done, 2026-08-02**: Kirk's call is hex-true, no flattened mode — see
   "Flattened layout mode: explored and rejected," above.
2. **Use a board contract fixture wider than 2 rooms.** The old 2-room
   smoke-test fixture cannot catch chain accumulation; the available
   3-room `showcase.yaml` fixture (see `fixtures.ts`) can.
3. ~~Make a real comment-preservation decision, not just "use the yaml
   package."~~ **Closed as moot, 2026-08-02** — comment preservation is
   best-effort/incidental (the builder never authors comments; only a
   hand-editor's own edits can orphan one). See this file's "yaml
   package doesn't fully close comment preservation, and that's fine"
   section above for the full closure note. No decision needed.
4. **Add real rolled-content fixture coverage.** `showcase.yaml` (and
   everything else checked) has zero `obstacles:` entries, so
   `RolledContentPanel`'s non-empty path is genuinely untested against
   real content.
5. **The real editor needs 3D-mode editing for mounted props.** Kirk,
   2026-08-02, after seeing the 3D preview's wall-mount rotation land
   crooked: "when we implement for real we will want to be able to edit
   in 3d mode to get the rotation right." Rotation/alignment correctness
   for a wall-mounted prop is only judgeable by looking at it mounted, in
   3D — the 2D board's own top-down view can't show whether a banner sits
   flush against its wall or floats at a wrong angle, so a 2D-only
   Inspector (today's shape) structurally can't be the last word on this
   field. This is a **real, scoped requirement for the eventual real
   editor**, not this concept's own spike scope — recorded here so the
   #176–#180 implementation slices inherit it rather than rediscovering
   it the same way this round did. Not started; this spike's 3D preview
   stays view-only (see its own "view only (spike)" banner) — the
   requirement is to make a FUTURE real editor's 3D view accept edits,
   which is a materially larger surface (drag-to-rotate/orbit-relative
   gizmo, a write-back path from 3D interaction into the same document
   the 2D board mutates) than anything this concept has built so far.

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

### Walls: edge-native authoring, projected to canonical runtime edges

The proposed `walls: [{ from: [c,r], to: [c,r], kind: solid|door }]` shape
is a flat dungeon-scoped source representation. It does **not** mirror a
current `EncounterService.Space.walls` field—that runtime field no longer
exists. Runtime wall geometry lives on `HexRecord.edges`; compilation/projection
must turn this list into canonical edges and deduplicate shared edges. Doors
remain an edge kind, not a separate list. This is still stronger than a
`grid: [[0,1,1,0],...]` solid/floor bitmap: a door has a natural edge home,
while an inner edge can affect movement/line of sight without fabricating a
new semantic room.

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
one. It would need, at minimum: the canvas dimensions; a flat authored wall
list compiled/projected into canonical `HexRecord.edges` (not a parallel
runtime wall field); an explicit entrance/start cell (no generator to derive
it from); and either a real `end`/goal concept on the wire for the first time, or an
explicit decision that "end" stays author-only bookkeeping the compiled
response never carries. Facing needs a field on `place:`/`FloorPlanRoom`
placements either way, hex-true or freeform — that part isn't new to
freeform authoring, freeform authoring just made it impossible to keep
deferring.

## Kirk's 2026-08-01 iteration: palette taxonomy, thumbnails, Save & Play, 3D spike

Four follow-ups from "love it" on the creation flow. All four shipped on
this same PR/branch (rpg-dnd5e-web#667). Evidence screenshots:
`docs/evidence/dungeon-builder-palette-categorized-thumbnails.png`,
`dungeon-builder-palette-monsters-lighting.png`,
`dungeon-builder-save-and-play-success.png`,
`dungeon-builder-creation-save-play-disabled.png`,
`dungeon-builder-3d-preview-overview.png`,
`dungeon-builder-3d-preview-zoomed.png`.

### Palette taxonomy: a proposed vocabulary, not a wire concept

`Palette.tsx` now groups into four collapsible categories — Monsters /
Obstacles & Props / Lighting / Markers — instead of one flat list.
`paletteData.ts`'s `PaletteCategory` type and `categoryForProp()` are the
new pieces. Explicitly a PROPOSED grouping, same status as the creation
flow's invented schema above: nothing on the wire carries a category
today, and it does NOT reuse `propManifest.ts`'s existing `role`
(obstacle/cover/decor) — `role` answers a different question (board-swatch
color, is-this-solid) and doesn't map onto Kirk's four buckets (brazier,
candles, and glowing-orb are all `role: 'decor'`, same as non-light
books/banners, so "Lighting" had to be a hand-picked subset,
`LIGHTING_PROP_KEYS` in `paletteData.ts`, not a derivation). If this
taxonomy becomes real, the natural home is a `category` field the toolkit
refs themselves carry, not a second client-side classification layer
sitting next to `role` forever. Shared component: the categorized palette
applies to BOTH edit mode and the New Dungeon creation flow — one
component, no divergence.

### Thumbnails: pre-baked PNGs, real assets, graceful degradation built in

Palette rows now show a 128×128 thumbnail instead of a colored
initial-square, via `paletteData.ts`'s `thumbForRef()`. Provenance:

1. `src/concepts/dungeon-builder/thumbs/ThumbHarness.tsx` — a small,
   dev-only, chrome-free R3F page (`?thumbGlb=<public-path>`) that loads
   one GLB and auto-frames it with drei's `Bounds`. Wired into `App.tsx`
   with the exact same shape as the existing `?encounterId=` →
   `PlaytestHarness` dev gate (development-mode only, no new production
   code path). Kept in the tree rather than deleted post-bake, so the next
   new palette entry can be re-baked the same way.
2. `game-dev/tools/browser/screenshot.mjs` (the established pattern this
   task named) pointed at that harness, 128×128 viewport, one PNG straight
   into `thumbs/` — no cropping/resizing needed since the canvas already
   fills the viewport.
3. Asset source: `public/models/synty/` in this worktree was NOT populated
   by `npm run assets:sync` (that script clones a fresh `rpg-game-assets`
   checkout as a sibling of the web repo) — instead `rsync`'d directly from
   the existing up-to-date `rpg-game-assets` checkout already on this
   machine (`~/game-dev/rpg-game-assets`, `main` @ `19e5bed`, verified
   `git fetch` clean) to avoid a redundant 250MB clone. Byte-identical
   result to what the real sync script would have produced; only the
   source of the copy differs.
4. All 13 refs baked clean on the first pass (12 `PALETTE_PROPS` +
   `skeleton-captain`) — zero console errors, so the "colored placeholder
   tiles are acceptable v1" fallback this task's brief pre-authorized
   was never needed for the real bake. It's still live code, though:
   `thumbForRef()` returns `undefined` for any ref with no baked PNG
   (filename mismatch, a future palette addition not yet baked) and
   `Palette.tsx`'s `Row` falls back to the original colored-square
   rendering in that case — never a broken `<img>`.

### Save & Play: a real write, verified past the UI's own success banner

Edit mode's `YamlPane` grew a "Save & Play" button
(`useSaveDungeon.ts`) that calls the SAME `authoringClient.putDungeon`
the live preview already uses, but with `validate_only: false` — a real,
explicit, user-triggered persist, not the preview's debounced
`validate_only: true` read. `PutDungeonResponse` carries no `key` field
(see `service_pb.ts`'s own doc comment), so the hook echoes back the
request's own key as "what got saved" rather than inventing a response
field that doesn't exist.

On success the panel shows `Saved as "<key>". Open http://localhost:3001/
and pick "<key>" in the dungeon dropdown to play it.` — a plain link, no
deep-link/preselect plumbing. That was a deliberate scope cut per this
task's brief ("build NO new lobby plumbing"): `LobbyFlow.tsx`'s
`selectedDungeonKey` has zero existing URL-param wiring today
(`useState('')`, no `URLSearchParams` read anywhere in that file), so
adding a preselect would mean building new lobby plumbing, not using
"trivially cheap existing routing" — the brief's own condition for doing
it wasn't met, so it was skipped rather than half-built.

Creation mode's `ProposedYamlPane` gets a permanently-disabled "Save &
Play" with an honest tooltip ("Proposed schema — the server can't compile
this yet...") instead of a working button — there is no real
`PutDungeon`-compatible YAML to send from that mode (the proposed
wall/start/end/facing schema is 100% invented, see this file's "Proposed
schema" section above), so a "working" button there would either lie or
silently no-op.

**Verified past the point most concept work stops**: clicked the real
button against the isolated `rpg-api-lab3-authoring` instance (same
container this file's "Live verification" section above already
describes; this worktree's `.env.local`-equivalent points its dev server
at `:8090`, confirmed via `/proc/<pid>/environ`, not the shared
`:8080`/gate-off instance `.env` alone would suggest). Edited the loaded
`showcase.yaml`'s `key:` to `showcase-thumb-test`, clicked Save & Play,
got the success banner — then, independently of the UI's own claim,
called `LobbyService.ListDungeons` directly via `grpcurl` with the app's
own dev-auth header shape (`authorization: Dev test-player`, read out of
`src/api/client.ts`'s `authInterceptor`) and confirmed
`showcase-thumb-test` — "The Shrine Hall" now appears in the real list
alongside `fog-lab`/`reference-tomb`. The saved dungeon was left in place
(harmless, isolated local test container Kirk already knows about) rather
than cleaned up — it's itself a piece of evidence the loop is real, and
matches exactly what Kirk will see if he clicks the same button.

### 3D preview: NOT a stop — a working minimal spike, floor + props + monsters

The brief's own instruction was to stop and write a cost assessment if a
minimal version didn't fit. It fit. `DungeonPreview3D.tsx`
(`src/concepts/dungeon-builder/preview3d/`) is a real, working 3D pane
behind a 2D/3D toggle in edit mode's board header — screenshots above show
the full 3-room showcase chain (pillars, statues, glowing orb, tomb
pieces, the skeleton-captain boss) rendered correctly, including the
door-row gap reading as a real break in the floor, matching the 2D
board's own legality rule.

**What's genuinely reused, not re-implemented:**

- `SyntyHexFloor` (`components/hex-grid/SyntyHexFloor.tsx`) — the real
  floor-tile renderer, taken as-is. Verified by reading it end-to-end: its
  only required inputs are a `Map<string, AbsoluteFloorTile>`
  (`{x,y,z,roomId}`, plain cube coords) and a hex size — genuinely no
  encounter/combat-state coupling at all, every other prop is an optional
  crypt-theme/memory/lighting extra that safely omits. This was the
  encouraging finding that changed the shape of this whole spike: the
  floor renderer everyone would guess is entangled with the live game
  route turned out not to be.
- `PropModel` (`components/hex-grid/PropModel.tsx`) — the real prop GLB
  renderer, taken as-is, same self-contained shape (`variant` + `position`
  - optional `rotationY`/`remembered`).
- `cubeToWorld`/`HEX_SIZE` (`hexMath.ts`) and `cubeAtColRow`
  (`wallRuns.ts`, re-exported through this concept's own `hexLayout.ts`)
  — the same coordinate primitives the 2D board already reuses (see this
  file's "the floor plan shears diagonally" finding above), extended to
  3D world positions the same way.

**What's genuinely new, and why it couldn't be the existing thing:**

- `PreviewMonsterModel.tsx` — a ~45-line component mirroring `PropModel`'s
  shape (load, clone, place) for monster GLBs via the real
  `resolveMonsterModelUrl`. The game's actual monster renderer lives
  inside `HexEntity.tsx`, but folded into 638 lines that also drive
  movement-path animation (`useHexMovePath`), facing (`useEntityFacing`),
  downed/dead tilt, and remembered-tint — none of which a static preview
  wants, and none of which was separately exported to reuse in isolation.
  Writing a small new component was cheaper and more honest than
  threading a static "no movement, no combat" mode through that component.
- `DungeonPreview3D.tsx` itself — a genuinely new `<Canvas>` composition
  (floor + props + monsters + drei `Bounds`/`OrbitControls`), not a reuse
  of `HexGrid.tsx`. `HexGrid.tsx` (1194 lines) is the real battle-map
  component and was deliberately NOT reused directly — its prop surface is
  built entirely around a live combat encounter (`HexGridEntity[]` with
  HP/movement-path/turn state, `CombatState`, movement-range borders, path
  preview, turn-order overlay, click-to-move/attack handlers) that this
  static, no-combat preview has no analog for. Feeding it fake/empty
  values for all of that would be pretending to reuse a combat component
  while stripping out everything that makes it one — this is the
  "encounter-state entanglement" this task's brief predicted, and it's
  real, just scoped to `HexGrid.tsx` specifically rather than the whole
  rendering stack.

**Deliberately NOT rendered: walls and doors.** Three independent
reasons, not one scope cut: (1) Kirk's own ask listed "floor + props +
monsters" only; (2) `FloorPlan` carries no wall geometry on the wire at
all — only `door_row` (a row index) and `connector.column` (see this
file's "connector door position as a cell must still be derived" finding
above) — so a real wall render would mean INVENTING synthetic boundary
edge geometry for the room chain, not translating anything that exists;
(3) the game's real wall renderer
(`WallRunMesh`/`wallRuns.computeWallRuns`, 1334 lines) consumes
encounter-shaped `Wall[]` edge lists, not a `FloorPlan` room chain —
reusing it here is a separate, real piece of design+implementation work
(exactly the synthetic-edge-geometry step above), not something this
spike's timebox could honestly fold in alongside everything else this
iteration shipped.

**2026-08-02 update — the door-row void is the SAME gap, seen a third
time.** `DungeonPreview3D`'s floor genuinely just skips `row ===
floorPlan.doorRow` when building tiles (`buildFloorTiles` in
`DungeonPreview3D.tsx`) — no wall renders there, so it reads as a plain
gash of black void cutting across the floor, not a wall with a door in
it. Kirk saw this live and confirmed it's the same underlying absence
this file already had two other findings about, not a new, unrelated
gap: the 2D board answers "where can't I click" by STRIPING the door row
(the amber hazard pattern, this file's "loud beats subtle" UX learning
below); the 3D preview answers the same missing-geometry question by
VOIDING it (no floor tile, so nothing to texture); and the creation
flow's proposed `walls:` schema (this file's "Proposed schema" section
above) exists specifically because an author needs to DRAW a door, not
just view where dungeonspec's `door_row` derivation puts one. Three
different consumers, three different UI treatments, ALL standing on the
identical absence: `FloorPlan` has no wall/door edge geometry on the
wire, only `door_row` (a row index) and `connector.column` (a column
index) to derive a legality rule from — never an actual wall segment or
door position a renderer could draw. That convergence is itself the
strongest argument in this file for growing `FloorPlan` (or a sibling
message) a real edge-native authoring list that compiles/projects to
canonical `HexRecord.edges` (this file's "walls: edge-native authoring"
finding above) — three independent surfaces hitting the identical gap and
inventing three independent workarounds is exactly the signal
CLAUDE.md's proto-versioning section says to listen for, not something
each consumer should keep quietly working around forever.

**Also not attempted, scope-honest:** click-to-place in 3D (the pane is
view-only — orbit/zoom, edit via the palette/2D board/YAML same as
before), lighting/mood parity with the real game's crypt theming
(`SyntyHexFloor`'s `spaceTheme`/`poolLights` props exist and this spike
could pass them, but didn't — flat default lighting only), and creation
mode (no `FloorPlan` exists there to render — the toggle only appears in
edit mode).

**Verdict for whoever scopes this past a spike**: the floor+props path is
cheap to make real (it already is, this PR ships it) because
`SyntyHexFloor`/`PropModel` turned out to be exactly as reusable as hoped.
The monster path needed one small new component, also now real. Walls are
the one piece that's genuinely a separate body of work — not because
reuse failed, but because `FloorPlan` has nothing on the wire for a wall
renderer (real or reused) to consume yet, the same gap this file's
`FloorPlan` findings already describe for the freeform-canvas case above.

## Kirk's 2026-08-02 iteration: expandable sections, collapsible panels, Walk it, lighting/free-mode follow-ups

"Loving it. top notch" — rotate/drag interaction specifically praised.
Four more follow-ups, all shipped on the same PR/branch. Evidence:
`docs/evidence/dungeon-builder-sections-expanded.png`,
`dungeon-builder-panels-collapsed-max-map.png`,
`dungeon-builder-panels-remembered-per-mode.png`,
`dungeon-builder-walk-it-success.png`.

### Palette: from dropdown-read to genuinely expandable sections

Kirk's exact words: "the drop downs could be expandable sections." The
2026-08-01 palette (this file's earlier section) WAS already an
accordion — independently toggleable, more than one open at once — but
its header rendering (an isolated, fully-rounded pill button with a tiny
far-right ▸/▾) apparently read as a `<select>`-style trigger rather than
a section that expands in place, not a functional gap. Fixed purely
visually: header and content now share ONE bordered container (so
opening a section visibly grows that same box downward instead of
revealing an unrelated list below a separate button), and the chevron
moved to the LEFT of the label — the position most accordions/file-trees
use — with a background tint distinguishing the open state. Worth
recording as its own finding: an accordion that is functionally correct
can still read as the wrong control if its visual affordance borrows too
heavily from a different pattern's conventions (rounded-pill-with-count
reads as "trigger for a hidden list," not "section that grows").

### Collapsible side panels: state ownership is the actual design decision

Both `Palette`/`YamlPane` (edit mode) and their creation-mode
equivalents (the Tools+Palette sidebar, `ProposedYamlPane`) collapse to a
28px labeled strip via a new shared `CollapsibleSidePanel.tsx`, freeing
their ~250px/420px width back to the board — Kirk's "max map" ask.

The one real design decision here wasn't the visual chrome, it was WHERE
the collapsed/expanded boolean lives. `Palette`/`YamlPane` themselves
were deliberately left untouched (no new props) — the wrapper owns
collapse purely as an outer concern, so wrapping an existing component
in it can never change that component's own internal behavior. The
`collapsed` state itself lives in `DungeonBuilderConcept` — NOT inside
`CreationConcept`, even for creation-mode's own panels — because
`DungeonBuilderConcept` never unmounts when the edit/create tab flips
(only the JSX subtree it returns differs), while `CreationConcept` does
unmount whenever `mode` leaves `'create'`. State kept inside a component
that unmounts resets on remount; state kept in the parent that never
unmounts survives a tab switch. This is "remembered per mode," verified
live: collapsed both edit panels, switched to New Dungeon (rendered
expanded — a fully independent pair of flags, not a shared one),
collapsed those too, switched back to Edit, and confirmed edit's panels
were STILL collapsed rather than reset. A subtler bug caught while
building this: the wrapper's inner content slot must stay row-direction,
not column — `Palette`/`YamlPane`'s own root elements set `flex: '0 0
<width>px'` expecting to be a direct child of a ROW flex container (their
original, unwrapped position); nesting them inside a COLUMN flex
container instead would silently reinterpret that same flex-basis value
as a HEIGHT rather than a width. Caught by reasoning about the CSS before
it shipped, not by a visual bug — worth flagging since it's exactly the
kind of thing that looks fine in a quick glance and only breaks once
content is tall enough to reveal a clipped panel.

### Walk it (no monsters): a real save, honest about the one thing it can't do

A second "Save & Play" action, `<key>-walk`, with monster `place:`
entries stripped (`dungeonYaml.ts`'s `stripMonsterPlacements`/
`buildWalkItYaml`, `dungeonYaml.test.ts` covers both). The one constraint
this task's brief called out by name — `validateBossCardinality`, a
boss-archetype room must declare a boss — is real and was NOT worked
around: `stripMonsterPlacements` only ever touches `place:` lists, never
`boss:`, so a boss-room's boss pin survives into the walk variant
unchanged. The alternative (rewriting the room's `archetype` away from
`boss` to dodge the validator) was explicitly ruled out by the brief and
not attempted here either — that would produce a dungeon whose compiled
`FloorPlan` no longer matches what the author actually built, a much
worse dishonesty than a walk mode that still has its boss standing
there. The UI says so directly: the success panel's `honestyNote` reads
"Boss remains — real free-roam mode needs server support," and the
button's own tooltip says the same before the click. See "Free mode"
below for what closing this gap for real would need.

**Verified past the button's own success claim**, same standard as Save
& Play: clicked Walk it live against `rpg-api-lab3-authoring` (a fresh
`walkit-test` base key with a synthetic injected monster placement, since
showcase.yaml's own `place:` lists are monster-free — only its `boss:`
uses a monster ref), then confirmed via a direct `ListDungeons` grpcurl
call that BOTH `walkit-test` and `walkit-test-walk` persisted
server-side, not just a client-side success banner.

### Proposed: a `lighting:` config block for the dungeon YAML

Kirk's ask: an intensity knob now, full light-source configuration
later. This sits in the same "proposed, not real" bucket as the creation
flow's `walls:`/`start:`/`end:`/`facing:` schema above — nothing here is
implemented, this is a sketch for whoever picks it up. Minimal coherent
shape, growing in place rather than needing a later breaking change:

```yaml
lighting:
  ambient: 0.8 # 0..1, dungeon-wide multiplier — the only knob today
  # sources:          # P4+: per-source config, once this exists at all
  #   - ref: dnd5e:props:brazier
  #     at: [1, 1]
  #     intensity: 1.0
  #     radius: 3
```

Precedent this leans on: the game's rendering stack already has a real,
shipped instance of exactly this "tuning dial that starts as a query
param and could graduate to config" shape — `?wallHeight=`/`?wallCutaway=
1`/`?floorPools=1` (`calibrationConstants.ts`, `EncounterMap.tsx`,
`PlaytestMap.tsx`) are dev-only URL dials over the same kind of visual
knob (wall height, wall stub-vs-tall, floor mood-light pooling) this
`lighting:` block would make an AUTHORED, per-dungeon setting instead of
a runtime query param every session has to re-specify. The direction
those dials point — start with one coarse global knob, grow toward
per-source config later — is the same direction `ambient` growing into
`sources` above follows; this isn't a new pattern for this codebase, it's
the existing dial-growth pattern moved from a URL param onto the
authored document.

### Follow-up, named not built: "free mode" needs real server support

`DungeonPreview3D`'s 3D pane and Walk it's monster-stripped variant both
run into the same wall: neither can produce a TRUE no-aggro author
walkthrough today. Walk it still has to leave a boss-archetype room's
boss standing (validateBossCardinality, above); nothing in this concept
touches combat/aggro logic at all — StartEncounter has no dial for "spawn
this dungeon but nothing acts hostile." A real "free mode" needs an
explicit StartEncounter option (or a sibling RPC) that either omits
monster spawning entirely or spawns monsters in a genuinely passive
state, which is toolkit+api work, not something a client-side YAML
transform can produce. Naming this here rather than letting Walk it's
honesty note stand alone as the only trace of it: whoever scopes P4+
should treat "author walkthrough with no combat" as its own real
requirement with a real server-side shape, not assume Walk it already
covers it.

## Door/connector editing (Kirk's 2026-08-02 ask, "I cannot set a wall or a door — just realized the gashes are walls")

Evidence: `docs/evidence/dungeon-builder-door-locked-dc-panel.png`,
`docs/evidence/dungeon-builder-wall-explainer.png`.

### The fourth consumer signal on the wall-geometry gap

This is the same absence this file has now named three times over
(the door-row-void section above, this iteration's 3D preview section,
the creation flow's proposed edge-native `walls:` schema) — but this
time it's not a finding written up after inspecting the code, it's
Kirk hitting it directly as an author: he clicked where a wall visibly
is and found nothing behind it. Four independent surfaces now converge
on the identical gap (`FloorPlan` carries no wall/door edge geometry,
only `door_row`/`connector.column` to derive legality from): the 2D
board's own door-row cells (striped, not authored), the 3D preview
(voided, not rendered), the creation flow's proposed schema (drawn,
but not real), and now this — an author reaching for the ONE thing
that visually reads as "a wall" on the real board and finding zero
affordance. Four is no longer a coincidence pattern; it's the strongest
version yet of the argument this file has been building for growing
`FloorPlan` (or a sibling message) a real edge-native wall list.

**Update, 2026-08-04 — the FIRST two of these four surfaces are now
closed for real, response-side.** rpg-api#767 grew `FloorPlan` exactly
the edge-native `edges` list this section argued for; the wire-edges
rendering unit ("Wire-edges rendering unit," below, this file's most
recent section) makes the 2D board's door-row cells and the 3D preview's
void BOTH consume it. **Still open, unchanged by this unit**: the
creation flow's proposed `walls:`/`wallLines:` schema is authoring — a
from-scratch canvas has no compiled `FloorPlan` to receive edges FROM at
all, so nothing about `FloorPlan.edges` touches it; that's rpg-project#179
(canonical authored wall/door edges) plus toolkit#881/rpg-api#768, tracked
separately. Four consumers named one real gap; two of the four needed a
response field, and that field now exists and is wired — the other two
need a request-side (authoring) contract, which is a different, still-
open piece of work.

### What the schema actually allows for a connector — verified against the real dungeonspec Go source, not guessed

Read directly from `rpg-toolkit/encounter/dungeonspec/spec.go` and
`validate.go` (not inferred from the wire or the YAML alone) — this is
the one place this task's brief specifically asked to verify rather
than assume, since it "matters for the wall-schema design":

```go
// spec.go
type ConnectorSpec struct {
	From   string      `yaml:"from"`
	To     string      `yaml:"to"`
	Locked *LockedSpec `yaml:"locked,omitempty"`
}
type LockedSpec struct {
	DC      int    `yaml:"dc"`
	Ability string `yaml:"ability"`
}

// validate.go's validateChain — the load-bearing constraint
func validateChain(spec *DungeonSpec) error {
	if len(spec.Connectors) != len(spec.Rooms)-1 {
		return fmt.Errorf("connectors must form a linear chain: ...")
	}
	for i, c := range spec.Connectors {
		if c.From != spec.Rooms[i].ID || c.To != spec.Rooms[i+1].ID {
			return fmt.Errorf("connectors must form a linear chain: ...")
		}
	}
	return nil
}
```

**The answer to "arbitrary pairs vs chain-constrained": chain-constrained,
strictly, with zero flexibility.** A spec MUST have exactly
`len(rooms)-1` connectors, and connector `i` MUST join `rooms[i]` to
`rooms[i+1]` — always, no exceptions, no arbitrary room pairs, no
skipping a room, no branching. `from`/`to` are not independently
authorable at all; they're a pure function of the room list's own order.
This is why the UI below offers NO add/remove/repoint affordance for
connectors — building one would be building a control for a state
`dungeonspec.Validate` can never accept, exactly the "no fake
affordances" instruction in this task's brief. The ONLY field a
connector's author-facing surface actually varies is `locked` — present
or absent, and its `dc` (1-30, `minLockDC`/`maxLockDC` in validate.go)
and `ability` (one of `str`/`dex`/`con`/`int`/`wis`/`cha`,
`rulebooks/dnd5e/abilities.List()`) when present. Confirmed against a
real fixture, not invented: `rpg-toolkit/encounter/dungeonspec/
fixtures_test.go`'s `placedTombYAML` (this IS `reference-tomb.yaml`'s
real content) has `{ from: trap-crossing, to: tomb, locked: { dc: 12,
ability: dex } }` — the exact shape `dungeonYaml.ts`'s new
`setConnectorLocked` now produces.

**This matters directly for the wall-schema design** (the brief's own
framing): if/when `FloorPlan` grows real wall/door edge geometry, a
compiled connector's chain-constrained shape is precedent for keeping
the SAME discipline on the new field — position/topology
server-derived, only the gameplay-relevant knob (locked, someday
perhaps a wall's material/breakability) author-facing. The creation
flow's proposed edge-native `walls:` schema (this file's earlier
section) is a genuinely different, freeform model — worth naming
explicitly that these are two different design points (chain-derived
topology vs freely-drawn topology) a single future wall schema will
have to reconcile, not assume one implies the other.

**A confirming wire detail, found while implementing this**: the
compiled `FloorPlanConnector` (unlike `FloorPlanRoom`) already echoes a
`locked: bool` field back on the wire (`door_id`, `locked`,
`from_room_id`, `to_room_id`, `column` — service_pb.ts) — NOT `dc`/
`ability`, just the boolean. Nice small confirmation that the server
already tracks "is this door locked" as a real compiled fact, even
though the client has to keep the dc/ability detail in its own parsed
`DungeonDoc` (the compiled response has nowhere to put them).

### The UI: exactly what the schema allows, nothing invented

`ConnectorInspector.tsx` — clicking a door cell (the `db-cell-door`
band, at `[connector.column, door_row]`) opens this instead of the
previous unconditional "read-only overlay" rejection toast. Shows the
derived from/to + position (explicitly labeled "not authorable"), a
`locked` checkbox, and — only when checked — a DC number input (1-30)
and an ability dropdown (the six real abbreviations). No add/remove
connector button anywhere, per the chain-constraint finding above.

`WallGashExplainer.tsx` — clicking any OTHER wall-band cell (previously
a complete no-op; CSS didn't even mark it interactive) now opens this:
a plain statement that this cell is derived, not authored, plus a
"Prototype it in New Dungeon →" button that jumps to the creation
flow's freeform wall-drawing tool (the one place walls genuinely are
authorable today, even if only as proposed schema). Both panels are
mutually exclusive with the existing placement `Inspector` and with each
other — one `clearOtherSelections` helper in `DungeonBuilderConcept.tsx`
keeps that invariant every place a selection can change, the same
discipline the palette/placement pair already followed before this
iteration.

**Verified live, both directions** — not just that a well-formed edit
succeeds, but that the server genuinely validates what gets sent, same
standard as Save & Play/Walk it: locked a connector with `dc: 15,
ability: dex` and confirmed the live `validate_only` preview accepted it
cleanly (round-tripped into the YAML pane exactly as `{ from:
antechamber, to: shrine, locked: { dc: 15, ability: dex } }`); then set
`dc: 99` (out of `dungeonspec`'s real 1-30 range) and confirmed the live
preview surfaced the REAL server error ("lock dc must be between 1 and
30, got 99") rather than silently accepting it — proof this editing
surface talks to the actual validator, not a client-side approximation
of it.

## Kirk's reframe (2026-08-02, same day): one target dialect, kill the real-vs-proposed seam

Kirk, looking at the door/connector work above land in the "real" Edit
tab while walls/start/end/facing stayed quarantined in "New Dungeon"'s
purple-styled proposed-schema pane: "let's make the yaml that works the
way we want it to. this is the point of the concept. make this easy for
future you to understand." The full spec this section implements against
is **`TARGET-YAML.md`** (new file, this repo) — read that first; this
section is the implementation record, not a restatement.

**The core move**: `DungeonDoc` (`dungeonYaml.ts`) grew target-dialect
fields directly — `canvas`, `walls`, `holes`, `start`, `end`, `lighting`, and a
`facing` key on every `place:`/`boss:` entry — instead of a second,
incompatible type living only in the creation flow. One document, one
YAML pane, some of its fields not yet compiled server-side. There is no
longer a "proposed schema" ghetto in edit mode: the same board that
shows compiled rooms/props now ALSO shows authored walls/holes/start/end,
distinctly styled (dashed/muted, `pointer-events: none` so clicks pass
through to the real cell handler beneath) but on the SAME view.

### The connector question this task's brief specifically asked to verify

**Answer: chain-constrained, not arbitrary pairs — verified against the
real Go source**, not guessed. `rpg-toolkit/encounter/dungeonspec/
validate.go`'s `validateChain`: a spec must have exactly `len(rooms)-1`
connectors, and connector `i` must always join `rooms[i]` to
`rooms[i+1]`. `from`/`to` are a pure function of room declaration order —
never independently authorable. This directly informed the wall-schema
design: `walls:`/`holes:` in TARGET-YAML.md are, for now, freeform
(any `[col,row]`, any edge) because nothing server-side constrains them
yet — but the connector precedent is recorded as a real design option for
whoever eventually makes wall geometry real (constrain topology
server-side, leave one gameplay knob author-facing — the same shape
`locked:` already has), not assumed to be the only path.

### What shipped, in order

1. **`TARGET-YAML.md`** — the full annotated dialect: every target-dialect
   field, the legacy `version: 2` marker's real meaning (a concept-only UI
   signal, later retired — Kirk's settled model keeps additive
   capabilities on `version: 1`; the server is NEVER sent anything but
   `version: 1` and the stripped subset), the v1-subset strip table, the
   compile-badge approach, and the Structural category's render/semantics
   for holes.
2. **`dungeonYaml.ts` target-dialect layer** — parsing (tolerant: every
   target-dialect field absent/null/empty round-trips a pure v1 document
   unchanged, confirmed by test), mutators (`toggleWall`/`toggleWallKind`/
   `toggleHole`/`setStart`/`setEnd`/`setLightingAmbient`/
   `setPlacementFacing`/`setBossFacing`), and `stripToV1Subset` (strips
   every target-dialect field, forces `version: 1`, reports what got
   dropped + whether ≥2 rooms remain). Relaxed the room-count guard:
   `rooms: []` is now a legitimate target-dialect draft (only a genuinely
   MISSING `rooms:` key is a shape error) — a from-scratch canvas has to
   be able to exist before any room is declared.

   **Real bug the new tests caught, not inspection**: `wallIndexAt`/
   `holeIndexAt` compared `YAMLSeq.items[n]` (an unresolved `Scalar`
   wrapper for anything built via `cst.createNode`) against raw numbers,
   which never matches — every wall/hole lookup silently failed. Fixed to
   use `.get(n)`, the same auto-resolving accessor `findRoomSeqIndex`
   already used elsewhere in this file. Worth naming: this is exactly
   the kind of bug a test catches and a screenshot doesn't (the FIRST
   toggle always "worked" by construction — it's the SECOND lookup, on
   an already-round-tripped node, that silently failed).

3. **Live preview now compiles the v1 subset, not raw target-dialect text**
   (`usePutDungeonPreview.ts`) — sending a target-dialect-bearing document
   verbatim to `PutDungeon` risked an unhelpful decode-level failure instead of a
   real `field_errors` response. A not-yet-shape-parseable mid-edit
   document skips that tick silently rather than misfiling a parse
   failure as a request/field error.
4. **Structural palette category** (Wall/Door/Hole) + Start/End tools in
   Markers, all badged "not yet compiled server-side" (originally `v2`,
   renamed `dialect` in the 2026-08-02 terminology sweep — see this
   file's own section on that sweep, below). Selecting one arms a
   `BoardTool` (`types.ts`)
   `Board.tsx`'s click handlers check before falling into ordinary
   placement logic — the real connector door always wins over any active
   tool on its own cell. `WallGashExplainer` (the no-tool-selected
   fallback) no longer says "go to New Dungeon" — Kirk's own follow-up
   correction the same day — it now points at the Structural category in
   THIS view, since walls are authorable right here now.
5. **Compile-badge summary + Save & Play → "Save the compilable subset"**
   (`YamlPane.tsx`) — a `CompileBadgeStrip` names exactly which
   target-dialect constructs are present ("Uses: 2 walls, 1 hole — not yet compiled
   server-side"); Save & Play becomes "Save the compilable subset" the
   moment any are, sends the STRIPPED yaml either way, and disables
   entirely when stripping would leave fewer than 2 rooms (genuinely
   nothing to save, not just something to warn about). The success panel
   carries the dropped-fields list as an honesty note, the same pattern
   Walk it already established.
6. **3D preview renders holes** — `DungeonPreview3D.tsx`'s
   `buildFloorTiles` skips a hole's cell, same shape as the pre-existing
   door-row skip. Exactly the cheap render Kirk predicted ("simply omit
   the floor hex") — `SyntyHexFloor` only ever renders what's in the tile
   map it's handed.

**Verified live, every piece, not just unit-tested**: authored a wall via
the Structural category and watched it round-trip into the YAML pane and
render on the board; toggled a hole and a start marker the same way;
watched the compile badge appear the moment a target-dialect construct existed and
disappear when none did; clicked "Save the compilable subset" and
confirmed BOTH the success panel's saved key AND its "dropped: 1 wall"
honesty note; marked a hole, switched to the 3D pane, and confirmed the
floor mesh has a real gap there, not just a dark tile.

### What did NOT ship this round — named, not silently dropped

- **The "New Dungeon" tab is NOT internally unified onto the same CST.**
  It still runs `CreationState`/`creationTypes.ts`'s own bespoke data
  model and its own `ProposedYamlPane`. What DID change: TARGET-YAML.md
  is now the single spec BOTH sides' field names/shapes are defined
  against (no more `canvas:`-only-freeform vs `rooms:`-only-chain
  mismatch at the SCHEMA level) — but the two React subsystems are still
  separate code, not one board. Kirk's own framing ("New Dungeon remains
  the blank-canvas creation entry, not the only home of the target
  dialect") is satisfied for what it says — edit mode is no longer the
  ONLY place target-dialect constructs live — but a full merge of the two component
  trees onto one `DungeonDoc`/CST is real, separate follow-up work, sized
  similarly to everything in this section combined, not something a
  single round could respons­ibly fold in alongside it.
- **Hole is not wired into creation mode's own Tools strip.** Wall/Door/
  Start/End already existed there before this round; Hole is new and
  only landed on the shared `Palette`'s Structural category, which
  creation mode explicitly hides (`showBoardTools={false}`) to avoid a
  second, dead-clicking set of controls for the same actions. Adding a
  sixth "Set Hole" tool to creation's own strip is a small, well-scoped
  follow-up, not attempted here given the rest of this round's scope.
- **Wall/hole/start/end authored beyond the compiled `FloorPlan`'s
  current bounding box may render out of view.** The SVG viewBox is
  still sized off the room/connector loop, as before this round — a
  truly from-scratch canvas authoring far beyond any declared room's
  columns wasn't exercised live this round (everything tested built on
  showcase.yaml's existing 3-room chain, which already covers the area
  anything was drawn in). Worth fixing before "New Dungeon" genuinely
  starts from zero rooms in the unified board, not before.

## Kirk's 2026-08-02 follow-up: z-axis (`mount`/`height`), monster

`targeting`, and the linear-chain finding written into the dialect

Two more target-dialect constructs, requested alongside the reframe above: a height
component for wall-mounted props (the dialect's first departure from the
floor plane), and authorable monster AI targeting as a REFERENCE key
(Boundary Rule — the builder sets a string, only the toolkit's monster
decision chain could ever give it meaning). Also folded in: writing up
this task's own earlier finding that today's chain-constrained connectors
mean v1 can only express LINEAR dungeons, and recording Kirk's framing
that the dialect is expected to permanently run ahead of what's
compilable — the badge/subset-save mechanism is the steady state, not a
transitional shim.

### What shipped, in order

1. **`TARGET-YAML.md`** — new "z-axis: `mount` + `height`" section (why
   `mount: 'floor' | 'wall'` + `height: number` beats a bare `z:` field —
   mount carries intent, not just a number — and reuses the existing
   `at`/`facing` fields rather than inventing a parallel wall-reference
   system; documents what `PlacedEntry` (rpg-toolkit `spec.go`) and
   `PropModel.tsx` would need if this ever compiles); new "Monster
   targeting" section (vocabulary `lowest-health | lowest-ac | closest`,
   framed explicitly as an open feature-request list against the
   toolkit's monster-AI work, not an implementation); extended the
   connector/wall section with "v1 can only express LINEAR dungeons" and
   "the linear chain is a special case of drawn walls + placed doors, not
   a separate, permanent geometry model"; preamble now records Kirk's own
   framing verbatim — "what we built was just to start... we cannot be
   held down by our early ideas" — as the operating assumption for the
   whole file, not a note about one feature.
2. **`dungeonYaml.ts` target-dialect layer** — `Mount` type,
   `PlacementDoc`/`BossDoc` gain `mount`/`height`/`targeting`; parse
   helpers tolerant of absent/wrong-typed input (matches the existing
   target-dialect-field convention);
   mutators `setPlacementMount` (sets mount+height together, clears both
   together — never a `height:` orphaned without `mount: wall`),
   `setPlacementTargeting`, `setBossTargeting`; `stripToV1Subset` drops
   all three, reporting `wall-mount (N placements)` and
   `targeting (N placements)` in the dropped-fields list. 37/37 tests
   passing, including the round-trip and strip cases for all three new
   fields.
3. **Inspector.tsx** — targeting `<select>` (shown for monster
   placements and boss, badged "not yet compiled server-side" — see the
   terminology-sweep section below for the `v2` → `dialect` badge rename)
   and a wall-mount checkbox + height
   `<input type="number">` (shown only for `WALL_MOUNTABLE_REFS` —
   deliberately just `dnd5e:props:wall-banner` this round, not every
   prop) wired into `DungeonBuilderConcept.tsx`'s `handleSetMount`/
   `handleSetTargeting`.

**Real bug found and fixed while live-verifying the wall-mount UI, not
inspection**: clicking any non-boss placement marker on the board
silently failed to open the Inspector — no error, no dialog, nothing.
Root cause was in `handleMove` (`DungeonBuilderConcept.tsx`), pre-dating
this round: `Board.tsx`'s marker `<g>` starts a drag on `onPointerDown`,
and even a plain click still fires the SVG's `onPointerUp`, which commits
a zero-distance "move." `handleMove` unconditionally reset
`selectedPlacement.index` to `doc.rooms.find(...).place.length` — one
past the last valid array index — using the pre-mutation `doc`. That's
the _correct_ index only for a cross-room append; for a same-room move,
`movePlacement` only rewrites `at` in place (verified against its source)
so the item never changes index, and the reassignment silently pointed
selection past the end of the array. `Inspector.tsx`'s
`room.place[selected.index]` then read `undefined`, its
`if (!ref || !at) return null` guard fired, and the panel just didn't
render — with no console error and the mode banner still (correctly)
saying "Selected a placed piece," which is what made it look like a
click-targeting problem rather than a state bug. Boss selection never
hit this path (`if (!sel.boss)` guards the reassignment), which is
exactly why boss-targeting verification worked cleanly on the first try
while every wall-banner attempt failed. Fixed by only reassigning the
index on an actual cross-room move; a same-room move now keeps
`sel.index` unchanged. This was a real regression in the base
click-to-inspect interaction for every non-boss placement — not scoped
to mount/targeting — worth the fix landing in this round rather than
being logged as a known issue, since it silently broke the pre-existing
`blocks_movement`/`blocks_los` checkboxes too.

**Verified live**: clicked the boss pin, set `targeting: closest` in the
Inspector, confirmed the YAML updated to
`boss: { ref: "dnd5e:monsters:skeleton-captain", at: [ 5, 5 ], targeting: closest }`
and the compile badge read "Uses: targeting (1 placement) — not yet
compiled server-side." After the `handleMove` fix, clicked a wall-banner
marker, checked "wall-mounted," set height to `2.5`, confirmed the YAML
updated to
`{ ref: "dnd5e:props:wall-banner", at: [ 5, 0 ], blocks_movement: false, blocks_los: false, mount: wall, height: 2.5 }`
and the compile badge read "Uses: wall-mount (1 placement) — not yet
compiled server-side"; unchecked it and confirmed both `mount` and
`height` cleared together, leaving the entry back to its plain v1 shape.
Evidence: `docs/evidence/dungeon-builder-monster-targeting-inspector.png`,
`docs/evidence/dungeon-builder-wall-mount-height-inspector.png`.

### What did NOT ship this round — named, not silently dropped

- **`WALL_MOUNTABLE_REFS` covers only `dnd5e:props:wall-banner`.** Other
  wall furniture Kirk named as coming later (sconces, etc.) isn't in the
  palette yet, so there was nothing real to wire the checkbox to; the set
  is a one-line addition once those refs exist.
- **No renderer changes.** `mount`/`height` are dialect-only this round —
  `PropModel.tsx` still places every prop on the floor plane regardless
  of what's authored; TARGET-YAML.md names what it would need (a wall
  reference plus a vertical offset) but doesn't build it, matching this
  round's brief ("UI: if cheap ... otherwise doc-only").
- **`targeting`'s vocabulary (`lowest-health | lowest-ac | closest`) is
  a starting list, not validated against anything real.** There is no
  toolkit monster-AI decision chain yet for these keys to reference —
  the dropdown's options are exactly the open "feature request" list
  TARGET-YAML.md now documents, nothing more.

## Kirk's 2026-08-02 follow-up round: Hole in creation mode, viewBox

growth, and a scoped (not attempted) plan for the CST unification

Three items from this same day's brief. Two shipped in full; the third —
unifying "New Dungeon" onto the shared CST — turned out to be exactly the
size this file's own prior estimate said it would be ("sized similarly to
everything in this section combined"), confirmed by actually reading the
code this time rather than estimating from the outside. Attempting it
anyway, mid-round, risked leaving the page broken between commits (the
one standing rule that overrides everything else this concept does) for
a rewrite that needs its own round. Scoped and documented instead of
attempted — the honesty-ledger pattern this file already uses for
smaller gaps, applied to a bigger one.

### Shipped: Hole in creation mode's own Tools strip

Creation mode's `CreationState` (`creation/creationTypes.ts`) had no
concept of a hole at all — this needed real state, not just a button.
Added `holes: Set<CellKey>` (a `"col,row"` string key, same idea as
`walls`'s `EdgeKey` map but cell- not edge-native) alongside a
`toggleHole` action in `useCreationState.ts`, a `'hole'` `Tool` variant,
a "Toggle Hole" button in `CreationConcept.tsx`'s `TOOLS` strip (between
Place Door and Set Start, matching the shared Palette's own Structural
ordering), click handling in `CreationBoard.tsx` (cell-native, via the
already-existing `nearestCreationCell` — the same primitive Start/End
already use), a matching dark-dashed-square render (visually the same
language `Board.tsx` uses for a target-dialect hole, adapted from hex corners to a
plain rect since creation mode's canvas is rectangular), and a
`holes:` block in `proposedYaml.ts`'s serialization. Also passed the
real `state.holes.size` into the shared `Palette`'s `holeCount` prop
(was hardcoded `0`) and cleaned up a stale doc comment that had been
pre-written expecting this exact addition and never got true until now.

**Verified live**: switched to "New Dungeon," selected Toggle Hole,
clicked a canvas cell — a dark square appeared on the board AND the
Proposed Schema pane updated to `holes:\n  - [10, 15]`, the exact cell
clicked. Evidence: `docs/evidence/dungeon-builder-creation-hole-tool.png`.

Not touched: `demoScript.ts`'s scripted "Play the pitch" walkthrough
doesn't call `toggleHole` — it's an illustrative script of Kirk's
original pitch sentence, which didn't mention holes, so there was
nothing to add without inventing a step the pitch never had.

### Shipped: viewBox grows for content authored beyond the compiled bounding box

Reproduced first, since the gap as CONTRACT.md previously described it
("may render out of view") turned out to only be reachable one way:
**not** by clicking the board (every clickable cell in edit mode's
`Board.tsx` comes from looping `floorPlan`'s own compiled rooms/
connectors — there is no click target outside that grid), but by typing
or pasting a `walls:`/`holes:`/`start:`/`end:` coordinate directly into
the YAML pane that sits outside the compiled chain's own cells. Real
path (this is exactly how a from-scratch "New Dungeon" canvas or a
hand-edited YAML would produce one), just not a board-click path today.

Confirmed the gap live before fixing: added `holes: [[60, 4]]` via the
YAML pane against showcase.yaml's 3-room chain (columns 0–30) — the
compile badge picked it up (`Uses: 1 hole`), proving it parsed, but nothing
new was reachable in the visible pane, because `Board.tsx`'s SVG
`viewBox` was computed **only** from the compiled grid loop's own
`trackExtent` calls — the separate target-dialect-overlay pass
(walls/holes/start/end) rendered its shapes but never fed the same
bounding-box tracker.

**Decision: grow, not clamp.** This whole round's throughline — TARGET-
YAML.md's preamble, the compile-badge mechanism, "we cannot be held down
by our early ideas" — is that authored-but-not-yet-compiled content stays
visible and honest, never silently hidden. Clamping the viewBox (or
refusing to render past the compiled bounds) would have quietly
contradicted that: exactly the kind of silent drop this concept's own
badge/dropped-fields discipline exists to prevent elsewhere.

**Fix**: `Board.tsx` gained a `trackCellExtent(col, row)` helper (same
`cellCorners`-based extent tracking the base grid loop already does) and
now calls it for every `doc.walls` `from`/`to` cell, every `doc.holes`
cell, and `doc.start`/`doc.end`, before the `vx`/`vy`/`vw`/`vh` viewBox
math runs. Placements/boss pins didn't need the same treatment — they're
always looked up via a real `fpRoom` from the compiled `floorPlan`
(`if (!fpRoom) continue`), so they're inherently bounded already.

**Verified live**: with a modest overshoot (`holes: [[35, 4]]`, 5 columns
past the vault room's end at column 30, chosen so the existing chain and
the new content land in one frame), the viewBox's width grew
(`1175.79` → `1300.49` units) and scrolling the board pane right shows
the vault room's real geometry AND the new hole together, both rendering
correctly — confirmed via a DOM-level check too (241 polygons, 0 with
`NaN` coordinates, valid finite viewBox). A dramatic overshoot
(`holes: [[60, 4]]`, 30 columns out) grew the box far enough that the new
content and the existing chain no longer share one screen without
scrolling — expected for "grow," not a bug, but worth naming as the
follow-on UX gap below. Evidence:
`docs/evidence/dungeon-builder-viewbox-grows-for-out-of-bounds.png`.

**Named follow-up, not built**: "grow" makes distant authored content
_reachable_ (scroll finds it), not _discoverable_ (nothing tells you
which direction to scroll, or that anything is out there at all — a
near-black hole fill against the SVG's unpainted background is easy to
miss even once it's on-screen). A minimap, an auto-scroll-to-new-content
on author, or a bounding-box indicator are all reasonable answers; none
attempted here — this round's brief was "grow or clamp, decide,
document," not "solve discoverability," and conflating the two would
have been scope creep on a fix that was itself supposed to be the small
item of the three.

### Scoped, not attempted: unifying "New Dungeon" onto the shared CST

Read every file in `creation/` before deciding, rather than estimate
from the outside again. Total: `CreationConcept.tsx` (433 lines),
`CreationBoard.tsx` (413), `useCreationState.ts` (142),
`creationTypes.ts` (81, now 91), `proposedYaml.ts` (98, now 116),
`ProposedYamlPane.tsx` (83), `demoScript.ts` (116), `useDemoScript.ts`
(100), `creationGeometry.ts` (131) — **~1600 lines**, all built against
`CreationState`, a plain-React-state model with zero CST/YAML backing
during editing (`ProposedYamlPane` only ever _serializes to_ text for
display; nothing ever parses that text back).

**The good news, confirmed by reading `dungeonYaml.ts` closely**: the
schema gap is smaller than it looks. `DungeonDoc` already carries
`canvas: CanvasDoc | null`, `walls: WallDoc[]` (edge-native, absolute
`[col,row]` `from`/`to` — the _exact_ shape `creationTypes.ts`'s own
`EdgeKey`/`WallKind` model was independently designed to mirror),
`holes: [number,number][]`, `start`/`end: [number,number] | null` — all
top-level, all target-dialect, all already exactly what a freeform canvas
needs. And `rooms: []` is already a legitimate empty target-dialect draft
(an earlier round's relaxation, "only a genuinely MISSING `rooms:` key is
a shape error").
So `canvas`+`walls`+`holes`+`start`+`end` need **no new schema work** to
back creation mode's canvas, its wall-drawing, or its start/end/hole
tools — `useCreationState`'s `toggleWall`/`toggleHole`/`setStart`/
`setEnd` could become thin wrappers over the ALREADY-EXISTING
`toggleWall`/`toggleHole`/`setStart`/`setEnd` mutators in
`dungeonYaml.ts` with essentially no new mutator code.

**The real gap, and the one genuine design decision a future round needs
to make first**: every placement mutator (`placeItem`, `movePlacement`,
`deletePlacement`, `setPlacementFacing`, `moveBoss`, and now this round's
`setPlacementMount`/`setPlacementTargeting`) takes a `roomId` and writes
into that room's `place:`/`boss:` list — verified by reading
`dungeonYaml.ts:411-600` directly, not assumed. Creation mode's whole
premise is a canvas with **no rooms declared yet** ("walls carve the
space into rooms," not "rooms exist and get decorated") — so "place a
prop on the canvas" has nowhere to attach in the current schema shape.
Two honest options, neither built yet:

1. **A single synthetic room** (e.g. `id: "canvas"`, archetype some
   placeholder) that always exists in a from-scratch target-dialect draft and owns
   every `place:`/`boss:` entry until real rooms get carved out by walls
   — reuses 100% of the existing placement mutators/Inspector/YAML
   round-trip untouched, at the cost of a slightly fictional room in the
   YAML that a reader has to understand is a bridge, not a real room.
2. **A new top-level placement construct** (`place:`/`boss:` beside
   `rooms:`, not nested inside one) for the roomless case — cleaner in
   the YAML, but new mutators, new `DungeonDoc` fields, new Inspector
   wiring, and a second place `PlacementDoc` gets read from.
   Option 1 is the cheaper bridge and this round's tentative
   recommendation, but it's a real design call for whoever picks this up
   to confirm, not something to silently assume.

**Sizing the rest, now that the gap above has a shape**: even with
option 1 chosen, `CreationBoard.tsx`'s rendering stays intentionally
separate from `Board.tsx` — they render genuinely different geometries
(a rectangular free canvas vs. a compiled hex room-chain), and forcing
one component to branch between both would likely be worse than two
focused renderers sharing one data model. So "unify" means: (a) replace
`useCreationState` with the shared `cst`/`doc`, initialized from an
empty target-dialect-only document; (b) `CreationBoard.tsx` reads `doc.canvas`/
`doc.walls`/`doc.holes`/`doc.start`/`doc.end`/the synthetic room's
`place`/`boss` instead of `CreationState`'s shape (mechanical but
real — every read site in a 413-line file); (c) delete
`proposedYaml.ts`/`ProposedYamlPane.tsx` in favor of the shared
`serializeDungeon(cst)` + a `YamlPane` variant, closing the "two
proposed-schema renderers" duplication for real; (d) retarget
`demoScript.ts`/`useDemoScript.ts`'s scripted action calls
(`actions.toggleWall` etc.) onto the new mutator shape. (b) and (d) are
where the real hours are — not a same-day addition alongside two other
items, which is why it wasn't attempted here rather than shipped
half-finished.

Also worth naming as a **second bridge for "creation mode" to actually
retire**: once this lands, replacing creation's own Tools strip with the
shared `Palette`'s Structural/Markers rows (`showBoardTools={true}`)
becomes free — the only reason `showBoardTools` exists at all is that
creation mode currently has its own competing tool UI over a different
data model. Unifying the data model removes the reason for two UIs to
exist, at which point deleting creation's own Tools strip (not just the
Hole button added this round) is the natural next cut — named here so
it isn't rediscovered as a surprise duplication next time someone reads
both files side by side.

## Kirk's next-day follow-up: the CST unification, actually built

The team lead's next brief asked for the same three items again — z-axis/
targeting (already shipped, see above), Hole in creation mode (already
shipped, see above), and the CST unification, this time asking for it
directly: "take the care it needs." Having already scoped it properly
the round before (the synthetic-room bridge decision, the size estimate),
there was a real decision to execute rather than re-derive, so this round
built it — the one item the two rounds before this deliberately deferred.

### The design executed: option 1 from the prior scoping, confirmed live

The prior round's writeup proposed two options for the one real schema
gap (every placement mutator requires a `roomId`; a from-scratch canvas
has no rooms yet) and tentatively recommended the cheaper one. Built as
recommended:

- **`creation/emptyCanvasDoc.ts`** (new) — `emptyCanvasYaml(width, height)`
  builds the from-scratch target-dialect document: `version: 2` at the
  time (this literal marker was retired in the 2026-08-02 terminology
  sweep — the same file now emits `version: 1`, per Kirk's settled model
  that additive capabilities stay on `version: 1`; see this file's own
  terminology-sweep section below), `canvas: {width,
height}`, and a single synthetic `rooms:` entry (`id: "canvas",
archetype: "canvas"`) that owns every `place:`/`boss:` entry as the
  bridge, exactly as scoped. `CANVAS_ROOM_ID` and `DEFAULT_CANVAS` are
  exported for every creation-mode call site that needs them.
- **`dungeonYaml.ts` gained one real gap-filler**: `wallKindAtEdge`/
  `setWallEdge`, a general edge-addressed wall lookup/mutator (arbitrary
  `from`/`to`, explicit on/off) alongside the EXISTING `toggleWall`/
  `toggleWallKind` (col,row)-anchored pair edit mode already used —
  verified by reading `wallIndexAt`'s own doc comment that edit mode's
  version deliberately represents "one authored wall as ONE unit
  anchored at a specific absolute [col,row] cell... rather than requiring
  a drag gesture to specify an arbitrary edge," which is exactly what
  creation mode's edge-painting stroke needs and edit mode's simpler
  wall-band click never did. `holes`/`start`/`end` needed no new
  mutators at all — `toggleHole`/`setStart`/`setEnd` were already
  general-purpose. Also exported a real `WallKind` type (was an inline
  literal on `WallDoc.kind`) and added `onSetFacing` to the shared
  `Inspector` — facing had a real mutator (`setPlacementFacing`/
  `setBossFacing`) since an earlier round but no board UI anywhere;
  creation mode's own rotate buttons were the ONLY thing that ever called
  it. Wiring it into the shared Inspector closes that gap for edit mode
  too, as a direct consequence of the unification, not a separate ask.
- **`useBoardEditing`** (new, `DungeonBuilderConcept.tsx`) — the
  palette/placement selection state and `handlePlace`/`handleMove`/
  `handleDelete`/`handleSetFlags`/`handleSetMount`/`handleSetTargeting`/
  `handleSetFacing` handlers, previously defined once inline for edit
  mode, pulled into one hook and called TWICE — once per mode, each
  against its own `cst`/`doc`/`syncFromCst` — instead of duplicated.
  This is also where last round's `handleMove` off-by-one fix lives now;
  a comment points at the fix's own history rather than re-explaining it,
  since both modes share the corrected logic by construction.
- **`CreationBoard.tsx`** rewritten against `DungeonDoc` instead of
  `CreationState`: `doc.canvas` (grid), `doc.walls`/`doc.holes`/
  `doc.start`/`doc.end` (all direct, no key-string parsing needed for
  holes/start/end since those were already `[number,number]`-native;
  walls gained a small `wallGeometry`/`wallAtEdge` pair since `WallDoc`
  stores real `from`/`to` cells instead of a parsed edge-key string),
  and the synthetic room's `place`/`boss` for placements, addressed with
  the SAME `PlacementSelection` type (`{roomId, index}`) edit mode's
  `Board.tsx`/`Inspector.tsx` already use — not a bespoke locally-
  generated `p1`/`p2`/... id scheme anymore.
- **`CreationConcept.tsx`** rewritten as a much thinner composition root:
  its own hand-rolled Tools strip and facing/delete mini-panel are BOTH
  gone, replaced by the shared `Palette` (`showBoardTools` now defaults
  true for it, per last round's own prediction) and the shared
  `Inspector` — the exact "second bridge" the prior round named as
  becoming free once the data model unified, cut in the same round
  rather than left as yet another follow-up.
- **`demoScript.ts`/`useDemoScript.ts`** retargeted from the
  `CreationActions`/`CreationState` shape onto a new `DemoActions`
  interface (`resetGrid`/`toggleWallEdge`/`setStart`/`setEnd`/`place`/
  `rotateLastFacing`) built in `DungeonBuilderConcept.tsx` from the SAME
  mutators a manual click uses — `rotateLastFacing` resolves "the most
  recently placed item" fresh against the LIVE document each call
  (the synthetic room's last `place:` entry) rather than a remembered id,
  since plain array entries don't carry the old scheme's ids.
- **`ProposedYamlPane.tsx`** stopped being a read-only hand-serialized
  approximation (`proposedYaml.ts`, deleted) and became a real, editable
  view of `serializeDungeon(cst)` — the REAL CST's text, round-tripping
  through the same debounced-reparse pattern edit mode's `YamlPane` uses,
  just without that pane's server/compile-badge/save chrome (creation
  mode still makes zero server calls — a real PutDungeon for a freeform
  canvas needs a dungeonspec extension that doesn't exist yet, unchanged
  from every prior round's framing). Closes the actual "two proposed-
  schema renderers" duplication, not just the schema-level unification
  TARGET-YAML.md already did.
- **Dead code removed**: `useCreationState.ts` (deleted — zero remaining
  importers, confirmed by grep before deleting); `creationTypes.ts`
  trimmed from the full `CreationState` data model down to just the
  edge-addressing geometry primitives `creationGeometry.ts` still needs
  (`CreationGrid`, `EdgeKey`, `hEdgeKey`, `vEdgeKey`) — `Placement`,
  `Tool`, a redundant local `WallKind`, `CellKey`/`cellKey`,
  `emptyCreationState` are all gone.

### A real crash bug found and fixed while wiring this up, not by inspection

The shared `Palette` offers a "Boss" placement kind (confirmed by reading
`Palette.tsx` directly), and the shared `handlePlace` routes a boss
selection to `moveBoss(cst, roomId, at)`. `moveBoss` THROWS
(`DungeonParseError`) if the target room has no existing `boss:` entry —
verified by reading its source — because edit mode's real rooms always
either have one (dungeonspec requires exactly one boss per
`archetype: boss` room) or the palette's own room-archetype gate in
`Board.tsx` (`room.archetype !== 'boss'` → reject before ever calling
`onPlace`) stops the call from happening at all. Creation mode's
synthetic room is never that archetype and starts with `boss: null` — so
selecting "Boss" and clicking the canvas would have thrown an uncaught
exception and crashed the board. Fixed by replicating `Board.tsx`'s own
guard in `CreationBoard.tsx`'s placement handler: reject with an honest
message ("this canvas has none yet") before ever reaching `handlePlace`,
the same pattern edit mode already established, not a new invention.
Worth naming as the same category of finding as last round's `handleMove`
off-by-one — caught by actually tracing what a shared-component reuse
would do, not by a user hitting it first.

### Verified live, every piece — not shipped on typecheck alone

`npx tsc --noEmit` and `eslint` were clean on the first attempt for the
whole rewrite (a genuinely good sign for how well-typed `dungeonYaml.ts`'s
existing mutators already were), but this round's own standing rule is
live verification before claiming done, so:

- Drew a multi-segment wall via click-drag on the shared board — the real
  `walls:` array grows with the correct `from`/`to`/`kind` shape, and the
  Palette's own "N× drawn" count updates live.
- Selected "Door" and clicked precisely on the just-drawn wall's own
  rendered `<line>` — `kind` flips to `door`. (Two of this round's own
  Playwright attempts against this failed first, both confirmed as test
  bugs, not app bugs, before the fix landed: one used a wall's bounding
  box computed BEFORE selecting the Door tool auto-scrolled the page —
  stale coordinates; the other clicked 150px below the 1000px test
  viewport's own bottom edge. Named because a fresh session hitting the
  same two mistakes would otherwise waste the same hour re-deriving
  them.)
- Toggled a hole; `holes:` gained the cell.
- Placed a pillar prop, then selected its board marker (placing and
  selecting are separate actions, matching edit mode's own established
  UX) — the shared Inspector opened, and its facing rotate control
  (this round's addition) wrote `facing: NE` into the real place: entry.
- Ran "Play the pitch" to completion (17/17 steps) against the real
  board: 8 wall segments carving the room, a door partway through, a
  `start`/`end` pair, a monster placement, and a facing-rotated prop —
  all landing in the same live document the YAML pane shows, rendering
  correctly on the actual shared visual language (not a separate
  demo-only renderer).
- "New Canvas" correctly wipes `walls:`/`place:` back to the empty
  template.
- Confirmed edit mode is untouched by any of this — switching to "Edit:
  The Shrine Hall" after a full creation-mode session still shows
  `key: showcase`, unaffected, matching the "remembered per mode"
  precedent the collapse-state pairs already established.

Evidence: `docs/evidence/dungeon-builder-creation-cst-unification-demo.png`
(the completed demo run), `docs/evidence/dungeon-builder-creation-shared-inspector.png`
(the shared Inspector open on a creation-mode placement).

### What did NOT ship this round — named, not silently dropped

- **A real dungeonspec extension for freeform canvases doesn't exist.**
  Creation mode still makes zero server calls — `ProposedYamlPane`'s
  "Save & Play" stays disabled, honestly. Unifying the DATA MODEL and
  UI doesn't change what the server can compile; that's a separate,
  much larger initiative this round never claimed to start.
- **Walls don't carve the canvas into real, separately-addressable
  rooms.** The synthetic `CANVAS_ROOM_ID` room is permanent this round,
  regardless of how many walls get drawn — exactly the bridge the prior
  round scoped, not the "branching topology" evolution TARGET-YAML.md's
  linear-chain section gestures at. That remains real, separate,
  future work.
- **`CreationBoard.tsx` is still its own renderer, not `Board.tsx`
  itself** — a deliberate call from the prior round's scoping (two
  genuinely different geometries), reconfirmed rather than revisited
  here.
- **Discoverability of distant authored content** (the viewBox-grows
  follow-up from earlier this same day) is unaffected either way by this
  round's work — still open, still named there, not touched here.

## Same-day correction: top-level `place:`, not the synthetic room

The round above shipped and was reported before two decision briefs from
the team lead arrived — "CST unification: top-level placements" and its
follow-up "STOP — read decision brief first" — deciding the one real
design question in that round's own scoping (how does a from-scratch
canvas give a placement somewhere to live) the OTHER way: a TOP-LEVEL
`place:` field (a sibling of `rooms:`, absolute `[col,row]`, same fields
a room-scoped entry has), not the synthetic `archetype: canvas` bridge
room this file's own prior section describes. Rationale, Kirk's own
framing: room-scoped placement is v1's real heritage, and the target
dialect should make rooms organizational (a placement CAN belong to one)
rather than existential (a placement can only exist inside one) — a
synthetic room bakes the existential assumption in one level deeper
instead of removing it, which is the exact "held down by our early
ideas" failure the reframe exists to prevent. Full rationale now lives
in TARGET-YAML.md's "Top-level placement" section, including the honest
paragraph on why the synthetic-room approach was tried first and
rejected, not silently dropped from the history.

This round converts. New standing process rule set alongside this
correction: drain the inbox and acknowledge the current decision state
at the START of a round, before building — the crossing happened once,
procedurally through no one's individual fault (an announced-but-not-yet-
read handoff), but the fix is a habit, not a one-time apology.

### What changed, file by file

- **`dungeonYaml.ts`**: `DungeonDoc` gains `place: PlacementDoc[]`
  (top-level, parsed by a new shared `parsePlacementList` helper used for
  BOTH the top-level field and every room's own `place:` — one parser,
  two call sites, not two implementations). Every placement mutator
  (`placeItem`/`movePlacement`/`deletePlacement`/`setPlacementFlags`/
  `setPlacementMount`/`setPlacementTargeting`/`setPlacementFacing`) now
  takes `roomId: string | null` — a new shared `placeSeq` helper resolves
  to either a room's `place:` list or the top-level one, so every mutator
  only needed an `if (roomId === null)` branch inside ONE lookup helper,
  not a parallel implementation per function. `moveBoss`/`setBossFacing`/
  `setBossTargeting` are UNCHANGED (`roomId: string`, always) — boss
  stays room-scoped per the decision.
- **`stripToV1Subset`** gains the map-down/drop conversion: room bounds
  computed with the same `start_column` accumulation
  `floorPlanCompile.ts` uses server-side; a top-level placement whose
  absolute column falls inside a declared room's range gets its `at`
  converted absolute→local and moved into that room's `place:` list
  (this is a real live-CST node move — the same node object relocates,
  not a clone, so any attached comment would travel with it); one outside
  every room is dropped with an honest count. Both outcomes register in
  the `dropped` array (which drives BOTH the "Uses:" compile badge and
  the post-save "Dropped:" note) — the first case where "in use" and
  "genuinely lost" diverge for this array, worded ("mapped into rooms")
  to stay honest in both readings.
- **`types.ts`**: `PlacementSelection`'s non-boss variant is now
  `roomId: string | null` (`null` = a top-level selection); the boss
  variant is unchanged (`roomId: string`, always).
- **`boardGeometry.ts`**: `isCellOccupied`/`OccupiedCheck` extended to
  also scan `doc.place` (top-level) for occupancy — edit mode's Board.tsx
  didn't need this for anything it renders yet (see "What did NOT ship"
  below), but the occupancy check itself needed to stay correct the
  moment ANY code path could produce a top-level placement, including a
  hand-typed YAML edit in edit mode.
- **`Inspector.tsx`**: a REAL bug, not a design gap — the component
  unconditionally required `doc.rooms.find(r => r.id === selected.roomId)`
  to succeed before rendering anything. For a top-level selection
  (`selected.roomId === null`), that lookup always misses (no room has
  `id === null`, and a from-scratch canvas may have zero rooms at all
  regardless), so the Inspector silently rendered nothing — no error, no
  console warning, just a selection that visually did nothing. Caught by
  live verification (clicking a freshly-placed top-level marker opened no
  panel), not by inspection or typecheck. Fixed by resolving THREE cases
  up front (boss → room lookup required; room-scoped → room lookup
  required; top-level → `doc.place[index]` directly, no room needed) into
  one `placement`/`boss` pair the rest of the component reads from,
  instead of the room-requiring lookup gating everything.
- **`creation/emptyCanvasDoc.ts`**: the synthetic room is gone —
  `rooms: []` is genuinely empty now, `place: []` sits at the top level.
- **`CreationBoard.tsx`/`CreationConcept.tsx`/`DungeonBuilderConcept.tsx`**:
  every creation-mode call site that passed `CANVAS_ROOM_ID` now passes
  `null` (`edit.handlePlace(null, cell)`, `edit.handleMove(sel, null,
cell)`, `placeItem(creationCst, null, ref, at)`, etc.) — mechanical
  once the mutators/selection type were generalized. The Boss tool's
  guard changed from "this specific room isn't archetype: boss" to "this
  canvas has no rooms at all" — same honest-rejection shape, updated
  wording, still fires BEFORE `handlePlace` so `moveBoss`'s
  "no existing boss: entry" throw is never reached (same defensive
  pattern the prior round's boss-crash fix established, now also backed
  by a defensive `roomId === null` check inside `handlePlace` itself in
  case a future caller ever forgets the board-level guard).
- **`demoScript.ts`/`useDemoScript.ts`**: unaffected in shape — already
  built against a `DemoActions.place`/`rotateLastFacing` abstraction from
  the prior round, so only the CALLERS inside `DungeonBuilderConcept.tsx`
  needed to swap `CANVAS_ROOM_ID` for `null`. `rotateLastFacing` now
  reads `creationDoc.place.length - 1` directly instead of looking up a
  room first.

### Verified live, including the bug the Inspector fix caught

Confirmed via a real browser session, not just `tsc`/`eslint` (both
clean on the first pass, same as the prior round — `dungeonYaml.ts`'s
existing type discipline carried through the generalization cleanly):

- A from-scratch canvas's Proposed Schema pane shows `rooms: []` and
  `place: []` at the top level — no synthetic room anywhere in the
  serialized YAML.
- Placing a prop writes directly to the top-level `place:` array:
  `place: [ { ref: "dnd5e:props:pillar", at: [ 10, 15 ], ... } ]`.
  clicking that marker (after deselecting the palette — placing and
  selecting stay separate actions, unchanged UX) opens the shared
  Inspector — this is the exact interaction the bug above silently broke
  before the fix, and the exact one re-tested after it to confirm the
  fix actually closed the gap, not just satisfied the type checker.
  Rotating facing through the Inspector wrote `facing: NE` onto the
  top-level entry correctly.
- Selecting the Boss tool on a from-scratch canvas and clicking the board
  shows the honest rejection toast ("Boss stays room-scoped — this
  canvas has no rooms yet"), no crash, no uncaught exception.
- The full "Play the pitch" demo (17 steps, walls/door/start/end/monster/
  facing-rotated prop) still runs to completion against the new routing,
  confirming `DemoActions.place`/`rotateLastFacing`'s abstraction
  correctly insulated the demo script from the underlying roomId change.
- Edit mode is unaffected: the real showcase.yaml chain still renders
  (240 polygons, unchanged), confirming the generalized mutators didn't
  regress the room-scoped path they still serve there.

Evidence: `docs/evidence/dungeon-builder-toplevel-place-inspector.png`
(a top-level placement selected, Inspector open, facing set),
`docs/evidence/dungeon-builder-toplevel-demo-complete.png` (the full demo
run against the new routing).

### What did NOT ship this round — named, not silently dropped

- ~~Edit mode's `Board.tsx` does not yet render top-level placements.~~
  **Shipped, 2026-08-02** — see "Top-level placements render/select on
  the board," below.
- **Walls still don't carve the canvas into real, separately-addressable
  rooms.** Unaffected by this round either way — a from-scratch canvas
  is still one undivided space; the "branching topology" evolution
  TARGET-YAML.md's linear-chain section gestures at remains real,
  separate, future work.
- **The rejected synthetic-room approach's commits (`290ae77`,
  `c66c689`, and the immediately-following `4b72a02`) are NOT reverted or
  rewritten** — they stay in git history as the honest record of what was
  tried and why it didn't survive review, per this file's own convention
  (see the "What this file tried first" paragraph in TARGET-YAML.md).
  This round's commits convert the SHAPE forward from there, not erase
  the path that led to it.

## Visible-first round, 2026-08-02: walls/doors render, wall-mount height, door/wall 2D clarity

Kirk's own feedback, relayed by the team lead: "would be great if our
process was more iterative... seeing things work lets us know we are on
the right track." Two things hadn't landed on his screen in 14 hours
despite being entirely client-side buildable: walls/doors RENDERING, and
the wall-mounted banner sitting at height instead of the floor. New
standing mode: self-directed, continuous small landings, commit+push
often, report at milestones/blockers rather than every round brief.

### 1–2: drawn walls/doors + wall-mounted props in the 3D preview (SHA `bed593c`)

`wallRuns.ts`/`WallRunMesh.tsx` — the real game's wall renderer — was
read closely (most of its 1335 lines) and ruled out: it derives envelope/
connector RUNS from fog-of-war-gated region hex membership, a materially
different problem from this concept's already-explicit
`{from,to,kind}` wall edges. Reusing it would have imported its whole
fog-of-war contract for no reason. Built a genuinely crude box-per-edge
renderer instead (`DungeonPreview3D.tsx`'s new `WallBox`/
`wallBoxTransform`), reusing only the codebase's shared `cubeToWorld`/
`atan2` hex-math conventions — "a crude wall that RENDERS today beats a
faithful one next week."

**Original approach (superseded same day — see "Wall/banner alignment
fix" below):** a wall's world midpoint is the exact geometric midpoint
between its two adjacent hex cell centers (a real property of regular
hex tilings, not an approximation); `wallBoxTransform` computed the
wall's length axis by rotating the cell-center-to-cell-center line 90°.
Geometrically valid but not the codebase's own edge-rotation convention
— see the fix below for why that mattered. Doors render shorter
(`WALL_DOOR_HEIGHT_RATIO = 0.55`) and orange (`#ffb347`); solid walls
render full `WALL_HEIGHT` and cream (`#e8e2d8`) — the same convention
the 2D board's target-dialect overlay already used, now shared across
every view. This part is unaffected by the fix below (colors/heights,
not rotation).

Wall-mounted props (`mount: 'wall'`) now render at `Y = height` (the
authored target-dialect field, meters) instead of the floor plane; the
`facing`-driven rotation approach described here originally (pointing
the model outward via `facingToRotationY`) was also superseded same day
— see below.

Evidence: `docs/evidence/dungeon-builder-walls-doors-3d.png`,
`docs/evidence/dungeon-builder-wallmount-3d-height.png`.

**A genuine, unrelated trap hit mid-round**: the Vite dev server started
serving a cached transform of an EMPTY `DungeonPreview3D.tsx` module
(confirmed by `curl`ing the served module and finding
`"sourcesContent":[""]` in its embedded sourcemap, while `tsc --noEmit`
and a direct `esbuild.transformSync` both confirmed the real file on
disk was valid) — a Vite dev-server cache-staleness bug, not a source
issue. Fixed by killing the running `vite --port 3001` process tree and
restarting clean. Worth remembering for future sessions in this same
worktree/job; not previously documented anywhere in workspace memory.

### 3: 2D door-vs-wall visual distinction (SHA `4ddec75`)

Board.tsx's structural overlay used a subtle purple-on-purple,
dash-spacing-only distinction between solid walls and doors — hard to
read at a glance. Switched to the same orange/cream convention items
1–2 above established: a door gets a filled orange tint + "D" label; a
solid wall stays outline-only cream. One visual language for this
construct across every view now (2D edit board, creation board, 3D
preview), not three independently tuned ones.

Evidence: `docs/evidence/dungeon-builder-door-wall-2d-distinction.png`.

### 4: holes — regression check, not new work (no commit; nothing was broken)

Holes are a completely separate top-level `DungeonDoc.holes:
[number, number][]` field — structurally untouched by the top-level
`place:` conversion above, since that conversion only ever concerned
`place:` entries. Confirmed by reading both consumers directly
(`Board.tsx`'s void-styling polygon loop, `DungeonPreview3D.tsx`'s
`buildFloorTiles` skip-set) and by a live check: armed the Hole tool,
clicked a cell, confirmed the YAML gained `holes: [[0, 6]]`, confirmed
the 2D board rendered a solid-black void hex at that cell with the
existing dashed border, and confirmed `buildFloorTiles` genuinely omits
that cell's key from the 3D floor-tile map (code-level, since the
render is small at any single default camera angle to eyeball
conclusively in a screenshot). Both target-dialect-proposed paths remain intact.
Per Kirk's 2026-08-01 authoring-model-settlement commits
(rpg-project#175), holes stay documented as a deferred exploration
artifact, not a committed early-dialect construct — this was a
regression check, not an invitation to invest further.

### 5: rolled-content panel — synthetic obstacles fixture (this commit)

CONTRACT.md's own "must retain" list has carried this note since the
design-gate round: `showcase.yaml` (and every other recorded fixture)
has zero `obstacles:` entries, so `RolledContentPanel`'s non-empty
render path was implemented but genuinely untested against real
content. Closed two ways, deliberately NOT by inventing a fake entry in
`fixtures.ts`'s `SHOWCASE_YAML` — that constant is documented as a
verbatim copy of a real file and mixing invented content into it would
break that guarantee:

- `dungeonYaml.test.ts` gained a test using the exact same
  synthetic-injection convention this file already established for the
  same class of gap (the "flags monster refs" test just above it, which
  injects a synthetic monster placement into a copy of `SHOWCASE_YAML`
  since showcase.yaml has none either) — injects a synthetic
  `obstacles:` block into a copy of the room chain and asserts
  `RoomDoc.obstacles` parses to the exact `{ref, count}[]` shape
  `RolledContentPanel` consumes, plus that untouched rooms still parse
  to `[]`, not `undefined`.
- Live verification: pasted the identical synthetic YAML into edit
  mode's existing "Apply YAML → Board" textarea (no new UI added — this
  flow already existed) and confirmed the panel actually switches from
  its italic empty-state message to real rendered rows (`vault:
dnd5e:hazards:rubble ×3`, `vault: dnd5e:hazards:web ×1`).

Evidence: `docs/evidence/dungeon-builder-rolled-content-panel-non-empty.png`
(after-state; the panel's own empty-state message is the unedited
before-state, visible in the fixtures-mode screenshot above it).

## Terminology sweep + Hole "exploration" badge, 2026-08-02

Kirk's pop-in feedback on the 3D landings above also carried two approved
follow-ups, run after the door-distinction item per the team lead's
sequencing.

**Terminology sweep** (SHA `800cacc`): every "v2" surface across the
concept — palette/Inspector badges, ~50 doc comments across 12 files,
`stripToV1Subset`'s wording, a stray literal `version: 2` in
`emptyCanvasDoc.ts`'s generated YAML — moves to Kirk's settled framing
from TARGET-YAML.md's own "Settled early model" section: "target dialect"
for the aspirational fields, additive on `version: 1`, no version-bump
language anywhere except the reserved-for-incompatible-topology note. The
`V2Badge` component (Inspector.tsx) is now `TargetDialectBadge`, its
label text "v2" → "dialect"; `YamlPane.tsx`'s `v2Dropped` prop is now
`dialectDropped`. Historical CONTRACT.md narrative that genuinely used
"v2" as the real term in effect at that point in time is annotated
in-place rather than silently rewritten (e.g. item 4 in "What shipped, in
order" above now reads "badged 'not yet compiled server-side' (originally
`v2`, renamed `dialect` in the 2026-08-02 terminology sweep...)") — this
file's own convention for honestly recording what changed and why, the
same principle that keeps the rejected synthetic-room commits unrewritten
in git history. Verified live: the Structural category shows the
"dialect" badge on Wall/Door, zero "v2" text anywhere on the page.

**Hole tool "exploration" badge** (this commit): the Hole row in the
shared `Palette` (used identically by both edit and creation mode — no
separate creation-only Hole button exists to also update) previously
shared the same generic "dialect, proposed — not yet compiled" badge as
Wall/Door. That understates Hole's actual status — TARGET-YAML.md's
settled model is explicit that holes are "deliberately deferred from this
early dialect... an exploration artifact... not a commitment for the
early dialect," a stronger disclaimer than "proposed, not yet compiled."
`Palette.tsx`'s `Row` component gains a `deferred` prop, rendered INSTEAD
of `notCompiled` when both would apply (a stronger claim subsumes a
weaker one) — a distinctly muted-stone "exploration" badge whose tooltip
quotes Kirk's settled text verbatim, attributed (rpg-project#175,
TARGET-YAML.md). The tool stays fully usable — this is a status badge on
an active tool, not a disabled state, per Kirk's own "tool stays usable."

Verified live: hovering the badge surfaces the full verbatim tooltip
text; Wall/Door still show the generic "dialect" badge (2 total),
confirming the new badge type doesn't leak onto rows it shouldn't.
Evidence: `docs/evidence/dungeon-builder-hole-exploration-badge.png`.

## Wall/banner 3D alignment fix, 2026-08-02

Kirk pop-in feedback, watching the walls/doors/wall-mount 3D landing
directly: wall boxes read as misaligned (perpendicular to the seam
rather than lying along it), and the wall-mounted banner rendered at a
slight angle instead of flush against its wall. High priority — "these
are the exact things he's watching."

**Investigated before touching code.** A dispatched research pass
compared `wallBoxTransform`'s hand-derived rotation against
`hexMath.ts`'s `hexEdgeBetween` — the function every OTHER edge-aligned
piece in the real game (envelope walls, connectors) uses for this exact
problem. Finding: `wallBoxTransform`'s rotation was NOT actually
perpendicular — the geometric claim it was built on (cell-center line ⊥
shared edge, true for any regular hex tiling) held, and its long axis
WAS parallel to the real edge. It was off by a constant 180° from
`hexEdgeBetween`'s own convention instead — invisible on a symmetric box
(a box looks identical rotated 180°), which is why independent math
review kept confirming "this should render fine" against a screenshot
that looked wrong. The 180° drift would matter the moment an asymmetric
wall piece (a future tiled/mitered GLB) replaced the symmetric box, and
was already inconsistent with the one-convention-everywhere principle
this file names repeatedly. Kirk's own report likely predated the
bed593c walls landing in the first place (his message referenced
"perpendicular," which the live page — post-landing, pre-fix — did not
actually show when re-examined; the ambiguity was real enough that
guessing at a fix without the `hexEdgeBetween` comparison would have
been the wrong move either way).

**Fix**: `wallBoxTransform` now calls `hexEdgeBetween(cubeAtColRow(...),
cubeAtColRow(...), HEX_SIZE)` directly and uses its `mid`/`rotationY`,
replacing the hand-derived perpendicular math entirely — one shared
convention, not two independently-arrived-at equivalent ones. New
`wallMountRotationY(absCol, row, facing)` does the same for wall-mounted
props: resolves the neighbor cell in the `facing` direction, then feeds
BOTH cells through the identical `hexEdgeBetween` call `wallBoxTransform`
uses, giving a rotation that's genuinely flush against the wall face
(local +X runs along the edge) rather than `facingToRotationY`'s old
behavior of pointing the model's axis straight OUT through the wall,
perpendicular to the face — the actual mechanism behind "renders
slightly angled." `facingToRotationY` itself is unchanged and still used
for floor-standing props' facing, which was never wrong.

**Verified live**, not just re-read the math: authored an isolated
5-segment wall run (4 solid + 1 door) across a straight line of columns
via the YAML pane's existing "Apply YAML → Board" flow, deliberately
choosing a run longer and more isolated than showcase.yaml's own
scattered walls — a single clean diagonal line of aligned boxes is far
easier to judge than one small box lost among clutter. Screenshot
confirms one continuous, correctly-aligned line, matching the room's own
floor-tile boundary direction. Separately authored a `mount: wall` +
`facing` override on an existing wall-banner placement and confirmed the
banner now sits attached flush against its floor edge rather than
floating tilted above the void, as it did before the fix. Both via a
fresh isolated test case, not by re-eyeballing the original ambiguous
screenshots. Evidence:
`docs/evidence/dungeon-builder-3d-wall-alignment-fixed.png`,
`docs/evidence/dungeon-builder-3d-wallmount-flush-fixed.png`.

Also recorded per this same feedback (not built): CONTRACT.md's "must
retain" list item 5 (3D-mode editing requirement for the eventual real
editor) and TARGET-YAML.md's open question on whether 6-direction hex
facing is too coarse for wall-mounted props — both landed in the earlier
terminology-sweep commit (800cacc), before this fix.

## Top-level placements render/select on the board, 2026-08-02

Closes a gap named honestly two rounds ago (see the retracted "What did
NOT ship" entry above): edit mode's `Board.tsx` parsed and safely
occupancy-checked `doc.place` (top-level, `roomId: null`) but never
rendered or made it interactive — a hand-typed top-level placement was
real and correct in the document, just invisible on the board. First
piece of work under the new "concept incubates the real components"
operating bar (this file's own section, above), so it's held to that
bar: a real render-layer test, not just live verification.

**What shipped**: `Board.tsx` gains a third marker-rendering pass, right
after the existing room-scoped `place:`/`boss:` loop — same marker JSX,
same `markerColor`/`shortLabel` helpers, the only differences being `at`
is already absolute (no room `startColumn` to add) and the constructed
`PlacementSelection` carries `roomId: null`. Also feeds
`trackCellExtent`, matching every other target-dialect construct
(walls/holes/start/end) — a top-level placement can be authored anywhere,
not just inside a declared room, so the viewBox needs to grow for one
same as it already does for an out-of-bounds wall.

`BoardProps.onMove` widens from `roomId: string` to `roomId: string |
null`. `handlePointerUp` gains an early branch for a top-level source
selection (`!dragging.boss && dragging.roomId === null`): the placement
stays top-level wherever it's dropped, even when the drop point visually
lands inside a room's floor area — it does NOT get silently reparented
into that room's own `place:` list. This is a deliberate reading of
"rooms are organizational, not existential" (TARGET-YAML.md's top-level
placement section): a top-level placement choosing to land near a room
doesn't mean it's choosing to belong to it. The existing room-scoped drag
path is completely unchanged — same code, same behavior, verified by a
regression test (below) rather than assumed.

**Deliberately still out of scope, named honestly**: clicking empty
board space to CREATE a new top-level placement. The base grid loop only
renders clickable cells within the compiled `FloorPlan`'s own
room/connector columns — there's no defined clickable "dead space"
beyond that to click into, and inventing one (how far should it extend?
what does clicking it even mean before any room exists there?) is a
real, separate design question TARGET-YAML.md's own linear-chain section
doesn't answer either. A top-level placement is still only ever
CREATED via hand-typed YAML or creation mode's own board; this round
makes an existing one visible and interactive wherever it came from.
`onPlace`'s own prop type stays `roomId: string` (unwidened) to keep
that honest — Board.tsx genuinely never calls it with `null`.

**Verified two ways, per the new bar** — live AND a committed test, not
either alone:

- Live: hand-typed a top-level `place:` entry into the YAML pane's
  existing "Apply YAML → Board" flow, confirmed it renders as a marker,
  clicking it opens the Inspector showing the correct absolute
  coordinates, and dragging it to a new cell (including one visually
  inside a room) updates its `at` while it stays in the top-level
  `place:` list — confirmed by reading the full YAML text after the
  drop, not just trusting the UI. One real bug surfaced and fixed during
  this pass: an early drag test appeared to silently fail (`at` never
  changed, no reject toast) — root-caused via temporary console logging
  to a Playwright drag ending outside the SVG's own rendered bounds
  (pointer capture isn't set anywhere in this component, so `pointerup`
  needs to land ON the SVG element itself to reach `handlePointerUp` at
  all) — a test-script coordinate bug, not a Board.tsx bug, confirmed by
  a control test dragging an untouched, already-shipped room-scoped
  marker with the exact same synthetic approach, which worked
  immediately.
- `Board.test.tsx` (new file — this concept's first render-layer test;
  `dungeonYaml.test.ts` already covered the data layer): renders `Board`
  directly against real fixture data (`fixtures.ts`'s
  `SHOWCASE_FLOORPLAN`/`SHOWCASE_YAML`), not wired through
  `DungeonBuilderConcept.tsx`'s composition root — asserts on `Board`'s
  own props/callbacks so the test keeps meaning if `Board` is later
  extracted into the real editor, per the operating bar's "tests that
  survive extraction" line. Five cases: a top-level placement renders
  alongside an existing room-scoped one of the same ref (disambiguating
  two markers with the identical short-label, "AL", the same real
  ambiguity the live verification above had to work around); clicking
  one calls `onSelect` with `{ roomId: null, index: 0 }`; the correct
  marker highlights when `selectedPlacement` targets a top-level entry;
  a document with zero top-level placements renders none (the base case
  stays untouched); and a REGRESSION case confirming a room-scoped
  marker still selects with its real room id, unaffected by any of this.

43/43 pre-existing tests + 5 new = 48/48 passing. `ci-check` clean.
Evidence:
`docs/evidence/dungeon-builder-toplevel-board-render-select.png`.

## New arc: 3D editing (2026-08-02) — alignment audit

Kirk's direction: keep "getting walls lined correctly," "be able to
rotate objects," and "being able to place objects in the 3d view would
be really great if possible" — a new standing arc, three parts (this
section is part 1). Explicit instruction: verify against the live page
rather than assuming `76f3a1b` closed everything. Followed
`systematic-debugging`'s Phase 1/2 discipline throughout — root-cause and
pattern-compare before concluding anything is or isn't broken, not just
re-trust the earlier fix.

**Method**: for each rendered element class, read its current
position/rotation logic, compare it against the REAL game's own
established convention where one exists (not this concept's own
invention), then verify LIVE with an isolated test case — not
showcase.yaml's cluttered content, which makes any single element hard
to isolate and, as this round found firsthand, easy to misjudge from one
camera angle.

**Walls, doors**: `wallBoxTransform` calls `hexEdgeBetween` directly
(the `76f3a1b` fix) — unchanged this round, re-verified live with a
fresh isolated 5-segment wall run (4 solid + 1 door). Confirmed correct:
one continuous, correctly-aligned line.

**Mounted props**: `wallMountRotationY` also calls `hexEdgeBetween`
(`76f3a1b`). Pattern-compared against the REAL game's own
`computeWallAdjacentRotationY` (`syntyHexWallHelpers.ts`) — same function
call, same inputs, confirmed exact match. Also checked whether the real
game offsets a wall-mounted prop's POSITION toward the wall edge (a
hypothesis this round almost acted on before checking): it does NOT —
`HexGrid.tsx`'s `wallAdjacentRotations` only ever computes `rotationY`,
never touches `entity.position`, so this concept's `worldPosition`
(plain cell center, elevated in Y) already matches the established
convention exactly. **A genuine near-miss, worth naming**: an isolated
wall+banner test's FIRST screenshot (the 3D view's default camera angle)
appeared to show them at clearly different angles — investigated with
temporary console logging before touching any code, per
`systematic-debugging`'s Iron Law, and found the computed `rotationY`
values were bit-for-bit IDENTICAL for both. The visual mismatch was
foreshortening: at that specific camera angle, the thin wall box
happened to present edge-on while the banner GLB (a different mesh
shape, not a symmetric box) happened to present more face-on. Confirmed
by orbiting to three more angles — at every one of them, wall and banner
tracked together (both edge-on, or both face-on, never one of each).
**Lesson for this arc's own rotation/placement UI work**: a single
default-camera screenshot is not sufficient evidence for "this looks
wrong" in this preview; multi-angle verification is required before
concluding an alignment bug exists. Evidence:
`docs/evidence/dungeon-builder-3d-wall-mount-aligned-confirmed.png`.

**Floor-standing props' facing** (`facingToRotationY`): no real-game
equivalent exists to pattern-compare against (floor-prop facing is
concept-original; slice #178 is filed, not started) — verified instead
via internal-consistency: four `statue-reaper` instances at facing
`E`/`W` (an opposite pair) and `NE`/`SW` (a second opposite pair),
viewed top-down. Both pairs showed the statue's scythe blade pointing in
clearly, cleanly opposite directions — confirms the rotation mechanism
produces a coherent, evenly-spaced 6-direction wheel, not a scrambled or
duplicated one. No fix needed.

**Monsters**: position uses the exact same `worldPosition`/`absCol`
helper every other placement class uses — confirmed correct by reading
`buildPlacements` directly (no separate code path to diverge). Facing
rotation is a genuine GAP, not a misalignment: `PreviewMonsterModel` has
no `rotationY` prop at all today, so an authored `facing` on a monster
placement is silently dropped in the 3D view (still respected
everywhere else — Inspector, 2D board is facing-agnostic for markers
anyway). Read `HexEntity.tsx`'s real character-rotation path
(`ClassCharacterModel`'s `facingRotation` prop) for the reference
convention before scoping this: real character/monster GLBs need a
PER-RIG forward-axis correction constant (`POLYGON_DUNGEON_FORWARD_OFFSET`
for the monster rig, `SYNTY_GLB_FORWARD_OFFSET` for the player rig) ADDED
on top of the desired world-facing rotation, because the raw GLB's own
forward axis isn't pre-aligned with local +X the way this concept's
simpler `WallBox`/`PropModel` usage assumes. Wiring monster facing
correctly needs that offset accounted for — deliberately NOT attempted
in this audit pass; scoped into part 2 of this arc (rotation in 3D),
which is adding rotation capability generally, not fixing an existing
misalignment.

**Entrance/start markers**: genuinely ABSENT from the 3D preview before
this round — confirmed via a full read of `DungeonPreview3D.tsx`, zero
references to `doc.start`/`doc.end`/`floorPlan.entrance` anywhere.
Closed: new `PointMarker` component (a flat colored ring on the floor
plane, since this static preview has no camera-facing label text the way
the 2D SVG board does) for all three — `doc.start` (teal), `doc.end`
(gold), `floorPlan.entrance` (teal/red, reusing `boardGeometry.ts`'s own
`isEntranceBlocked` check rather than re-deriving it, so the 3D and 2D
views can never silently disagree about whether the entrance reads as
blocked). Verified live both states: a clear entrance rendered teal, and
placing a `blocks_movement: true` prop on the entrance cell (the exact
mechanism this file's own "entrance-blocked" UX-learning finding already
established for the 2D board) correctly flipped it red. Evidence:
`docs/evidence/dungeon-builder-3d-start-marker.png`,
`docs/evidence/dungeon-builder-3d-entrance-blocked-marker.png`.

**Bottom line for Kirk's "still aren't all lined correctly" report**:
every element class this round could verify against an established
convention (walls, doors, mounted props, floor props) checked out
correct on live re-verification — no rotation math needed changing. The
one confirmed, closed gap was a genuine absence (entrance/start markers
never rendered at all), not a misalignment. The one deliberately-deferred
gap (monster facing) is scoped into part 2, not silently dropped. If
Kirk's live page still shows something looking wrong after this lands,
that's new information this audit didn't reproduce with the isolated
test cases above — worth a fresh, specific repro rather than assuming
this pass missed something systematically.

43/43 pre-existing tests + regression suite still passing, `ci-check`
clean. Evidence:
`docs/evidence/dungeon-builder-3d-audit-overview.png`.

## New arc: 3D editing, part 2 — click-select + rotate

First landing of "be able to rotate objects" / "being able to place
objects in the 3d view would be really great if possible." Scoped this
round to select + the 6-direction facing stepping; click-to-CREATE and
drag-to-move in 3D are follow-ups, not this landing's gate (matching
Kirk's own "click-place lands first; drag-move in 3D is the follow-up"
framing for part 3).

**The interaction, and why**: click a prop or monster in the 3D view —
the SAME `PlacementSelection`/`onSelect` contract `Board.tsx` already
uses opens the exact same Inspector overlay
(`DungeonBuilderConcept.tsx` renders it once, outside either board, so
neither view owns it) with its existing facing rotate control (↺/↻).
Rotating from there mutates the shared CST the same way a 2D-board
rotate always has (`setPlacementFacing`/`setBossFacing`), so the 3D
model re-renders live, the YAML pane updates, and the compile badge
picks up the new `facing:` field — nothing here needed a new mutation
path. This is the "most natural" call named in the brief: reuse the
already-shipped 2D rotation UI instead of building a parallel 3D-specific
one, since the SAME Inspector opening from either view is a stronger,
more consistent mental model than two different rotate affordances that
happen to write the same field.

**What shipped**:

- `DungeonPreview3D` gains optional `selectedPlacement`/`onSelect` props
  (optional so a hypothetical future caller that doesn't wire selection
  degrades to view-only, unchanged from before this round).
- `buildPlacements` now also carries each prop/monster's
  `PlacementSelection` identity (`{roomId, index}` or `{roomId, boss:
true}`), needed so a click can report back which one was hit.
- **Also closed in the same pass**: top-level placements (`doc.place`,
  `roomId: null`) were completely ABSENT from `buildPlacements` before
  this round — confirmed via grep, zero references anywhere in the file.
  Same gap class as the entrance/start markers the alignment-audit round
  (part 1) just closed, and directly relevant here: you can't
  select-and-rotate a top-level placement in 3D if it doesn't render at
  all. Fixed by extracting a shared `buildOnePlacement` helper (position/
  rotation math doesn't care which list a `PlacementDoc` came from) and
  adding a second pass over `doc.place` with absolute coordinates —
  mirrors `Board.tsx`'s own top-level render pass (`rpg-dnd5e-web#679`).
- A click-to-select handler on each prop/monster's wrapping `<group>`
  (`e.stopPropagation()` then `onSelect(sel)`), plus `<Canvas
onPointerMissed={() => onSelect?.(null)}>` for click-empty-space-to-
  deselect — the R3F-native equivalent of `Board.tsx`'s own `onClick={(e)
=> { if (e.target === svgRef.current) onSelect(null); }}`.
- A selection highlight: the SAME amber `#ffd76a` `Board.tsx` already
  uses for a selected marker's stroke, here a `PointMarker` ring (reusing
  the component the alignment-audit round's entrance/start markers
  introduced) under the selected prop/monster, since this static preview
  has no 2D-style stroke outline to recolor.

**Consolidation, not just addition**: the `roomId`/`index`/`boss`
equality check a selection ring needs was already duplicated INLINE
three times in `Board.tsx` (one per marker-rendering loop). Rather than
adding a fourth copy for the 3D view, pulled it into `boardGeometry.ts`
as `isSameSelection` — a real shared module, not a per-file helper — and
refactored all three `Board.tsx` call sites to use it too. Verified live
that 2D selection is unaffected by the refactor (one genuine false-alarm
during this check: an early regression script clicked stale
pre-scroll coordinates and looked like a failure; recomputing the
bounding box after `scrollIntoViewIfNeeded()`, same lesson this session
already learned once this week, confirmed selection works exactly as
before).

**Test coverage, per the operating bar**: `isSameSelection` is exported
and directly unit-tested (`boardGeometry.test.ts`, 8 cases — room-scoped
identity, top-level identity, boss identity, and the cross-cases that
must NOT match: top-level vs room-scoped at the same index, boss vs
non-boss in the same room). Deliberately did NOT attempt a full
`@react-three/test-renderer` scene test for the click-handler wiring
itself: `PropModel.test.tsx`'s own mock shows what that requires (`
useGLTF` mocked for every model `DungeonPreview3D` loads at once —
`SyntyHexFloor`, `PropModel`, `PreviewMonsterModel`), for comparatively
little marginal coverage over what the pure-logic test plus the live
verification below already prove. A scope call, not a skipped test —
named honestly rather than silently left uncovered.

**Verified live**: an isolated single-statue test — clicked it, the
Inspector opened showing the correct ref and absolute coordinates
(`dnd5e:props:statue-reaper [1,1]`), clicked the rotate button, the
Inspector's own facing value changed (`E` → `SE`) AND the 3D model
visibly rotated to match, confirming the full round trip (click → select
→ Inspector → mutate CST → re-render) works end to end. Evidence:
`docs/evidence/dungeon-builder-3d-click-select-inspector.png`.

`ci-check` clean, full suite passing (56 tests: the pre-existing 48 +
8 new `isSameSelection` cases).

## New arc: 3D editing, part 2 follow-up — free-rotation prototype

Directly answers the team lead's design note on top of part 2's
click-select-and-rotate landing: present BOTH rotation granularities —
the 6-direction facing stepper already shipped, plus a free/fine
control — side by side on the same object, so Kirk can feel the
difference by hand instead of the open question in TARGET-YAML.md
("is 6-direction hex facing too coarse for a wall-mounted prop?")
staying an abstract debate.

**Design: additive, not a replacement.** `rotationDegrees` (`rotate_degrees:`
in YAML) is a ±30° fine adjustment layered ON TOP of the existing coarse
`wallMountRotationY`-derived flush rotation for `mount: wall` placements
only — `finalRotationY = wallMountRotationY(...) + (rotationDegrees ??
0) * (Math.PI / 180)`. ±30° is deliberately half of one 6-direction step
(60°), so the fine control can reach exactly halfway to either neighboring
facing without ever being able to substitute for picking a different
facing outright — it's a nudge, not a second way to choose direction.
Chosen over a replacement design because the real open question is
whether the coarse pick gets CLOSE ENOUGH that a small nudge closes the
gap, not whether facing should be abolished; an additive field tests
that question directly, and a replacement field wouldn't let both
granularities coexist on one object for Kirk to compare "side by side on
the same banner" as asked.

**Explicitly not a target-dialect proposal.** Same status as the
alignment-audit round's own experiments: `PlacementDoc.rotationDegrees`'s
doc comment and the Inspector's new `ExperimentBadge` (teal, distinct
from the purple `TargetDialectBadge`) both say so, and `stripToV1Subset`
drops `rotate_degrees` along with the other target-dialect-adjacent
fields, reporting it in the compile badge's dropped-constructs list
(`fine-rotation experiment (N placements)`) so its presence is tracked
honestly through the existing "what would survive a real compile" system
rather than silently riding along.

**What shipped**:

- `dungeonYaml.ts`: `PlacementDoc.rotationDegrees: number | null`,
  `parseRotationDegrees` (mirrors `parseHeight`), the
  `setPlacementRotationDegrees(cst, roomId, index, rotationDegrees)`
  mutator (clears the key on both `null` and `0` — a 0° nudge and no
  nudge render identically, so the document doesn't carry a
  distinguishable-but-meaningless zero), and `stripToV1Subset` handling.
- `DungeonPreview3D.tsx`: `buildOnePlacement`'s wall-mount rotation branch
  adds the degrees-to-radians nudge on top of `wallMountRotationY`, gated
  to `mount === 'wall'` the same way the coarse rotation already is.
- `Inspector.tsx`: a new "fine rotation" range slider (±30°, step 1),
  shown only when `mount === 'wall'` (a boss can never be wall-mounted,
  so the same boss-excluded gate `handleSetMount` already uses applies
  here too), with the `ExperimentBadge` and a caption naming the open
  question it's testing.
- `DungeonBuilderConcept.tsx`'s `useBoardEditing` hook gains
  `handleSetRotationDegrees`, wired into both Inspector call sites — edit
  mode here AND creation mode in `creation/CreationConcept.tsx`, since
  both share the one `<Inspector>` component.

**Verified live**: built an isolated single-room document (one
`wall-banner` at `mount: wall, facing: NE, height: 2.0` plus a matching
wall on the same edge), clicked to select it, confirmed the Inspector
showed both the existing facing stepper and the new fine-rotation slider
together. Dragged the slider to 20°: the YAML gained `rotate_degrees: 20`
and the 3D model visibly rotated (before/after evidence below). Then
clicked the facing stepper's rotate button: `facing` changed (`NE` → `E`)
while `rotate_degrees: 20` was preserved — confirming the two controls
are genuinely independent and coexist on the same object exactly as
designed, not one silently resetting the other. Compile badge correctly
tracked the new field throughout (`Uses: 1 wall, facing (1 placement),
wall-mount (1 placement), fine-rotation experiment (1 placement) — not
yet compiled server-side`). Evidence:
`docs/evidence/dungeon-builder-free-rotation-zero.png`,
`docs/evidence/dungeon-builder-free-rotation-20deg.png`.

**Resolved by Kirk's own hands, live play, 2026-08-02** (the prototype did
its job): "fine tuning is cool for sure but the other direction is a 30
deg to be flat on the wall." That 30° is the pointy-top interleave
between neighbor/facing directions and edge orientations — the two are
never aligned, so `facing`'s 6-direction ENUM can structurally never
produce a wall-flush rotation by stepping alone, no matter how it's
wired. This CONFIRMS (not changes) the direction this file's own
`wallMountRotationY` already took — edge-derived rotation via
`hexEdgeBetween`, never `facingToRotationY` — but surfaces a real,
separate UX gap the math being correct doesn't fix: Kirk also reported
"I can only line up 1 direction — flush with a wall on one side but not
the other," i.e. which EDGE a mount uses is currently implicit (nearest/
facing-implied), not an explicit, steppable choice, and there's no way to
flip a mount to the wall's far face without delete-and-replace. Queued as
the wall-mount interaction rework (edge-selection stepping restricted to
edges that actually carry a wall, plus a "flip to other side" affordance)
— tracked as this concept's next round, not attempted in this one. See
TARGET-YAML.md's open-question section for the citation and the
resolved-vs-still-open split.

Full suite passing (`dungeonYaml.test.ts`: 33 tests, including the new
`setPlacementRotationDegrees` coverage and updated assertions on the two
existing strip/parse tests), typecheck and lint clean, `ci-check` run
before commit.

## New arc: 3D editing, part 3 — click-to-place

Closes the third and last piece of the "3D editing" arc's original
brief: "being able to place objects in the 3d view would be really great
if possible." Click-place lands here; drag-move in 3D stays the explicit
follow-up (Kirk's own framing) — the 2D board remains the only way to
drag-move a placement today, in either view's mode banner.

**Select/delete parity was already free.** Part 2 wired 3D click-select
into the SAME `selectedPlacement` state the global Delete/Backspace
keydown listener (`DungeonBuilderConcept.tsx`) and `useBoardEditing`'s
`handleDelete` already read — neither is view-aware, so once an object
can be selected in 3D, deleting it already works without touching either
code path. Verified live rather than assumed: selected a pre-placed
pillar in 3D, confirmed the Inspector showed
`dnd5e:props:pillar [2,0]`, pressed Delete, confirmed the YAML's `place:`
list emptied. Evidence:
`docs/evidence/dungeon-builder-3d-select-delete-parity.png`.

**What shipped — click-to-place**: a new invisible-by-default hex-shaped
hit-mesh layer (`FloorHitCell`), one per floor tile, positioned just
above `SyntyHexFloor`'s own floor texture (`HIT_CELL_Y` > `FLOOR_Y`) so a
downward ray from the orbit camera always meets it before the visual
floor — R3F/Three fire pointer events nearest-hit-first, so a placed
prop's own click handler (its geometry sits higher still, and calls
`stopPropagation()`) naturally wins over the floor hit-cell underneath
it. No manual raycasting anywhere in this file, matching the brief's own
constraint. Each hit-cell resolves back to `(col, row)` via
`hexColumn`/`hexRow` — the exact inverse of `cubeAtColRow` this concept
already uses everywhere else, never independently re-derived.

Room-scoped only, deliberately mirroring `Board.tsx`'s own click-to-place
exactly (same gate order, same reject messages verbatim: "Pick a palette
item first...", "The boss pin can only be placed in the boss-archetype
room..."): a top-level placement is authored via YAML or moved there,
never created by a floor click in either view. `selectedPalette`/
`onPlace`/`onReject` thread through from `DungeonBuilderConcept.tsx`
exactly like `Board.tsx` already receives them — `edit.handlePlace`
itself needed zero changes, this only adds a second caller.

**A hit-cell is always mounted and always clickable, even with nothing
selected** — clicking a floor cell with no palette item chosen gives the
same "pick a palette item first" honesty `Board.tsx`'s 2D empty-cell
click already gives, rather than silently doing nothing. Only the
TINT is conditional (fully transparent unless `placing`) so browsing/
orbiting the scene looks unchanged from before this round. One side
effect worth naming: since the hit-cell layer now covers the whole
floor, a click that used to be a Three.js "miss" (deselecting via
`onPointerMissed`) is now a "hit" on any floor cell — but this makes 3D
click behavior MORE consistent with 2D, not less: `Board.tsx`'s own
empty-cell click was never a deselect either (only a raw click on the
SVG background outside all drawn geometry deselects). True background
(the void beyond the floor) still deselects via `onPointerMissed`,
unchanged.

**Verified live**: built an isolated single-room test document, selected
"pillar" from the palette (confirmed the 3D mode banner switched to
"Palette: pillar selected — click an empty floor hex to place it..."),
clicked two different empty floor hexes — both placements landed in the
YAML at the correct room-local coordinates
(`place: [{ref: dnd5e:props:pillar, at: [2, 0]}, {ref: ..., at: [2,
7]}]`) and both pillars rendered visibly in the 3D view. Also confirmed
parity with 2D's palette-clears-on-select behavior: clicking an
already-placed pillar (instead of an empty cell) opened the Inspector
and cleared the active palette selection, exactly like clicking an
existing 2D marker does. Evidence:
`docs/evidence/dungeon-builder-3d-clickplace-palette-selected.png`,
`docs/evidence/dungeon-builder-3d-clickplace-placed.png`.

`ci-check` clean, full suite passing — no test-file changes this round
(the new hit-cell layer is pure rendering/interaction wiring over
already-tested mutators; see this file's own "test coverage, per the
operating bar" precedent from part 2 for why a full R3F scene test
wasn't attempted here either).

## Wall-mount edge-selection rework

Closes the second, distinct gap Kirk found live-testing the free-rotation
prototype (separate from the rotation-MATH question that prototype
answered): "I can only line up 1 direction — flush with a wall on one
side but not the other — oh that is which tile I put it on, but still."
The rotation math was never the problem (`wallMountRotationY` already
derives flush rotation from the real edge geometry, confirmed correct by
Kirk's own "30 deg to be flat on the wall" finding) — the problem was
that the facing STEPPER cycled all 6 hex directions blindly, most of
which have no real wall on that cell to be flush against, making the one
direction that DOES look right hard to find by feel.

**What shipped**:

- `boardGeometry.ts` gains three pure functions: `neighborCell` (the
  (col,row) of a cell's neighbor in a given facing direction — shared
  coordinate math, not re-derived a third time alongside
  `wallMountRotationY`'s own copy and `DungeonPreview3D.tsx`'s click-
  to-place hit-cell math), `wallBearingFacings` (which of a cell's 6
  facing directions actually have a wall — checked both authoring
  orders, since `dungeonYaml.ts`'s own `wallIndexAtEdge` only matches
  one fixed `{from,to}` order and this lookup has to recognize a wall
  regardless of which side authored it), and `stepWallFacing` (steps
  the CURRENT facing to the next/previous entry in that bearing list,
  cyclically — not raw ±1 on the full 6-direction range). 10 new unit
  tests, all built via `neighborCell` itself for fixture coordinates
  rather than hand-derived cube math (self-consistent, not guessable-
  wrong).
- `Inspector.tsx`'s facing rotate buttons now route through
  `stepWallFacing` for `mount: wall` placements specifically (floor-
  standing props are untouched — the enum was never the question for
  them). A hint line under the facing control says exactly what's
  happening: "stepping cycles this cell's N walls only — flush by
  construction," or an honest "no wall on this cell yet — stepping
  cycles all 6 directions" when the cell has none (degrades gracefully
  rather than going inert on an incomplete authoring state).
- **"Flip to other side"**: a new Inspector button for `mount: wall`
  placements that moves the placement to the wall's far cell and
  mirrors `facing` ((facing+3)%6 — the same wall edge, viewed from the
  opposite side), one click instead of delete-and-replace. Validated
  before it's ever offered: the far cell must be in bounds, not the
  reserved door row, belong to a real room, not a hole, and not already
  occupied — otherwise the button shows disabled with an honest tooltip
  naming which check failed. Edit-mode only for this landing: creation
  mode has no compiled `FloorPlan` to validate room/bounds against at
  all (`CreationConcept.tsx`'s own doc comment), so the button always
  reads "not available in New Dungeon mode yet" there rather than
  guessing at canvas-mode validity — named honestly, not silently
  hidden.

**Also fixed in the same pass — a real bug, not scope creep**: flip
needed a cross-room move that preserves every field (facing, mount,
height, rotate_degrees, targeting), which is exactly the data-loss bug
the 2026-08-02 graduation audit flagged in `handleMove`'s existing
cross-list path (`DungeonBuilderConcept.tsx:129-135` — a naive
delete+`placeItem` shape that only ever carried `ref`+`at`, silently
dropping everything else, plus an adjacent `.find(...)!` that threw
outright for a `roomId: null` destination since no room has id `null`).
Fixed at the root with a new `movePlacementAcrossLists` mutator
(`dungeonYaml.ts`) that preserves the full `PlacementDoc` and returns
the item's real new index directly, so callers never have to re-derive
it from possibly-stale `doc` state. `handleMove` now calls it for every
cross-list move — not just the new flip feature — closing the audit
item everywhere it applied, not only on the path this round happened to
need. 2 new `dungeonYaml.test.ts` cases cover field preservation and the
`roomId: null` destination specifically (the exact case that used to
crash).

**Verified live**: an isolated test cell with 2 real walls (E and NW
edges) and a wall-banner starting at `facing: E` — clicking rotate (↻)
jumped DIRECTLY from E to NW, correctly skipping NE (no wall there)
entirely; clicking again wrapped back to E (only 2 entries in the
bearing list). Clicked "flip to other side": the placement moved from
`at: [2,2]` to `at: [3,2]` (the real E-neighbor) with `facing` mirrored
to W, while `mount: wall` and `height: 2` both survived untouched —
proving `movePlacementAcrossLists`' field preservation in the real flow,
not just the unit test. Evidence:
`docs/evidence/dungeon-builder-wallmount-edge-stepping.png`,
`docs/evidence/dungeon-builder-wallmount-flip-to-other-side.png`.

`ci-check` clean, full suite passing (69 tests: the pre-existing 57 + 10
new wall-bearing/step cases + 2 new `movePlacementAcrossLists` cases).

## Height decouples from mount

Kirk-batch ask, 2026-08-02: "height: decouples from mount. Any placement
may carry height (floating candles); mount:wall remains the wall-flush
case." Before this, `mount`/`height` were one mutator
(`setPlacementMount(cst, roomId, index, mount, height)`) — `height` was
only ever meaningful alongside `mount: wall`, so the two were set/cleared
together. Now they're fully independent, matching
`setPlacementRotationDegrees`'s own already-independent shape.

**What shipped**:

- `dungeonYaml.ts`: `setPlacementMount` drops its `height` parameter —
  it only ever sets/clears `mount:` now. New `setPlacementHeight(cst,
roomId, index, height)` sets/clears `height:` on its own. Neither
  touches the other's key. `stripToV1Subset`'s dropped-fields counting
  splits accordingly: `mountCount`/`heightCount` tracked and reported
  separately (`wall-mount (N placements)` / `height (N placements)`),
  matching `rotate_degrees`'s own independent counting rather than the
  old combined "wall-mount" bucket.
- `Inspector.tsx`: the height field is no longer nested inside the
  `mount === 'wall'` conditional or gated by `WALL_MOUNTABLE_REFS` — it's
  its own checkbox+number control, available for any non-monster
  placement (matching the same `!isMonster` boundary
  `blocks_movement`/`blocks_los` already use). Checking it defaults to
  0.5m (a judgment call for "floating decoration," distinct from the
  wall-mount checkbox's own 2.0m default for "banner at eye height" — no
  brief-specified value existed for either, both are named as defaults
  in their own doc comments). When height is set and the placement is
  NOT wall-mounted, a hint appears: "floats above the floor — pair with
  blocks_movement off to keep it passable" — directly answering the
  Kirk-batch's item 3 ask (make the passable-floating composition FEEL
  discoverable) by surfacing the pairing at the exact moment it's
  relevant, rather than requiring the author to already know it.
- `DungeonPreview3D.tsx`: `buildOnePlacement`'s position calculation
  changes from `p.mount === 'wall' ? (p.height ?? 0) : 0` (height
  silently discarded for any floor-standing placement, regardless of
  whether one was authored) to plain `p.height ?? 0` — a floor-standing
  prop with a height now actually renders elevated, not just accepts the
  field into the document without visual effect. Rotation stays
  mount-gated, deliberately: orientation is still a wall-vs-floor
  question (flush-against-the-edge vs. general facing convention),
  height no longer is.
- `TARGET-YAML.md`'s z-axis section updated with the decoupled
  semantics and a floor-standing-with-height example.

**Verified live**: an isolated floor-standing `dnd5e:props:candles`
placement (`blocks_movement: false`, `height: 1.5`, no `mount:` key) —
the Inspector correctly showed the height checkbox checked at 1.5 with
NO wall-mounted checkbox at all (candles isn't in
`WALL_MOUNTABLE_REFS`), the passable-floating hint visible, and the
compile badge honestly tracking `Uses: height (1 placement) — not yet
compiled server-side`. Evidence:
`docs/evidence/dungeon-builder-height-decouple-inspector.png`,
`docs/evidence/dungeon-builder-height-decouple-3d-floating.png`.

`ci-check` clean, full suite passing (58 tests: the `setPlacementMount`
test split into a decoupling-focused pair, net +1 over the prior count).

## Cleanup sweep (graduation audit items), 2026-08-03

One unit, one branch, one PR — a ranked list from a graduation audit run
against an earlier tree. Every item was re-verified against `dev` at
the time this sweep started (several PRs had landed since the audit
ran) before being fixed; anything already resolved is named as such
below rather than redone.

**1. Round-trip test path** — `dungeonYaml.test.ts`'s real-fixture
round-trip resolved `join(__dirname, '../../../../../dungeon-content/
showcase.yaml')`, one `../` too many; the catch silently fell back to
the embedded fixture, making the test a self-comparison. Fixed to 4
levels up. **Real verdict, not papered over**: verified independently
(this sweep's worktree isn't nested under `~/game-dev/` the way a
normal checkout is, so the corrected relative path itself still falls
back to the embedded fixture here — a second, standalone check read
the real file directly by absolute path) that the round-trip against
the actual `dungeon-content/showcase.yaml` on disk is byte-stable
(modulo the already-documented flow-sequence-padding normalization) —
**no drift**, the fixture and the source file agree. On a normal
checkout (canonical location `~/game-dev/rpg-dnd5e-web/`), the fixed
relative path resolves directly and this same real comparison runs as
part of the suite.

**2. Dead-scaffolding sweep** — removed: `creationTypes.ts`/
`creationGeometry.ts`'s `EdgeKey`/`hEdgeKey`/`vEdgeKey` and the
`EdgeGeometry.key` field (nothing read `.key`); `creationGeometry.ts`'s
`allInternalEdges` (never called); `Palette.tsx`'s `showBoardTools`
prop (both call sites relied on the default `true`, so its doc comment
claiming creation mode passes `false` no longer matched reality —
Structural/Markers already rendered in both modes; this just dropped
the dead plumbing); `useSaveDungeon.ts`'s `reset` (never called);
`paletteData.ts`'s `PaletteProp.footprintHexes`/`blocksLoS` (set, never
read); `fixtures.ts`'s `MONSTER_PLACE_CHECK_VERIFIED` export dropped,
its evidence comment kept; `dungeonYaml.ts`'s doc comment pointing at a
nonexistent `useWalkItVariant.ts` retargeted to `YamlPane.tsx`'s real
`honestyNote`; `Board.tsx`'s empty `handlePointerMove` placeholder.
**Skipped, already fixed**: `hexLayout.ts`'s `hexColumn`/`hexRow`
re-exports are NOT dead — `boardGeometry.ts` and `DungeonPreview3D.tsx`
both genuinely import and use them through this module, real usage
added by the wall-mount edge-selection rework after the audit ran.

**3. `specimens/README.md`** — its regeneration script's two
`setPlacementMount(cst, roomId, index, 'wall', height)` examples were
the pre-decouple 5-arg signature. Updated to the current independent
`setPlacementMount(...,'wall')` + `setPlacementHeight(...,height)`
pair. Verified by actually running the corrected script as a
throwaway test: it compiles against the real `dungeonYaml.ts`, and the
regenerated `kitchen-sink.yaml` is byte-identical to the checked-in
v0.1 specimen.

**4. Shared prop-visual module** — `Board.tsx`'s `markerColor`/
`shortLabel` and `CreationBoard.tsx`'s near-verbatim `markerColor`/
`markerShort` (both doing the same `PALETTE_PROPS`/`ROLE_COLOR`/
`MONSTER_COLOR`/`BOSS_COLOR` lookup) consolidated into
`markerStyle.ts`'s `resolveMarkerStyle(ref, opts?)`. The 3D preview
does not participate — it renders real GLB models
(`PropModel`/`PreviewMonsterModel`), not colored SVG swatches, so there
was no actual duplication there to remove.

**5. Unify wall geometry** — edit-mode `Board.tsx` drew each wall as a
dashed rect covering the WHOLE `from` cell regardless of which of its 6
edges the wall was actually on; creation mode and the 3D preview both
already drew the real shared edge. Added `hexLayout.ts`'s
`edgeBetweenCells` (wrapping `hexMath.ts`'s `hexEdgeBetween`, the same
primitive the 3D preview's `wallBoxTransform` uses) and switched
`Board.tsx` to a real edge-aligned `<line>`. Separately, reconciled
`dungeonYaml.ts`'s two wall lookups: `wallIndexAt` (edit mode, matched
by `from` cell ONLY) vs `wallIndexAtEdge` (creation mode, exact
`from`/`to` pair) — the from-only lookup meant edit mode's Wall tool
could find and delete a creation-drawn wall on a _different_ edge that
merely shared the same `from` cell. Removed `wallIndexAt`;
`toggleWall`/`toggleWallKind` now both call `wallIndexAtEdge`. New
regression test in `dungeonYaml.test.ts` pins this — confirmed it
actually catches the bug by temporarily reverting to the old
from-cell-only lookup and watching it fail (the other wall vanished
instead of surviving untouched) before restoring the fix. Visually
verified live: walls now render as short edge segments at the correct
hex boundary, solid/door color distinction intact.

**6. Extract `useBoardEditing`** — moved verbatim from
`DungeonBuilderConcept.tsx` to its own `useBoardEditing.ts` (it was
already a cleanly self-contained hook, just in the wrong file);
`CreationBoard.tsx`/`CreationConcept.tsx` now import the `BoardEditing`
type from there directly. Also fixed the two per-render
`parseDungeon(...)` calls the same audit flagged (`initial`/
`creationInitial`) — neither was wrapped in a `useState` lazy
initializer, so the parse (and the adjacent `serializeDungeon` calls
feeding the initial `yamlText` state, same shape of the same bug) ran
on every render even though only the first render's result was ever
used. Wrapped both in `useState(() => ...)`. Verified live: both edit
and creation mode still load and placing a prop through the extracted
hook still updates the board/YAML correctly.

**7. Shared marker module** — `PlacementMarker.tsx` extracted the
circle+label a placed prop/monster gets, byte-identical between
`Board.tsx` and `CreationBoard.tsx` before this (confirmed by diffing
the two JSX blocks directly — same radius, same selection-stroke
logic, same text styling). Does not own the `<g>`/pointer-handler
wrapper, which differs meaningfully per board. Also deduped the
`doc.start`/`doc.end` marker COLOR constants
(`markerStyle.ts`'s `START_COLOR`/`END_COLOR`, `#5fd1c9`/`#c9a227`),
independently hardcoded identically in `Board.tsx`, `CreationBoard.tsx`,
and the 3D preview's `PointMarker`. Deliberately did NOT unify the
actual start/end circle+label JSX — `Board.tsx` (filled swatch,
"ST"/"EN") and `CreationBoard.tsx` (outline ring, full "START"/"END"
above it, different label colors) render them with genuinely different
visual treatments today, and picking one is a design call for Kirk,
not a mechanical dedup. The boss pin (`Board.tsx`-only, different
size/font, no creation-mode analog) and the 3D preview's own marker (a
Three.js `<ringGeometry>` mesh, different rendering technology) were
left out of `PlacementMarker` for the same "nothing to actually
consolidate" reason item 4 already established.

**8. Move `ThumbHarness`** — moved `ThumbHarness.tsx` from
`src/concepts/dungeon-builder/thumbs/` to `src/dev/` (alongside
`DevPerfProbe.tsx`, the existing convention) so `App.tsx`'s dev-only
gate no longer imports from a concept folder. The `thumbs/*.png`
assets stayed put — `paletteData.ts`'s `import.meta.glob('./thumbs/
*.png', ...)` is relative to `paletteData.ts`'s own location, which
didn't move. Verified with a full production build: the glob still
resolves all 13 baked thumbnails correctly post-move.

**9. Missing tests** — `creationGeometry.test.ts` (new file):
`nearestEdge` had zero coverage; added baseline cases plus the
orientation-lock regression guard — a hand-derived straight horizontal
drag where, WITHOUT `lockOrientation`, the resolved edge flips from
horizontal to vertical partway across a single cell (the "crenellated
comb" bug this file's own wall-interaction finding describes), and
WITH the lock stays on the same edge throughout. `useSaveDungeon.test.ts`
(new file): zero coverage on the Save & Play hook; mirrors
`usePutDungeonPreview.test.ts`'s `vi.hoisted`/`vi.mock('@/api/client')`
pattern, covering idle/saving/saved/invalid/error transitions,
`savedKey` echoing the request key (not the response, which has none),
and a fresh `save()` clearing a prior error before the new request
settles.

`ci-check` clean. Full suite: 84 dungeon-builder tests passing (up from
69 before this sweep — 15 new: 8 `nearestEdge` + 7 `useSaveDungeon`),
1772 repo-wide.

## `defaults:` — dungeon-wide, ref-keyed default fields (2026-08-03)

Kirk's ask, verbatim: "maybe we can set a default for all skeletons." A
ref-keyed `defaults:` map — target dialect, proposed, same status as
every other construct this file tracks. Full design writeup, the
defaultable-field rationale table, the `mount`-exclusion reasoning, and
the recorded (not decided) open questions live in TARGET-YAML.md's own
`` `defaults:` `` section — this is the shipping ledger entry, not a
duplicate of that write-up.

**What shipped**:

- `dungeonYaml.ts`: `PlacementDoc` grows an `explicit` companion
  (`{ blocksMovement, blocksLos, height, facing, targeting }`) recording
  which fields were literally present on that instance's own YAML,
  distinguishing "explicitly false/absent" from "inheriting." New
  `DungeonDoc.defaults: Record<string, RefDefaultsDoc>` and
  `resolvePlacement(doc, placement)` — the one accessor that applies
  inheritance (a placement's own explicit field always wins), returning
  effective values plus an `inheritedFrom` map. Never mutates the
  document and never runs at parse time — the serialized YAML stays
  sparse. New mutators `setRefDefault`/`clearRefDefault` (the ref key is
  forced double-quoted via an explicit `Scalar` — `YAMLMap.set()` with a
  bare JS string key stores a plain string and only wraps it at
  stringify time, too late to mark it quoted; confirmed by hand before
  landing, not assumed) and `clearPlacementFlag` (deletes
  `blocks_movement`/`blocks_los` entirely — distinct from
  `setPlacementFlags`, which always writes a literal boolean and has no
  reason to delete either key; needed for a real "revert to default,"
  which must un-set the key, not copy the default's current value into
  it).
- `stripToV1Subset` materializes-on-strip: every placement INHERITING a
  `blocks_movement`/`blocks_los` value gets it baked on as a literal key
  before `defaults:` itself is dropped, so the compilable subset
  preserves the authored behavior a default was standing in for — a
  `blocks_movement: true` default silently vanishing on save would
  reintroduce the exact entrance-blocked gap this file's own UX learning
  exists to catch. Monster placements are skipped (dungeonspec rejects
  both flags on a monster ref). `targeting`/`height`/`facing` have no v1
  form regardless of inheritance and just drop, counted the same way an
  explicit one already was — not double-counted against the new
  `defaults (...)` entry.
- `boardGeometry.ts`'s `isEntranceBlocked` and
  `DungeonPreview3D.tsx`'s `buildOnePlacement` now read placement
  fields through `resolvePlacement` instead of the raw `PlacementDoc`
  fields — a defaulted `blocks_movement` trips the entrance-blocked
  warning exactly like an explicit one; a defaulted `height` floats a
  candle in the 3D preview exactly like an explicit one. Reading the raw
  field instead would have silently missed both the moment any dungeon
  actually used `defaults:`.
- `Inspector.tsx`: `facing`/`height`/`targeting`/`blocks_movement`/
  `blocks_los` now render resolved (not raw) values. A field currently
  following its ref's default renders muted with a small "inherited"
  tag — visually distinct from the existing "dialect"/"experiment"
  badges (those mark a CONSTRUCT as uncompiled; "inherited" marks a
  VALUE as not-this-instance's-own; a field is routinely both).
  Override-in-place needed no new affordance — every setter already
  writes an explicit value the moment a control is touched. A "revert to
  default" button appears only when a field is both explicit on this
  placement and has a ref default to fall back to.

**A named, honest limitation, not silently glossed over** (also
recorded in TARGET-YAML.md): for `height`/`targeting`/`facing`,
"clear" and "revert to default" are the same action, because absence of
the key IS the inherit signal — there is no way today to author
"explicitly no height, overriding a default that provides one."
Unchecking an inherited `height` checkbox is a documented no-op, not a
bug: nothing explicit exists yet to delete, so the value keeps following
the default until either overridden with a real number or the default
itself is cleared.

**Verified live**, hand-editing the YAML pane directly (the same
"only a hand-editor can produce this" path CONTRACT.md's comment-
orphaning finding already established, since `placeItem` always stamps
fresh prop placements with explicit `blocks_movement`/`blocks_los` —
true inheritance for those two fields needs a hand-authored or
`clearPlacementFlag`-cleared instance): added
`` `defaults: { "dnd5e:props:pillar": { height: 1.2, facing: SE } }` ``
to showcase.yaml's live document, then selected a placed pillar.
Screenshot 1 (`docs/evidence/dungeon-builder-defaults-inherited.png`)
shows both `facing` and `height` muted with the "inherited" tag, and the
YAML pane's own compile badge reading `Uses: defaults (1 ref) — not yet
compiled server-side`. Edited the height field to `2` in place; screenshot
2 (`docs/evidence/dungeon-builder-defaults-overridden.png`) shows, in ONE
frame, `height` now explicit (value `2`, a "revert to default" button,
the "inherited" tag gone) sitting right above `facing`, still muted and
still inherited — the contrast the whole feature is for. The compile
badge updated live to `Uses: defaults (1 ref), height (1 placement)`.
Clicked "revert to default"; screenshot 3
(`docs/evidence/dungeon-builder-defaults-reverted.png`) shows `height`
back to `1.2`, muted, "inherited" tag restored, compile badge back to
`Uses: defaults (1 ref)` — the full inherit → override → revert cycle,
live, not just unit-tested. Console showed only the expected FIXTURES-mode
`AuthoringService` gate-off errors this concept's own live-preview probe
always produces locally (CONTRACT.md's "Live verification" section) — no
new errors from this change.

**Not independently re-verified in the browser**: materialize-on-strip
itself (covered thoroughly at the data layer — see `dungeonYaml.test.ts`
below — but not re-clicked through "Save the compilable subset" live;
the compile-badge wiring shown live above is the same code path that
feeds that button's diff summary) and the 3D preview's resolved-height
render (attempted; this ephemeral worktree's `public/models/synty` isn't
populated the way a `rsync`'d checkout is, per this file's own "Save &
Play" section note, so the 3D canvas rendered blank from missing
textures/models — an environment gap, not a regression, and not
conflated with a real finding here).

`ci-check` clean. 99 dungeon-builder tests passing (up from 84 — 15
new: parsing, `resolvePlacement` inheritance/override, `setRefDefault`/
`clearRefDefault`/`clearPlacementFlag`, boss-exclusion, and
materialize-on-strip both directions — a real v1-expressible field that
bakes in, and a target-dialect-only one that doesn't), 1802 repo-wide.
Specimen pack bumped to v0.2 (`specimens/README.md`'s own changelog) —
`kitchen-sink.yaml` now shows a decoupled floor-standing `height` (#688)
and the new `defaults:` map exercising both outcomes above;
`kitchen-sink.v1-subset.yaml`/`.dropped.json` regenerated to match.

## Fine rotation, restored and generalized to floor-standing props (2026-08-03)

Kirk's report, verbatim: placing in 3D and adjusting height works, but "we
lost the ability to fine tune the rotate or more importantly to adjust it
the 30 [degrees] so on some hexes it can be flush with the wall."

### Regression archaeology verdict: over-narrowed by design from day one, not a code regression

Walked every commit touching `rotate_degrees`/`Inspector.tsx`'s rotation
section rather than guessing which PR broke it. **Finding: nothing broke.**
The fine-rotation slider (`PlacementDoc.rotationDegrees`, "New arc: 3D
editing, part 2 follow-up — free-rotation prototype" section above) was
gated to `mount === 'wall'` placements from its very FIRST commit (#683)
— "free-rotation prototype for wall-mounted props" is literally the PR
title. Every subsequent PR that touched this area preserved that scope
rather than widening it:

- #686 (the wall-mount edge-selection rework, above) added the facing
  hint/flip-to-other-side UI around the mount checkbox but never touched
  the rotation-slider block itself (confirmed by diff: `git show c7ed801
-- Inspector.tsx` shows zero lines removed/added in that section).
- #688 (height decouples from mount, above) explicitly named the
  asymmetry it was choosing NOT to fix, in its own code comment:
  "Rotation stays mount-gated, deliberately... height no longer is."

So this was **over-narrowing, not data loss**: `dungeonYaml.ts`'s
`rotationDegrees` field, `parseRotationDegrees`, `setPlacementRotationDegrees`,
and `stripToV1Subset`'s handling never once checked `mount` — only the
Inspector's render condition (`isWallMountable && mount === 'wall'`, and
even more narrowly, nested inside a checkbox block that only rendered for
`WALL_MOUNTABLE_REFS` — i.e. `dnd5e:props:wall-banner` alone) restricted
who could ever see the control. Kirk's report is the correct signal that
this original scope was too narrow, not evidence of a regression to
restore to some prior working state — there was no prior state where a
floor prop had fine rotation.

### Why floor props need this exactly as much as wall mounts do

Same geometry fact, verified numerically (`boardGeometry.test.ts`'s new
`facingToRotationY / wallMountRotationY` suite), not re-asserted from the
30° finding alone: a hex's 6 neighbor/facing directions
(`facingToRotationY`'s angle set, `{0°,60°,...,300°}`) and its 6 edge
orientations (`wallMountRotationY`'s angle set, `{30°,90°,...,330°}`) are
two DIFFERENT, interleaved sets, 30° apart. A floor-standing prop's
`facing` enum can therefore never land exactly edge-parallel against an
adjacent wall by stepping alone — the identical reason a wall-mounted
prop's facing enum couldn't. `mount: wall` was never actually what made
6-direction facing insufficient; being next to (or on) a wall is.

### What shipped

- **`boardGeometry.ts`** gains `facingToRotationY`/`wallMountRotationY`
  (moved here from `preview3d/DungeonPreview3D.tsx`, which now imports
  them rather than keeping private duplicates — one definition instead of
  two, matching this file's "clean interfaces, not concept-only
  scaffolding" operating bar), `nearestBearingFacing` (which of a cell's
  wall-bearing edges is closest to a given facing, by circular distance),
  and `computeFlushRotation` (the real work): given a cell's walls and an
  optional current facing, returns the `(facing, rotationDegrees)` pair
  that reconstructs the exact wall-flush angle for the nearest adjacent
  wall — searching all 6 floor-facing candidates rather than assuming the
  wall's own facing index works (it doesn't: a first draft assumed
  `wallMountRotationY(f)` and `facingToRotationY(f)` for the SAME `f`
  differ by the ±30° gap; a throwaway probe script proved that assumption
  wrong — the real gap for matching indices is a constant 90° [the edge
  is perpendicular to the radial line to its neighbor], and the actual
  ±30°-reachable candidates are the wall-bearing facing's two NEIGHBORS in
  the facing cycle. Caught before it shipped, not after — see
  `boardGeometry.test.ts`'s round-trip test, which reconstructs the target
  angle from the returned pair and asserts the diff is <0.01°, not just
  that some plausible-looking numbers came out).
- **`dungeonYaml.ts`**: `PlacementDoc.rotationDegrees`/
  `setPlacementRotationDegrees`'s doc comments updated to describe the
  generalization; zero functional change (neither ever checked `mount`).
- **`preview3d/DungeonPreview3D.tsx`**: `buildOnePlacement`'s `rotationY`
  formula now applies `rotationDegrees` on top of whichever coarse
  rotation `facing` produces — `wallMountRotationY` for `mount: wall`,
  `facingToRotationY` otherwise — instead of only the wall branch.
  `facing === null` still means "no base to nudge" for either branch,
  matching the Inspector's disabled-slider state (nothing to silently
  no-op against).
- **`Inspector.tsx`**: the fine-rotation slider moved OUT of the
  `isWallMountable`-only checkbox block into its own section gated on
  `!isMonster` (same gate `height` already uses), disabled when
  `facing === null` with an honest hint instead of silently no-opping.
  New **"snap flush to nearest wall"** button, floor-standing placements
  only (`mount !== 'wall'` — a wall mount is already flush by
  construction once on a real wall-bearing edge): computes the validated
  `(facing, rotationDegrees)` pair via `computeFlushRotation` and, on
  click, sets both fields in one action — Kirk's actual use case was
  never "give me a slider," it was "make this flush," and a bare slider
  makes the author find the angle by feel/trigonometry, exactly the
  friction the original "30 deg to be flat on the wall" report was about.
  Disabled with an honest tooltip when the cell has no adjacent wall.
- **`useBoardEditing.ts`**: new `handleSnapFlush(target)` — two
  independent mutator calls (`setPlacementFacing` then
  `setPlacementRotationDegrees`) against the same `(roomId, index)`, safe
  because neither moves the item (no stale-index risk the way
  `handleFlipMountSide`'s cross-list move has to guard against).
- **Monsters excluded, named honestly**: `PreviewMonsterModel.tsx` (the
  3D preview's monster renderer) has no `rotationY` prop at all — checked
  directly, not assumed. A monster placement's `rotate_degrees` would
  parse/strip correctly but render with zero visible effect, so the
  Inspector's new section stays gated on `!isMonster`, same boundary
  `blocks_movement`/`blocks_los`/height already use.
- **Range stays ±30°**, unchanged, for a real reason rather than habit:
  the interleave geometry above means ±30° exactly covers the reachable
  gap for both branches — any wall-flush angle is reachable as some floor
  `facing` ± 30°, never more.

### Tests

`boardGeometry.test.ts` gains 13 new cases: `facingToRotationY`/
`wallMountRotationY` (the 6-and-6 interleaved angle sets, scale
invariance), `nearestBearingFacing` (circular-distance tie-breaking), and
`computeFlushRotation` (null-safety with no adjacent wall, all 6
wall-bearing directions always resolve within ±30°, a full round-trip
reconstruction against `wallMountRotationY`'s real target angle for each,
and current-facing bias when a cell has walls on more than one side).
Full suite: 97 dungeon-builder tests passing (up from 84), typecheck and
lint clean.

### Verified live

Built an isolated single-room test document (`connectors: []` is
required even when empty — the parser reports "No connectors: list
found" and leaves the board unchanged otherwise, caught by the live
verification itself, not read in the source first) — one floor-standing
`dnd5e:props:pillar` at `[5,3]` with a real wall from `[5,3]` to `[6,3]`
(no `mount:` key at all). Selected it: Inspector showed `facing: —`, the
fine-rotation slider at 0° and disabled with "pick a facing direction
above to enable fine rotation," and "snap flush to nearest wall" already
enabled (`computeFlushRotation` doesn't need a pre-existing facing).
Clicked it: the YAML gained `facing: NW, rotate_degrees: 30` in one
action — the EXACT pair `boardGeometry.test.ts`'s round-trip test
predicts for a wall on this cell's NE edge — and the Inspector updated to
show `facing: NW`, the slider now enabled at 30°, with the hint switched
to "added on top of facing's coarse pick — the only way to sit a
floor-standing prop edge-parallel (flush) against a wall." Compile badge
correctly tracked `Uses: 1 wall, facing (1 placement), fine-rotation
experiment (1 placement)` throughout. Evidence:
`docs/evidence/dungeon-builder-floor-rotation-disabled-before-facing.png`,
`docs/evidence/dungeon-builder-floor-rotation-snap-flush.png`.

**Not captured: the 3D render itself.** This ephemeral job worktree has
no `public/models/synty/` at all (unlike prior rounds' worktrees, which
had it rsync'd from `~/game-dev/rpg-game-assets` — see this file's
"Thumbnails" section above for that provenance) — attempting the 3D
toggle throws `Could not load .../Dungeons_Texture_FloorTiles_01.png` and
the R3F `<Canvas>` never mounts at all (`canvas` count 0 in the DOM),
an environment gap, not a code defect. What's verified instead: `preview3d/
DungeonPreview3D.tsx`'s `buildOnePlacement` now calls the exact same
`wallMountRotationY`/`facingToRotationY` functions (moved to
`boardGeometry.ts`, imported rather than reimplemented) that
`boardGeometry.test.ts`'s round-trip test already proves reconstruct the
real flush angle — the 3D render path is mathematically guaranteed
consistent with the Inspector state confirmed live above, even though this
worktree can't render the GLB to prove it visually. Whoever next has
Synty assets synced in a dungeon-builder worktree can confirm the pixel
result in under a minute by loading the same test YAML above and
toggling to 3D.

`ci-check` clean.

### Reconciled with the `defaults:` resolver, same day

This section and the `defaults:` one above it (this file's prior
section) shipped on separate branches — #693 (fine rotation) and #691
(`defaults:`) — that never coexisted in either PR's own history, so
neither had a chance to prove the two compose. Reconciling #693 onto
`dev` after #691 landed there surfaced the real seam: `buildOnePlacement`
(`preview3d/DungeonPreview3D.tsx`) and the Inspector's fine-rotation gate
both need the RESOLVED facing (`resolvePlacement`'s output), not the
placement's own raw `facing`, for an inherited facing to compose with a
fine-rotation nudge the same way an explicit one already did — `mount`
stays a raw read either way, since it's deliberately not a defaultable
field (`DungeonDoc.defaults`'s own doc comment). Composed, not merely
merged: `buildOnePlacement`'s `rotationY` formula and `worldPosition`
call now read `resolved.facing`/`resolved.height` (from `resolvePlacement`)
while keeping the fine-rotation generalization's "apply `rotationDegrees`
on top of BOTH the wall and floor-standing branches" shape from this
section above; the Inspector's slider-disabled and snap-flush-target
gates (`facing === null`) already resolved cleanly through git's own
merge (both read the same `facing` local, itself now
`resolved?.facing ?? null`) — confirmed by adding coverage rather than
assumed. `buildOnePlacement` exported (previously private) so this could
be asserted directly against the real render-path code, same "one shared
definition, not a private duplicate" reasoning `facingToRotationY`/
`wallMountRotationY` already used moving into `boardGeometry.ts`.

New composition tests, none of which existed on either source branch:
`preview3d/DungeonPreview3D.test.ts` (new file) — an inherited facing
composes with an explicit `rotate_degrees` through both the floor-standing
and `mount: wall` branches, asserted against the actual exported
`buildOnePlacement`, not a hand-copied formula. `Inspector.test.tsx` (new
file) — an inherited facing enables the fine-rotation slider exactly like
an explicit one, and the no-facing-at-all case still disables it with the
same honest hint. `dungeonYaml.test.ts`'s `defaults:` describe block gains
one case: `handleSnapFlush`'s two-mutator write (`setPlacementFacing` +
`setPlacementRotationDegrees`) produces an EXPLICIT facing that overrides
a ref-level default, using a snap-flush answer deliberately different
from the default so a silent no-op couldn't pass. 117 dungeon-builder
tests passing (up from 112 — the 84-test shared base plus #693's 13 plus
#691's 15, confirming no coverage was lost composing the two — plus 5
new composition cases), `ci-check` clean (format/lint/typecheck/build/
test).

## Region-authoring unit: creation, attachment, and the folded backend-sync items (2026-08-03)

Kirk's ask, verbatim: "creating a region and ideally attaching it to the
next region" — the first real prototype of rpg-project#180 (cell-authored
semantic room regions), proposed shape only until this round (this file's
own "Regions section" the rpg-project#175 comment sketched, no mutator
behind it). Real CST mutators, a creation-mode authoring UI, and an
edit-mode read-only overlay now exist. Three small backend-sync items
(facing badge split, holes reconciliation, a status-tracking note) folded
into the same PR per this unit's brief — see their own subsections below.

### `regions:` — shape, invariants, and where it lives

`RegionDoc { id, name?, archetype, cells: [col,row][] }`
(`dungeonYaml.ts`), matching the shape Kirk's own rpg-project#175 comment
already sketched. Full design writeup — including three alternative cell
encodings considered and rejected (run-length, bounding-box bitmap,
per-row span list — all premature for the small regions this concept
authors today) and the open questions this prototype deliberately does
NOT decide (rooms/regions precedence in one document, whether regions
must fully tile the space, minimum region size) — lives in
`TARGET-YAML.md`'s new "regions:" section, not duplicated here.

Client-side validation (`validateRegionCells`, `regionGeometry.ts`'s
`cellsAreContiguous`/BFS) enforces exactly rpg-project#180's own
acceptance criteria — non-empty, orthogonally contiguous, non-overlapping
— on every mutator that changes a region's cell set
(`createRegion`/`addCellToRegion`/`removeCellFromRegion`), not just at
creation. `removeCellFromRegion` additionally refuses to empty a region
(delete it instead) or split it into two disconnected pieces.

### Attachment: a door edge on the shared boundary, distinct from chain `connectors:`

`connectRegions` (`dungeonYaml.ts`) computes every shared orthogonal
boundary edge between two regions (`regionGeometry.ts`'s
`sharedBoundaryEdges`) and places a door on the MIDPOINT one
(`pickAttachmentEdge`) via the existing `setWallEdge` mutator — mechanically
just another `walls:` entry. Verified against the real
`dungeonspec.Validate` source (rpg-project#175's own spot-check finding,
re-confirmed here): an authored door edge does NOT replace, satisfy, or
count as a chain connector — `connectors:` stays independently
chain-constrained. `TARGET-YAML.md`'s new "Region attachment vs. chain
connectors" section has the full side-by-side comparison.

### UI: creation-mode paint-then-name, edit-mode read-only

`creation/useRegionEditing.ts` (state: pending cells for a not-yet-created
region, the selected existing region) + `creation/RegionPanel.tsx` (the
floating create/connect/edit panel, `Inspector.tsx`'s visual language) +
`CreationBoard.tsx`'s region-tool pointer handling and tinted-overlay
rendering. Palette gets a 4th Structural row, **creation-mode only**
(`Palette.tsx`'s new `showRegionTool` prop, `false` by default — edit
mode's own `Palette` usage never passes it). Immediately after creating a
SECOND-or-later region, the panel offers a one-click "Connect to
'&lt;previous region&gt;'?" prompt if the two share a boundary — the
"ideally attaching it to the next region" flow named directly.

**A real bug caught by live verification, not just unit tests**: the
panel's own early-return guard (`if (pendingCells.length === 0 &&
!editingRegion) return null`) didn't account for the just-created-region
state (`justCreatedId`), so the "connect to previous" callout never
rendered — the panel just vanished the instant a region was created, no
matter how many other regions already existed. Unit tests never caught
this because they call the mutators directly, never render the component;
only driving the actual browser (see "Live verification" below) surfaced
it. Fixed by adding `justCreatedId` to the guard's own condition.

Edit mode (`Board.tsx`, hex-true) renders any `regions:` a document
carries — hand-typed in the YAML pane, or round-tripped from a document
first built in creation mode — as a read-only tinted-hex overlay +
centroid label (`regionGeometry.ts`'s `regionCentroid`), same archetype
coloring (`markerStyle.ts`'s new `regionArchetypeColor`) as the creation
board's own overlay, `pointerEvents="none"` throughout — no create/edit
affordance there this round, matching this unit's own brief.

### Folded sync item (a): facing badge now splits by entry type

A real backend probe (rpg-project#175's "Backend feedback: exercising the
new authoring API" comment, 2026-08-03) found floor-prop `facing` now
genuinely compiles on Kirk's authoring branch — but ONLY for a
room-scoped, non-monster, non-`mount:wall` placement; every other entry
type (monster, boss, wall-mount) decodes and is then explicitly rejected
(`"facing only supported on room-scoped floor props"`). The Inspector's
single `TargetDialectBadge` on `facing` was therefore overstating "not yet
compiled" uniformly the moment part of the field became real for one
shape. Fixed: a new `FacingConservativeBadge` (`Inspector.tsx`) renders
instead of the ordinary dialect badge whenever the selected placement is a
monster, a boss, or `mount: wall` — its tooltip carries the real
validator's own rejection message. `TARGET-YAML.md`'s "compile status now
varies by entry type" section has the full per-entry-type table.

### Folded sync item (b): holes reconciled out of the main specimen

The v0.1/v0.2 kitchen-sink specimen inconsistently carried a `holes:`
entry despite holes being deliberately deferred from the near-term dialect
— fixed by dropping `holes:` from `kitchen-sink.yaml` (v0.3) and adding a
small standalone `specimens/exploration/holes.yaml`, generated the same
way (the real serializer, not hand-typed), so demonstrating the retained
prototype never implies it carries the main pack's status. See
`specimens/README.md`'s v0.3 changelog.

### Folded sync item (c): status-tracking note, not a badge flip

`start:` and floor-prop `facing` both now compile on Kirk's authoring
branch (same 2026-08-03 probe) — but that branch is UNRELEASED, so every
badge in this concept stays exactly as it was (target-dialect / the new
conservative variant) until the branch actually merges. `TARGET-YAML.md`'s
new "Status tracking note" section records this so the next session
doesn't have to re-discover it, while being explicit that this note alone
is not authorization to flip any badge.

### Specimen pack v0.3

`kitchen-sink.yaml` regenerated via the real serializer (the README's
documented throwaway-`_regen.test.ts` process, not hand-typed): two
regions (`hall-inner`, `hall-annex`) inside `hall`'s absolute column
range, connected via `connectRegions` — the resulting door edge is a
THIRD `walls:` entry, counted under the existing `"3 walls"` drop tally;
`regions:` itself drops as a new, independent `"2 regions"` entry.
`specimens/README.md`'s changelog has the full diff.

### Live verification

Real browser, real dev server (`npm run dev -- --port 5173`, this
concept's own `/concepts?concept=dungeon-builder` route), driven via a
throwaway Playwright script (`game-dev/tools/browser/_job_regions_*.mjs`,
gitignored scratch pattern, not this repo). Three screenshots:

1. A 2×2 region ("North Alcove") painted, created, and rendered with its
   tinted overlay + label on the creation board, the Palette's Region row
   showing a live count, and the proposed-YAML pane showing the real
   `regions:` block this session's own click sequence produced.
2. A second adjacent region ("East Annex") created, the "Connect to
   'North Alcove'?" prompt accepted, and the resulting door
   (`{ from: [5,4], to: [4,4], kind: door }`) visible in both the board
   overlay and the YAML pane — the exact edge `pickAttachmentEdge`'s
   midpoint rule predicts for this two-edge boundary.
3. Edit mode (hex-true board) rendering a hand-typed `regions:` block
   read-only — the "Inner Sanctum" region's tinted hex overlay + label,
   and the compile-badge strip correctly showing "Uses: 1 region — not
   yet compiled server-side" (the existing generic `dropped`-array badge
   mechanism, unchanged, picking up the new construct automatically).

The two expected `PutDungeon`/authoring-service console errors
(`[unimplemented] unknown service ...AuthoringService`) are this concept's
normal FIXTURES-MODE behavior against a dev server with no local `rpg-api`
running — not a regression, and unrelated to regions.

162 dungeon-builder tests passing (up from 117 — 45 new: 28 in
`dungeonYaml.test.ts`'s new `regions:` describe block covering parse,
every mutator, `connectRegions`, comment-safety, and `stripToV1Subset`;
17 in the new `regionGeometry.test.ts` covering the pure adjacency/
contiguity/boundary-edge/centroid math directly). `ci-check` clean
(format/lint/typecheck/build/test).

## Hex-true creation canvas: kill the square-grid renderer (2026-08-03)

Kirk, diagnosing the "New Dungeon" canvas directly: "that new dungeon is
squares... our walls as we lay them out cannot follow along the edge...
any hex that is not 100% uncovered would not be traversable by the
players" — sharpened: a square grid draws only 4 of a hex's 6 real
adjacencies, so a region that reads as fully enclosed on squares can have
two INVISIBLE open edges in hex reality (players walk through the
diagonals — false enclosure); and "walls look like vertical blinds along
the side edges" — a square wall run between two rows is a set of
disconnected parallel slats, where real hex edges share corners and chain
into one continuous run. Edit mode went hex-true back in the
flattened-vs-hex-true round ("Flattened layout mode: explored and
rejected," above); creation mode's own square renderer survived that
round as "genuinely separate, never claiming hex adjacency" — that
exemption ends here.

### What changed, mechanically

`creation/creationGeometry.ts` is rebuilt on the SAME hex primitives
`hexLayout.ts`/`boardGeometry.ts` already give edit mode
(`cellCenter`/`cellCorners`/`edgeBetweenCells`/`worldToCube`/
`neighborCell`) — one coordinate space for both boards now, not two.
`FLAT_COL_SPACING`/`FLAT_ROW_SPACING` (square-grid pitch constants) are
deleted from `hexLayout.ts` entirely, along with every `hEdgeGeometry`/
`vEdgeGeometry` axis-aligned edge function. `CreationBoard.tsx` renders
real hex polygons (`creationCellPolygon`) for the base grid, holes, and
region overlays, and real edge segments (`edgeBetweenCells` via
`wallGeometry`) for walls — replacing the old tiled-`<rect>` background
pattern and axis-aligned wall `<line>`s. The canvas dimension semantics
(a `{width,height}` grid of `[col,row]` cells, 20×30 by default) are
UNCHANGED — only the geometry each cell resolves to is different.

### The wall-drawing crenellated-comb bug does NOT reappear in hex — verified numerically, not assumed

The square board's own bug (this file's "wall-drawing interaction"
finding, way above): a per-pixel dx-vs-dy comparison flipped which of 2
candidate edges was "nearest" at a point with no relationship to a real
edge boundary, producing disconnected teeth instead of a straight wall.
The obvious question for hex — does picking among a cell's 6 real edges
have the same instability? — was checked directly (a small standalone
script sampling points along a straight world-space line and calling the
new `nearestEdge` at each one, before writing any test): every transition
between distinct edges shared a real corner, with NO lock at all. This
isn't a coincidence — a hex cell's 6 "nearest to this edge" regions tile
the cell with shared boundaries exactly at the corners, unlike the
square's 4-quadrant dx/dy split, which had a seam unrelated to any real
edge. `creationGeometry.test.ts`'s own describe block ("hex-true fix for
the square predecessor's crenellated-comb bug") re-proves this as a real
vitest test, not just a one-off script. The drag-orientation lock
(`dragFamily`, generalized from 2 axes to hex's 3 parallel-edge families)
survives in the interaction, but for a WEAKER reason than before: not to
prevent disconnection (nothing can produce a gap), but to hold one
deliberate family choice for a long stroke so it can't drift onto an
unrelated third family mid-drag.

**Visual proof, not just geometry math**: `demoScript.ts`'s own divider
wall used to be hand-transcribed as one `[col,14]-[col,15]` segment per
column (`DIVIDER_COLS`) — a pattern that drew a straight, connected line
under the OLD square geometry. Run through the new hex math as-is, it
does NOT connect (consecutive segments land ~20px apart — a real gap,
confirmed numerically). Rather than hand-picking new coordinates (which
would just be a second, unverified guess), `creationGeometry.ts` grew
`traceEdgeRun` — samples a straight world-space line through the SAME
`nearestEdge` a live drag calls — and `demoScript.ts` now derives its
wall run FROM that function. "Play the pitch," driven live in a real
browser, produces a continuous zigzag wall with the door sitting cleanly
in the middle of the run — screenshot evidence below.

### Region brush: click-per-cell became drag-to-paint

Kirk's ask, verbatim: "building a region should have us draw the shape.
right now we have to click every square." The region tool's pointer
handling used to fire exactly once per click
(`useRegionEditing.ts`'s `togglePendingCell`/`handleToggleCellOnSelected`,
both plain toggles). Drag-paint needed a DIFFERENT primitive, not just a
pointer-move loop calling the same toggle repeatedly: a toggle re-applied
to a cell the drag revisits (normal for a slow real mouse-move, which
fires many events per cell) would flip it back off mid-stroke, and a
toggle's direction depends on the CELL's own pre-drag state, not the
stroke's — inconsistent the moment a drag crosses a mix of already-member
and non-member cells. Fixed by adding idempotent siblings,
`setPendingCellMembership`/`setSelectedRegionCellMembership` (`included:
boolean`, only mutates if it would actually change something), with the
add-vs-erase MODE decided once, from the drag's first cell (Shift forces
erase regardless of that cell's own state — the "a modifier... removes"
affordance), then held for the whole stroke via a per-drag `touched`
dedup set in `CreationBoard.tsx`. Live-verified: one continuous
pointer-down+drag+up gesture painted a real 9-cell pending region ("9
cells selected" in the panel) — screenshot evidence below.

### Enclosure honesty: an OPEN-boundary overlay, Kirk's false-enclosure worry made visible

New `creationGeometry.ts` function, `openBoundaryEdges(cells, walls)`:
for every member cell's up-to-6 real hex edges, skip the ones bordering
ANOTHER member of the same region (internal, membership-only, never
"open" regardless of walls), then flag whichever of the remaining
boundary edges has no matching `walls:` entry. Cheap by construction (at
most 6 neighbor checks per member cell, a flat `walls` scan per candidate
edge — same budget `sharedBoundaryEdges` already spends). `CreationBoard.tsx`
renders the result as a hot red/orange line overlay for EVERY region on
the board, not just the selected one — an author scanning the whole
canvas should see at a glance which regions are actually sealed, not have
to select each one in turn. Four new `creationGeometry.test.ts` cases
cover: an isolated cell's all-6-open baseline, one wall closing exactly
one edge, all 6 walls fully sealing a cell (zero open edges), and — the
one that most directly answers Kirk's worry — the shared internal edge
between two same-region members is NEVER open, wall or no wall, because
it was never a boundary edge to begin with.

### The 4-vs-6 adjacency finding: `regionGeometry.ts`'s `cellsAdjacent` was under-counting

`regionGeometry.ts`'s `cellsAdjacent` used to be a plain 4-neighbor
orthogonal check (`|dcol|+|drow| === 1`), inherited from the square
canvas #694 built regions against. Real hex adjacency
(`hexDistance(cubeAtColRow(a), cubeAtColRow(b)) === 1`) is a STRICTLY
WIDER relation: every same-row-±1-col or same-col-±1-row pair is still
hex-adjacent (verified algebraically — the parity-correction term in
`cubeAtColRow` cancels identically for both cases), so nothing that
validated as contiguous under the old rule stops validating. What
changes is that a hex cell has 6 neighbors, not 4 — exactly 2 of a square
grid's 4 "diagonal" directions turn out to be genuine hex neighbors
(which 2 depends on column parity; verified numerically: `[1,1]`-`[2,2]`
is hex-distance 1 — a real neighbor — while `[1,1]`-`[0,0]` stays
hex-distance 2, even though both read identically as "diagonal" on the
square grid). Concretely, on a real fixture:
`connectRegions` between two 2-cell regions (`dungeonYaml.test.ts`'s own
test) used to find exactly 2 candidate shared-boundary edges under
4-adjacency; the SAME two regions have 3 under real hex adjacency (a
genuinely new `[1,1]-[2,2]` edge neither region's own square-grid
authoring anticipated) — which shifts `pickAttachmentEdge`'s
midpoint-of-N pick from `{from:[2,1],to:[2,2]}` to `{from:[1,1],to:[2,2]}`.
Fixed the one test that hard-coded the old 2-edge answer; every other
region test (contiguity, overlap, the 6-cell block, the two-disconnected-
islands case) needed no change, since 6-adjacency is additive, never
subtractive, relative to what #694 already validated. `TARGET-YAML.md`'s
"Invariants" section under `regions:` now says "hex-contiguous," not
"orthogonally contiguous," with the same finding recorded there.

### Live verification

Real browser, real dev server (`npm run dev -- --port 5175`, this
concept's own `/concepts?concept=dungeon-builder` route,
`New Dungeon` tab), driven via throwaway Playwright scripts
(`game-dev/tools/browser/_unit_hexcreate_*.mjs`, gitignored scratch
pattern, not this repo — same convention the region-authoring unit
above used). Screenshots:

1. The blank "New Dungeon" canvas rendering as real hexagons, not
   squares — the core visual claim this whole round makes.
2. "Play the pitch" run to completion: a continuous zigzag divider wall
   with a door at its midpoint, a monster and a facing-rotated reaper
   statue, START/END markers — all at their real hex positions. The SVG's
   own viewBox for a 20-column canvas is ~1321×1490 board units (the
   canvas GENUINELY shears diagonally across 20 columns, same
   already-accepted finding this file's "the floor plan shears
   diagonally" section describes for edit mode's compiled boards, now
   also visible on creation mode's wider canvas) — confirmed by
   inspecting the live DOM (11 wall `<line>`s, 5 marker `<circle>`s, all
   genuinely present) before scrolling the container to frame a close-up
   of the wall run itself.
3. A single pointer-down+drag+up gesture over the Region tool painting a
   real 9-cell pending region — no per-cell clicking.
4. A freshly-created, unwalled region rendered with its ENTIRE boundary
   traced in the new open-edge red highlight — the false-enclosure
   affordance, directly answering Kirk's worry.
5. A second region created elsewhere on the canvas, correctly and
   HONESTLY reported as not sharing a boundary with the first ("region-1"
   doesn't share a boundary with this region — nothing to connect
   automatically") — the connect-flow's rejection path, re-verified
   under real hex adjacency. The POSITIVE connect-success path (a door
   correctly placed on the pickAttachmentEdge midpoint) is not
   separately screenshotted this round — it's the exact case
   `dungeonYaml.test.ts`'s `connectRegions` test already covers post-fix,
   including the specific 4-vs-6-adjacency edge-count change above.

The two expected `PutDungeon`/authoring-service console errors
(`[unimplemented] unknown service ...AuthoringService`) are this
concept's normal FIXTURES-MODE behavior against a dev server with no
local `rpg-api` running — unrelated to this round's changes.

170 dungeon-builder tests passing (up from 162 — 8 new: 6 in
`creation/creationGeometry.test.ts`'s `nearestEdge`/`traceEdgeRun`/
`nearestCreationCell`/`dragFamily` coverage of the new hex math, plus a
4-case `openBoundaryEdges` block; `regionGeometry.test.ts`'s existing
adjacency/boundary tests were updated in place, not added to, to assert
the new hex-true answers). `ci-check` clean
(format/lint/typecheck/build/test).

## Straight walls with visible footprint — prototype unit (2026-08-03, rpg-project#169)

Kirk's design direction, prototyped as a comparison: the hex-true creation
canvas above ships an edge-painted zigzag Wall tool, but Kirk drew straight
red lines across a room and said the walls should be straight — and stated
the rule directly: **"any hex that is not 100% uncovered would not be
traversable"** — a straight wall has a FOOTPRINT, clipped cells are spent.
The real game's own wall renderer (`wallRuns.ts`/`WallRunMesh`) already
draws straight modular wall runs along room envelopes — the zigzag is this
concept's own outlier, not the game's established look. Full design
writeup: TARGET-YAML.md's "Straight walls" section (schema shape decided
and why the alternative — a `style:` discriminator on `walls:` — was
rejected; the footprint epsilon derived and justified; the shoulder-
clipping/every-other-hex cases; movement semantics (a) and (b); the
touch-adjacent-to-footprint finding for (b); corner continuity; the
compiler-responsibility note).

### What shipped

A new Structural-category tool, **Straight Wall**, alongside the existing
Wall tool (both survive — the comparison is the point). Drag locks to
whichever of 2 screen axes (vertical/horizontal) the drag is closer to,
then snaps the endpoint to the closest AVAILABLE hex cell approximating
that axis (`creation/straightWallGeometry.ts`'s `pickStraightAxis`/
`snapStraightEndpoint` — a 2-way analog of the zigzag tool's own 3-way
`dragFamily`). A click (no real drag) on an existing straight wall deletes
it; the Door tool, applied to a straight wall's line, flips `solid`↔`door`
by index. New document field `wallLines: WallLineDoc[]` (a sibling to
`walls:`, not a variant — see TARGET-YAML.md for why), with its own
mutators (`addWallLine`/`removeWallLineAt`/`toggleWallLineKindAt`,
`dungeonYaml.ts`) and its own `stripToV1Subset` drop/count, reported
separately from `walls:`'s own count.

Footprint + crossing math is real Cyrus-Beck half-plane clipping (6
half-planes per hex, shrunk inward by `FOOTPRINT_EPSILON =
BOARD_HEX_SIZE * 1e-3`), not a sampling heuristic — computed live while
dragging (the preview) and rendered for every committed `wallLines:` entry.
Footprint cells render with a new crimson diagonal-hatch `<pattern>`
(`db-footprint-hatch`), deliberately distinct from the region open-boundary
overlay's plain solid red LINE (`openBoundaryEdges`) — a hatch reads as
"this ground is gone," a line reads as "this boundary has a problem," and
the two ARE different facts. Blocked edge-crossings (movement semantic (b))
render as a dashed highlight across the specific grazed edge.

**Existing content in a new footprint is FLAGGED, never silently deleted or
moved**: placements get an extra warning ring + "⚠ IN WALL FOOTPRINT" label
(live during the drag, not just after release); start/end reuse this file's
own "⚠ ... (BLOCKED!)" visual language verbatim (`Board.tsx`'s entrance-
blocked convention); region cells inside a footprint get a small ⚠ overlay,
with the region's own `cells:` membership left untouched (per the settled
model: an inner wall never splits a semantic region).

### Live verification

Real dev server (`vite --port 5180`, never `:3001`), driven via a throwaway
Playwright script (`game-dev/tools/browser/_job_swall_verify.mjs`,
gitignored scratch pattern, same convention the region-authoring/hex-
creation units above used) — computed real hex-true board-space coordinates
(the SAME `cellCenter` formula `hexLayout.ts` uses, ported into the script)
and read the SVG's own live `viewBox` to convert board-space points to
on-screen pixels for `page.mouse` drags, rather than assuming a fixed
pixel-per-cell spacing (the OLD square-grid `FLAT_COL_SPACING`/
`FLAT_ROW_SPACING` constants the region-authoring unit's own script used —
those no longer exist post-hex-true).

- `docs/evidence/straight-walls-vertical-footprint.png` — a genuinely
  vertical straight wall (`[4,4]` → `[6,1]`, verified analytically to share
  the same world X) rendered as a clean white line through exactly 3
  hatched hexes, with the immediately flanking hexes visibly UN-hatched —
  the shoulder-clipping case, seen live, not just asserted in a unit test.
- `docs/evidence/straight-walls-l-corner.png` — a second segment drawn from
  the SAME endpoint cell (`[6,1]` → `[10,3]`) forms a clean L corner with no
  gap and no special-case code, exactly Kirk's red-lines picture.
- `docs/evidence/straight-walls-vs-zigzag-comparison.png` — the same L
  corner alongside an edge-zigzag Wall-tool run drawn over a similar span:
  the straight wall reads as one clean, unbroken run with a visible
  footprint; the zigzag run (real `dragFamily`-locked edge-painting, still
  topologically correct) visibly breaks into short, disconnected-looking
  segments once the drag isn't aligned with one of the hex grid's 3 real
  edge families — the live, visual version of the finding TARGET-YAML.md's
  "why this needs a genuinely different shape" section makes analytically.

Confirmed via the live YAML pane (not just the screenshots' own claim):
`wallLines: [ { from: [4, 4], to: [6, 1], kind: solid }, { from: [6, 1],
to: [10, 3], kind: solid } ]` and a real 8-segment `walls:` zigzag run
alongside it, both present in the same document. The only console errors
are the expected FIXTURES-MODE `[unimplemented] unknown service
...AuthoringService` (this dev server has no local `rpg-api` running —
unrelated to this unit, same as every other round's live-verification
note above).

### Tests

19 new tests in `creation/straightWallGeometry.test.ts` (footprint
clipping incl. the shoulder-clipping vertical case and the every-other-hex
"same row index is not horizontal" case, contrasted directly against a
genuinely world-horizontal line; the epsilon touch-vs-clip boundary,
verified both sides of it; the movement-semantics (b) mechanism exercised
directly since no natural cell-to-cell wall in this unit's own testing —
3 hand-derived cases plus 400 randomly sampled pairs — ever produces a
both-clear crossing, a real, verified finding, not an assumption; corner
continuity; the footprint-set union; axis-pick; endpoint-snapping) plus 7
new `dungeonYaml.test.ts` cases (`wallLines:` add/remove/toggle mutators,
round-trip through real YAML text, `stripToV1Subset` dropping it
separately from `walls:`). 196 dungeon-builder tests passing overall (up
from 170). `ci-check` clean (format/lint/typecheck/build/test).

## Corner-anchored straight walls + line doors (2026-08-03, rpg-project#169 follow-up unit)

Kirk's live feedback on the straight-wall prototype above, verbatim: "I
could not get the edges quite right. would be nice if I could fine tune
the edges — oh I could edit the yaml directly, right. It always hangs
over a little. Doors still follow the hex edges. It is really coming
along." Two real gaps, both closed this round: (1) `wallLines:`
endpoints were anchored at cell CENTERS, so every wall overshot its
intended extent by up to half a hex at each end, by construction, with no
finer lattice to fine-tune into even by hand-editing the YAML; (2)
`kind: door` lived on the WHOLE line — a "door" wallLine was cosmetically
re-colored amber but exactly as impassable as a "solid" one (the
footprint math never read `kind` at all), so doors never got a real
carved opening anywhere.

### What shipped

**Corner-anchored endpoints.** `wallLines[].from`/`.to` are now
`CornerRef` (`creation/hexCorner.ts`, new module): `{cell: [c, r], corner:
0..5}`, `corner` matching `hexCorners`' own `30° + 60°·i` convention. A
hex vertex is shared by up to 3 cells, so `hexCorner.ts` also owns the
dedup rule — **canonical = the owner with the lexicographically smallest
`[col, row]`** — and the geometric-neighbor search (`cornerOwners`) that
implements it, verified directly (not assumed) that every interior corner
really does have exactly 3 owners. `nearestCorner` is the snap target for
drawing/dragging; `migrateLegacyCenterEndpoint` is the parse-time
migration for a PRE-corner-anchoring document (see "Migration," below).
`straightWallGeometry.ts`'s own clip math (`clipSegmentToShrunkHex`/
`isCellClipped`/`candidateCells`) needed ZERO changes — it already
operated on raw world-space points; only the higher-level functions that
resolved `from`/`to` via `cellCenter` now resolve them via `cornerPoint`.

**Endpoint fine-tuning.** Selecting a straight wall (click its line) shows
two draggable handle circles at its `from`/`to` corners; dragging one
snaps corner-to-corner (`nearestCorner`) with the footprint/crossing
overlay updating live during the drag, committed via a new
`setWallLineEndpoint` mutator. Dropping a handle onto the line's own
OTHER endpoint (collapsing it to zero length) is rejected with a toast,
not silently clamped elsewhere. **A necessary UX trade-off**: click on an
existing line now SELECTS (shows handles) instead of deleting — deleting
a selected wall moved to the Delete/Backspace key
(`CreationBoard.tsx`'s own keydown effect), mirroring the existing global
delete gesture edit-mode placements already use. Click-to-select and
click-to-delete are mutually exclusive interpretations of the same
gesture, and fine-tuning is only reachable through selection.

**Doors: a carved opening at a cell, not a property of the whole line.**
New shape: `doors: [{cell: [c, r]}]` on each wallLine, zero or more,
each referencing one of the line's own footprint cells. **Traversability
semantic, exact**: a door's cell is excluded from THIS line's footprint
entirely (`straightWallFootprint`'s new `doorCells` exclusion parameter)
— as if the line never clipped it — and because `straightWallCrossedEdges`
reads the SAME (now-excluded) footprint set, the door cell automatically
participates in movement semantic (b)'s crossing-check as an ordinary
clear cell too, no separate door-crossing mechanism needed. A door only
reverses THIS line's own claim on that cell — something else can still
block it independently. The Door tool, applied to a straight wall,
resolves a click to the nearest real footprint cell along the line
(`wallLineDoorCellAt`: project the click onto the line, find which cell's
own `[t0,t1]` clip interval contains it) and toggles a door there
(`toggleWallLineDoorAt`) — add if absent, remove if present. Rejected
clicks (landing on a touch-only stretch, no real footprint cell) show a
toast rather than silently no-opping — verified live, see below. A door
stranded by a subsequent endpoint drag (its cell fell out of the raw
footprint) renders a ⚠ marker instead of a hinge, flagged not silently
dropped, same discipline this file's placement/start/end/region footprint
checks already follow.

**Alternative door shape considered and rejected**: `doors: [{at: t}]`, a
continuous parametric position. A real compiler already walks the line's
own clip intervals cell-by-cell to derive the footprint, so mapping `t`
to "which cell" would reuse that machinery — but rejected anyway: a `t`
value's meaning depends on the line's exact parameterization, so an
endpoint fine-tune (the handle-drag feature, same round) could silently
drift a stored `t` onto a DIFFERENT cell than the author meant. A `cell:`
reference stays anchored to a real, named cell regardless of small
endpoint adjustments, and is consistent with every other coordinate in
this whole dialect already being `[col, row]` cell-space.

**Migration.** A PRE-corner-anchoring `wallLines:` entry (bare `[c, r]`
endpoints, the original unit's own shape) is picked up at PARSE time —
`migrateLegacyCenterEndpoint` picks whichever of the cell's own 6 corners
sits nearest the OTHER endpoint's resolved position, so the migrated line
keeps pointing the direction it always drew. A legacy whole-line
`kind: door` materializes into a single door at the cell nearest the
line's own midpoint. **Heals the in-memory `doc` immediately; does NOT
rewrite the underlying CST/YAML text by itself** — consistent with this
file's own CST-preservation discipline, an untouched legacy entry's saved
text stays legacy until a mutator actually touches it (a drag, a door
toggle), at which point `normalizeWallLineItem` (new, called at the top
of both `setWallLineEndpoint`/`toggleWallLineDoorAt`) converges the WHOLE
entry — both endpoints, not just the one being edited — and drops the
now-meaningless `kind:` key. Given how little `wallLines:` content
existed anywhere at the time of this change, this self-healing break was
judged cheaper and more honest than carrying two live representations
through every downstream consumer indefinitely.

**A real circular-import bug, hit and fixed, not theorized.** `hexCorner.ts`
originally imported `boardGeometry.ts`'s own `neighborCell`; `dungeonYaml.ts`
needs `hexCorner.ts` for parse-time migration; `boardGeometry.ts` imports
`dungeonYaml.ts` for `resolvePlacement`/`DungeonDoc`. That's a genuine
`dungeonYaml.ts -> hexCorner.ts -> boardGeometry.ts -> dungeonYaml.ts`
cycle — crashed with "Cannot access '**vite_ssr_import_N**' before
initialization" under Vite's ESM interop the moment `hexCorner.ts` was
imported from `dungeonYaml.ts`, confirmed by actually running the test
suite, not predicted. Fixed by duplicating `neighborCell` (6 lines, built
from the same lower-level `hexLayout.ts` primitives) directly inside
`hexCorner.ts` instead of importing it, keeping that module leaf-level —
and by NOT importing `straightWallGeometry.ts` (same transitive cycle
via `creationGeometry.ts` → `boardGeometry.ts`) into `dungeonYaml.ts` for
the legacy door-migration path either; that path uses a simpler,
self-contained "nearest cell to the line's own midpoint" computation
instead of the Door tool's own exact footprint-cell resolution (fine for
a rare, one-time legacy-migration fallback; the live Door tool itself
stays exact).

**A second real bug, caught by a failing test, not by inspection**:
`toggleWallLineDoorAt`'s first draft compared a door node's `cell` field
via `Array.isArray(c) && c[0] === cell[0] ...` — but `YAMLMap.get('cell')`
returns a live `YAMLSeq`, not a plain array (same reason `wallIndexAtEdge`/
`holeIndexAt` elsewhere in this file use `.get(0)`/`.get(1)`), so the
comparison silently never matched and every "toggle" appended a duplicate
door instead of ever removing one. Caught by
`dungeonYaml.test.ts`'s own "adds a door, then removes it on a second
call" test failing with two identical door entries instead of zero — fixed
by matching the established `isSeq(c) && c.get(0) === ... && c.get(1) ===
...` pattern instead.

### Live verification

Own dev server (`vite --port 5181`, never `:3001`), driven via a
throwaway Playwright script (gitignored scratch pattern — this repo has
no blanket scratch-script gitignore rule the prior straight-walls round's
own script relied on, so the file was deleted after the run rather than
left in place). Board-space coordinates computed with the same ported hex
math as the original straight-walls unit's own script, converted to
screen pixels via the SVG's `getScreenCTM()` forward transform — the
exact inverse of `CreationBoard.tsx`'s own `toBoardPoint` — rather than a
hand-rolled linear viewBox/rect ratio, after the naive version's clicks
landed just outside the endpoint-handle's tight hit-test radius and
silently fell through to "draw a new wall" instead of selecting one (a
real bug in the VERIFICATION SCRIPT, caught by the wall count
incrementing when it shouldn't have — not a product bug).

- A multi-cell corner-anchored straight wall, drawn end to end, its
  footprint hatch spanning exactly the cells its line clips — confirmed
  live in both the rendered board and the live YAML pane
  (`wallLines: [ { from: { cell: [...], corner: N }, to: {...} } ]`, no
  `kind:` key).
- A second wall drawn sharing the FIRST wall's own `to` corner exactly —
  a clean, gapless L-join, Kirk's original red-lines picture, now at the
  corner lattice.
- A zoomed close-up on a wall's own endpoint showing it terminates
  EXACTLY at a hex corner — no hangover into the neighboring hex, the
  fix Kirk asked for, directly visible.
- Selecting a wall shows a real teal endpoint handle; dragging it shows
  the LIVE amber preview (updated footprint hatch included) while the
  pointer is still down, and after release the wall's endpoint moved to
  the new corner with the `wallLines:` COUNT unchanged (2, not 3) —
  confirming this is a real in-place endpoint edit, not a fall-through to
  drawing a new wall (the exact failure mode the verification script's
  own coordinate-mapping bug, above, produced before it was fixed).
- The Door tool: a click that doesn't land on a real footprint cell
  produces the honest reject toast ("doors can only open a cell the
  wall's own line actually blocks"), live, not just as a code path;
  a click that does land on one carves a real door — the YAML pane shows
  `doors: [ { cell: [...] } ]` on that line, and the rendered wall shows
  a genuine GAP in the solid stroke with an amber hinge dot, the flanking
  footprint cells still hatched, the door's own cell visibly NOT hatched.

No unexpected console errors — the only ones present are the established
FIXTURES-MODE `[unimplemented] unknown service
...AuthoringService` (no local `rpg-api` running against this dev
server), same as every prior round's live-verification note.

### Tests

16 new tests in `creation/hexCorner.test.ts` (every interior corner has
exactly 3 owners, verified directly; canonicalization picks the smallest
`[col,row]` — including the case where that ISN'T the cell you drew from;
every owner of one vertex canonicalizes to the identical answer;
canvas-boundary corners with fewer valid owners; `sameCorner` identity
across differently-chosen owners; corner/L continuity at the lattice
level; `nearestCorner` snapping, including off-canvas clamping; legacy
migration picks the direction-correct corner and is itself already
canonical). `creation/straightWallGeometry.test.ts` rewritten for corner
refs: the two new boundary cases this round exists to prove correct (a
segment that IS one cell's own true edge clips nothing; a segment ending
at a corner shared with OTHER cells clips only the cell it actually
threads through, not the ones merely touching that shared point) plus
door-exclusion footprint/crossing tests (a door cell removed from the
footprint, its own boundary crossings surfacing via the SAME (b)
mechanism), `footprintCellAtParam`/`wallLineDoorCellAt`/`isValidDoorCell`
coverage, and the corner-based `snapStraightEndpoint` axis lock — the
prior round's low-level `clipSegmentToShrunkHex`/`isCellClipped` epsilon
tests carry over unchanged (that math never needed to change). 15 new/
rewritten cases in `dungeonYaml.test.ts`'s `wallLines:` describe block
(`setWallLineEndpoint`/`toggleWallLineDoorAt` mutators including the
duplicate-door bug fix above; canonicalization on write; legacy migration
of both the endpoint shape and the whole-line `kind: door` shape; the
CST-untouched-until-mutated migration behavior, both directions).
221 dungeon-builder tests passing overall (up from 196). `ci-check`
clean (format/lint/typecheck/build/test).

### Polish addendum: angle snapping + region-edit discoverability (same day, on this branch)

Two more items of Kirk's live feedback on the round above, closed without
a new ledger section.

**Angle snapping.** Kirk: "aaahhh my line was angled ever so slightly" —
an unintentionally off-axis wall clipped a halo of cells at their points.
The straight-wall draw used to force EVERY drag onto one of only 2 axes
(`pickStraightAxis`'s old vertical/horizontal split, no tolerance, no
bypass) — and the endpoint-drag fine-tuning from the round above had NO
axis awareness at all (`nearestCorner`, literally the closest lattice
point), which is almost certainly the actual source of the "angled ever
so slightly" line: a fine-tune drag snapping to the nearest corner rather
than the nearest ON-AXIS corner. Replaced both with one shared mechanism
(`straightWallGeometry.ts`'s `nearestWallAngleFamily`/
`WALL_ANGLE_FAMILIES_DEG`): the 3 REAL hex-edge orientations (30°/90°/150°
— not the old horizontal axis, which never matched a real edge at all,
see this file's own header comment) become the default snap targets, but
only within `WALL_ANGLE_SNAP_TOLERANCE_DEG` (6°, the middle of Kirk's own
"~5-8°" range) of the raw drag direction — outside that, the draw stays a
genuinely free angle (falls through to plain `nearestCorner`) rather than
being forced onto a family it was never aimed at. Holding **Alt** bypasses
snapping entirely for the whole drag (checked live via `e.altKey` on every
pointer-move, not just decided once — releasing Alt mid-drag lets a real
family lock in from wherever the drag is aimed at that point); Alt, not
Shift, because Shift is already the region tool's own eraser modifier.
Applied to BOTH the initial draw (`straightStroke`'s new `lockedFamily`/
`snapped` fields, decided once past the existing direction-lock threshold,
same shape as the zigzag tool's own `family`) and the endpoint-drag
fine-tune (`draggingEndpoint`'s own `snapped` field, recomputed fresh
every move since the line's OTHER endpoint is already fixed and gives a
stable reference immediately, unlike a brand-new stroke's noisy first
few pixels). Snapped state is subtly visible per Kirk's own ask: a locked
preview renders solid and full-opacity bright amber
(`straightWallLineElements`'s new `snapped` parameter); an unsnapped one
keeps the tool's original dashed, dimmer amber — no visual regression to
the free-angle case, only an ADDED treatment for the locked one.

**A real test-script trap, worth recording**: the live-verification
script's first attempt at proving this (`game-dev/tools/browser/
_job_wallpolish_verify.mjs`) used "same column, different row" as its
"obviously vertical" test pair — WRONG on this coordinate system, where
`hexRow`'s parity correction means worldX drifts with row even at a fixed
column (verified by directly computing both cells' `cellCenter`). The
actual verified-vertical pairs are `(col+2,row-3)`-style deltas (derived
algebraically from `hexRow`'s own formula, and empirically the SAME pair
CONTRACT.md's own "straight walls" round above used:
`[4,4]`→`[6,1]`). A second trap on top of that: a small nudge (10-32 board
units) off a genuinely vertical pair sometimes committed to the exact same
corner regardless of whether snapping was engaged, because the corner
LATTICE itself is coarser than the nudge in that direction — an
inconclusive test, not a bug. Fixed by using a longer (3-step chained) span and
a deliberately large (120-unit) nudge for the free-angle case specifically
— large enough to force the nearest-corner search off the vertical corner
regardless, cleanly isolating "Alt genuinely bypasses" from "the lattice
just wasn't fine enough to move." A third, unrelated trap in the SAME
script: clicking near column 15 at this viewport size lands past the
board SVG's own visible edge, on the sibling YAML textarea instead
(`document.elementFromPoint` confirmed it directly) — region-cell clicks
in the verification script were kept at columns ≤2 after that.

**Region-edit discoverability.** Kirk: "is there a way to add the region
after we create it?" The capability already existed (Region tool + click
an existing region selects it; paint adds, Shift-drag removes) but was
never surfaced, AND — the likely actual root cause — creating the FIRST
region ever authored (no earlier region to offer a "connect" callout for)
left `RegionPanel.tsx` rendering `null` outright: `justCreatedId` stayed
set (only cleared by selecting/deleting/connecting), the callout's own
`if (created && prev)` had no `prev` and no `else`, and the old
"nothing pending/selected" branch's `!justCreatedId` guard skipped its own
render too — a genuine dead end, not just an undiscoverable feature.
Fixed by precomputing `showConnectCallout` (true only when a real `prev`
exists) and gating BOTH branches on it instead of on `justCreatedId`
directly, so the "nothing pending, nothing selected, nothing to connect"
case now falls through to a NEW compact region list (name/archetype/cell
count, click-to-select) instead of rendering nothing — the "region list"
the callout's own copy, dating back to the original region-authoring
unit ("Use the region list to connect any two regions manually once more
exist"), already promised but never actually shipped. When a region IS selected, the status hint text
now matches Kirk's own wording closely: "editing `<name>` — paint to add,
⇧ drag to remove, Esc to deselect (`N` cells)." Esc actually deselecting
was missing entirely — added as a keydown effect mirroring the existing
Delete/Backspace-on-selected-wall pattern (same TEXTAREA/INPUT-target
guard), also clearing an in-progress pending paint when nothing is
selected yet.

**Tests.** 6 net new in `straightWallGeometry.test.ts`: `pickStraightAxis`'s
old 2-case describe block replaced by `nearestWallAngleFamily` (7 cases —
each of the 3 families, direction-agnosticism, the tolerance boundary on
both sides, the former "horizontal" axis now correctly staying free, a
zero-length vector); `snapStraightEndpoint`'s existing 2 cases updated for
the numeric `WallAxisFamily` type plus 1 new case for the `axis: null`
free-angle path matching `nearestCorner` exactly. 227 dungeon-builder
tests passing overall (up from 221). `ci-check` clean (format/lint/
typecheck/build/test) — a first pass caught a `npm run format` diff on
both touched files (pure Prettier line-wrap, no semantic change).

**Live verification.** Own dev server (`vite --port 5182`, never `:3001`),
driven via `game-dev/tools/browser/_job_wallpolish_verify.mjs` (kept, per
this repo's `/tools/browser/_job_*.mjs` gitignore convention — unlike
rpg-dnd5e-web's own scripts, this one didn't need deleting after the run).
A near-miss drag (~4° off a verified-vertical `[2,9]`→`[8,0]`-style span)
committed to an EXACTLY vertical wallLine (`from`/`to` corner points'
world X matching to floating-point precision) with a solid bright preview
mid-drag; the same drag with Alt held and a much larger (120-unit) nudge
committed to a visibly different, non-vertical endpoint (world X differing
by ~104 board units) with a dashed dimmer preview mid-drag — both
screenshotted mid-gesture, not just asserted from the final YAML. For
regions: painting a first-ever region then deselecting showed the NEW
compact list (`region list shows created region: true`), clicking the
list entry showed the exact hint text ("editing Hint Check Vault — paint
to add, ⇧ drag to remove, Esc to deselect (4 cells)."), and Esc correctly
returned to the list. No unexpected console errors — only the established
FIXTURES-MODE `[unimplemented] unknown service ...AuthoringService` (no
local `rpg-api` running against this dev server), same as every prior
round's live-verification note.

**Straight-wall deletion (same-day third item).** Kirk: "gonna need a way
to delete a wall — I dragged it again and had a small section with no way
to remove it." The removal MUTATOR already existed
(`dungeonYaml.ts`'s `removeWallLineAt`) and was already wired to a
Delete/Backspace keydown effect on a selected wall (the round above) —
what was genuinely missing was any VISIBLE affordance telling the author
either of those existed. Added a small red "×" delete button, rendered
offset perpendicular from the selected wall's own midpoint by 16 board
units (`CreationBoard.tsx`'s new `straightWallDeleteButtonPoint`/
`straightWallDeleteButtonHit`, the same render/hit-test split every other
board overlay here already follows) so it clears the drawn stroke/
footprint hatch instead of sitting on top of it. A caption under the
button reads "delete" — or "delete (+N door(s))" when the wall has any,
since `removeWallLineAt` splices the whole `wallLines:` entry (doors
nested inside), so they're removed too, not orphaned. Clicking it calls
the SAME `onRemoveStraightWallAt` the keyboard path already used; no new
removal logic, only the missing UI path to it. Checked in
`handlePointerDown` right after the endpoint-handle hit (a handle grab
still wins if the two ever overlap) and before the redraw/reselect
fallback.

**Tests.** 1 new in `dungeonYaml.test.ts`: `removeWallLineAt` removes
EXACTLY the targeted line (a second line survives untouched, verified by
value not just by count) and its own door goes with it, round-tripped
through the serialized YAML text (no stranded `doors:` fragment). 228
dungeon-builder tests passing overall (up from 227). `ci-check` clean —
again caught (and fixed) a pure-Prettier format diff on the touched file,
no semantic change.

**Live verification.** Own dev server (`vite --port 5183`), driven via
`game-dev/tools/browser/_job_walldelete_verify.mjs` (kept). Same trap as
the angle-snapping script above, hit again here and worth restating since
it's a general one: click targets computed from the RAW cell centers a
drag started/ended at are wrong for anything that needs the wall's own
ACTUAL `from`/`to` — those are corner-anchored and snap to the nearest
LATTICE CORNER, often offset from a cell's own center by up to a full hex
radius. Fixed by reading the real committed `from`/`to` back out of the
live YAML pane after each mutation and computing every subsequent click
(select, delete-button) from THOSE, not the original nominal drag
targets — the delete-button click silently landed on nothing until this
was fixed. Confirmed: a selected wall (with a rejected off-footprint door
click still visible as a live toast, incidentally re-confirming that
existing reject-toast behavior too) shows both teal endpoint handles and
the new delete button with its "delete" caption; clicking the button
takes `wallLines:` from 1 entry to `[]` and the footprint hatch off the
board entirely (before/after screenshots, not just the final YAML); a
second wall drawn, selected, and removed via the Delete key confirms that
path is still intact too. No unexpected console errors, same
FIXTURES-MODE note as every other round.

## Wire-edges rendering unit: 2D + 3D now draw `FloorPlan.edges` (2026-08-04, rpg-project#169)

**The fourth-consumer-signal gap this file has named four times over —
"`FloorPlan` carries no wall/door edge geometry on the wire" — is now
closed on the response side.** rpg-api's #767 wave (merged) projects
toolkit-canonical generated edges onto the compiled authoring `FloorPlan`:
`repeated FloorPlanEdge edges = 6`, each `{from, to, kind, door_id}`
(`FloorPlanCell` pairs, `FloorPlanEdgeKind` SOLID|DOOR), released in
rpg-api-protos **v0.1.118** (bumped from v0.1.115 this unit). Both boards
now render THAT truth when a response carries it, instead of the
door_row/connector-derived approximations this file has documented since
#667 — the WallGashExplainer's own former claim ("FloorPlan carries no
wall/door edge geometry on the wire") is retired for a live response;
fixtures mode and any pre-#767 recording still hit that path unchanged
(a real, honest fallback, not a removed one).

### One shared adapter, not two proto parses

`edgesAdapter.ts` (new module) is the single place either renderer
touches the wire shape: `floorPlanEdgesToServerEdges(floorPlan)` maps
`FloorPlanEdge[]` to `ServerEdge[]` — `dungeonYaml.ts`'s existing
`WallDoc` (`{from, to, kind}`, the SAME shape `doc.walls`'s own
target-dialect authored walls already use) plus an optional `doorId`.
Neither `Board.tsx` nor `DungeonPreview3D.tsx` imports
`FloorPlanCell`/`FloorPlanEdgeKind` directly — this is a pure field-
rename/enum-map, never a re-derivation: `FloorPlan.edges` is already the
server's own canonical, deduplicated truth (one record per physical
edge), so there's no orientation/dedup logic to reimplement client-side,
unlike `doc.walls`'s own author-time mutators. `hasServerEdges(floorPlan)`
(`edges.length > 0`) is the one gate both views check.

### `door_id` correlates to `FloorPlanConnector` — verified against a real response, not assumed

Confirmed directly (`fixtures.ts`'s re-recorded `SHOWCASE_FLOORPLAN`, not
just the proto doc comment's promise): both DOOR edges' `doorId` match
`SHOWCASE_FLOORPLAN.connectors[].doorId` byte-for-byte
(`showcase-door-antechamber-shrine`, `showcase-door-shrine-vault`).
`connectorIndexForDoorId(floorPlan, doorId)` resolves this to the same
index `doc.connectors`/`ConnectorInspector` already key off, so a
server-truth door is directly wired to the REAL `ConnectorInspector` —
Kirk's "I clicked where a wall visibly is and found nothing behind it"
ask, now answered by the wall's own rendered geometry in BOTH views, not
just the coarse cell/gap-column underneath it.

### 2D board (`Board.tsx`)

A new server-edges overlay pass (`edgeBetweenCells`, the SAME geometry
`doc.walls`'s own overlay already draws with) renders every recorded edge
as a solid, confident line — `'#c9bfae'` for SOLID, `'#ffb347'` for DOOR
— painted BEFORE `doc.walls`'s own dashed/muted "PROPOSED, not compiled"
pass so an authored wall drawn over a real one still reads on top. The
connector-gap-column cell fill (`db-cell-wall`, the old whole-column
"this is a wall" block) is MUTED to plain background whenever real edges
exist, rather than removed outright — the door-row cell itself (still the
real, always-correct connector click target) is untouched either way.
**Source indicator**: a small badge, top-left of the board —
`WALLS: SERVER EDGES (196)` (cream) when real, `WALLS: DERIVED (no edge
geometry on the wire)` (dashed amber) for the fallback — so drift between
a stale-pinned client and a fresh server (or the reverse) is visible, not
silent. A DOOR line whose `doorId` resolves is directly clickable
(`pointerEvents: 'stroke'`) and calls the SAME `onSelectConnector` the
door-row cell already used.

### 3D preview (`DungeonPreview3D.tsx`) — the door gap is the headline

**This closes the "marked door, not a walkable door" gap** the original
3D spike named as its own next fidelity step (this file's earlier "3D
preview: NOT a stop" section): `WallBox` now renders solid edges only
(full height, no more per-door height-shortening hack); a new `DoorGap`
component renders a DOOR edge (server-truth OR an authored `doc.walls`
door — both go through the same branch now) as two solid amber jambs
flanking a genuinely OPEN, walkable span, with a thin amber lintel piece
reading as a door frame. Kirk's own framing for the door-row VOID finding
elsewhere in this file: "the gash becomes a real doorway." Server-truth
walls (`serverWalls`, gated on `hasServerEdges`) render alongside the
existing `authoredWalls` (`doc.walls`) — additive, not a replacement,
since 3D never had ANY server-truth wall rendering before this unit (the
spike's own doc comment: "Deliberately NOT rendered: walls and doors").
A server-truth door's jamb/lintel group also gets an invisible click-
catcher spanning the opening (`onSelectConnector`, same wire-level
`doorId` correlation as 2D) — same `ConnectorInspector`, reachable by
clicking the actual rendered doorway in 3D now too.

### Tests + fixture

`SHOWCASE_FLOORPLAN.edges` (`fixtures.ts`) is a REAL recorded response,
not synthesized: `grpcurl PutDungeon(validate_only)` against the live
rpg-api-protos v0.1.118 server for showcase.yaml, unmodified — 196 edges
(194 solid, 2 door), including exterior edges whose far endpoint sits
outside the rendered bounds (negative column — `FloorPlanEdge`'s own doc
comment: "one endpoint may be outside the rendered floor-plan bounds"),
confirmed live, not just read in the contract text.
`floorPlanCompile.test.ts`'s showcase case now excludes `edges` from its
equality check with an explicit comment — `compileFloorPlanLocally` (the
fixtures-mode fallback) never re-derives generated wall/door truth
client-side, by design, so its own `edges` stays the proto default `[]`.

12 new tests in `edgesAdapter.test.ts` (adapter correctness, doorId
mapping, exterior-edge preservation, connector-index resolution — all
against the real recorded fixture, not a hand-built one) + 3 new in
`Board.test.tsx` (badge text + line count for both the real-edges and
derived-fallback cases, and door-line-click → `onSelectConnector`
wiring). 253 dungeon-builder tests passing overall (up from 238).
`ci-check` clean (format/lint/typecheck/build/test).

**Live verification.** Own dev server (free port, `VITE_API_HOST` pointed
at the live envoy on `:8091`, `VITE_DEV_PLAYER_ID` set for the `Dev`
auth scheme), driven via a throwaway Playwright script (this round's
`public/models/synty/` was rsync'd from the existing `~/game-dev/
rpg-game-assets` checkout the same way the palette-thumbnail round
already documented, since a fresh worktree never has it — needed for the
3D screenshot only, the 2D verification doesn't touch GLBs at all).
Confirmed: the 2D board's badge reads `WALLS: SERVER EDGES (196)` against
the live `showcase` response, with the room perimeter now visibly
outlined (previously only the inter-room gap column read as "wall" at
all — the perimeter was never drawn). Clicking the rendered
antechamber↔shrine door line opened the real `ConnectorInspector`
("Door: antechamber ↔ shrine") — the SAME panel the door-row cell already
opens, now reachable from the wall's own geometry too. The 3D preview
(Chromium + `--use-gl=swiftshader` for headless WebGL) shows the full
room perimeter as solid gray wall boxes with two amber door
jamb/lintel breaks at the real connector positions — a visible gap in the
wall run, not a shortened box. No unexpected console errors past the
existing FIXTURES-MODE-adjacent ones this file already documents (the
probe's own deliberately-invalid payload, doubled by StrictMode).

## Capability-probed graduation: strip/badges/Save & Play stop guessing (2026-08-04, rpg-project#169)

**The trigger, verbatim:** the wire-edges unit above closed the
RESPONSE-side wall-geometry gap this file named four times over. Days
later, the coordinating session verified LIVE against
`rpg-api-dungeon-builder-763` that authored `walls:` — the AUTHORING side
— now compiles too (`success: true`), while the client still stripped it
unconditionally and creation mode's Save & Play stayed hard-disabled with
a blanket "the server can't compile this yet" tooltip. The strip list,
compile badges, and Save & Play gate had been reading a hardcoded,
comment-level snapshot of "what dungeonspec compiles" since the concept's
earliest days — a snapshot that cannot self-correct when the server moves
out from under it. This unit replaces the snapshot with a live probe.

### The mechanism: `capabilityProbe.ts`

New module. On every live connection (`usePutDungeonPreview.ts`'s own
mount-time liveness probe finding `serverState === 'live'`), the concept
now sends one minimal `validate_only` document per target-dialect field —
17 fields total, each isolated against an otherwise-known-good 3-room
base (see below for why 3, not 2) — and records exactly what THIS server
said about THIS field, today, in `ServerCapabilities`. Concurrent
(`Promise.all`), never blocks the board, cached until the next live
transition or an explicit `refreshCapabilities()`.

**Real finding, not assumed: dungeonspec's own decode is whole-document
and strict**, so a naive "send everything, see what fails" probe can only
ever answer "at least one of these isn't accepted," never which — this is
WHY the probe is per-field, verified by actually trying the combined
approach first and reading the batched `"field X not found"` /
`"field Y not found"` error list `canvas-full.yaml`'s probe produced.

**A real, load-bearing finding from BUILDING the probe suite, documented
nowhere in this file before now**: the very first minimal 2-room base
doc, otherwise pure v1, was rejected outright —
`"dungeon must have exactly one boss room, found 0"`. Two rooms alone
(dungeonspec's known `minRooms = 2`) is not sufficient; the chain also
needs EXACTLY ONE boss-archetype room with a declared `boss:`, a
CHAIN-level constraint distinct from the boss-archetype-room-needs-a-boss
rule this file already documented. `stripToV1Subset`'s
`compilable`/`compilableBlockers` now check both.

**Verified live, 2026-08-04, against `rpg-api-dungeon-builder-763` (envoy
`localhost:8091`)** — the transcript `capabilityProbe.ts`'s own doc
comment carries in full:

| Field                                                                                                         | Result                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `walls:`                                                                                                      | **compiles**                                                                                          |
| `start:`                                                                                                      | **compiles**                                                                                          |
| `facing` (room-scoped floor prop only)                                                                        | **compiles**                                                                                          |
| `holes:`, `end:`, `canvas:`, `lighting:`, `defaults:`, `regions:`, `height:`, `rotate_degrees:`, `targeting:` | decode-unknown (`"field X not found in type dungeonspec.Y"`)                                          |
| `mount:` (any placement)                                                                                      | schema-known, rejected (`"unsupported capability: mounted placements are not supported"`)             |
| `facing` (monster/boss/`mount:wall`)                                                                          | schema-known, rejected (`"unsupported capability: facing only supported on room-scoped floor props"`) |
| top-level `place:`                                                                                            | schema-known, rejected (`"unsupported capability: top-level placement is not supported"`)             |

3 of 17. Two rejection SHAPES, kept distinct rather than collapsed:
decode-unknown (the Go struct has no field for this key at all) vs.
schema-known-but-capability-gated (`"unsupported capability: ..."` — the
field decodes, the constraint is deliberate and named). `wallLines:` is
deliberately NEVER probed — client-side sugar
(`straightWallGeometry.ts`), never sent to the real server in any form,
per its own doc comment.

### `stripToV1Subset` becomes capability-aware, not a rewrite

`dungeonYaml.ts`'s `stripToV1Subset` gained an optional `capabilities`
parameter and two new `V1SubsetResult` fields: `compiling` (the positive
mirror of `dropped` — present AND accepted, kept verbatim) and
`compilableBlockers` (human-readable reasons `compilable` is false, e.g.
`"needs exactly one boss-archetype room with a declared boss (has
none)"`, not one hardcoded message). Every existing strip DECISION now
asks `accepted(field)` first; the mechanics (CST deletes, counting) are
unchanged. `start`/`end` split into independent checks (verified live:
one compiles, the other doesn't — the prior combined `"start/end"` entry
could never have expressed that). `facing` dispatches through
`facingCapabilityFor` — per-PLACEMENT, not per-document, since the real
server itself distinguishes floor-prop/monster/boss/wall-mount facing.
`defaults:`, when accepted, skips materialize-on-strip entirely (nothing
to bake in — the server resolves inheritance itself). No `capabilities`
argument (fixtures mode, or a probe not yet complete) reproduces the
PRIOR static behavior exactly — verified by the existing 253-test suite
passing unmodified bar one wording change (`'start/end'` → separate
`'start'`/`'end'` entries, the direct consequence of the split above).

`buildWalkItYaml` (Walk it) gained the same optional parameter — a real,
pre-existing gap this unit fixed along the way: Walk it never called
`stripToV1Subset` at ALL before this unit, so a document using any
target-dialect field would have failed Walk it's own save outright,
regardless of server capability. It now runs the capability-aware strip
FIRST, monster-stripping on the result.

### Badges and gating read the probe, nothing hardcoded

`YamlPane.tsx` gained `CapabilitiesLine` (the "server capabilities:
accepts N/M dialect fields" readout, with its own `refresh` affordance,
beside the LIVE badge) and split `CompileBadgeStrip` into two halves — a
teal "Compiles on this server: ..." confirming line and the original
amber "Uses: ... not yet accepted" line — reading `compiling`/`dropped`
directly, never a hardcoded field list. The Save & Play button was
extracted into `SaveAndPlayButton` (exported) specifically so it could be
reused verbatim, not re-implemented, by creation mode — see below. Its
disabled tooltip now reads `v1CompilableBlockers` when non-compilable,
naming the SPECIFIC real reason, instead of one hardcoded "declare at
least 2 rooms" message that was already wrong the moment a boss-room
requirement existed unstated.

### Creation mode's Save & Play graduates from permanently-disabled to real

`ProposedYamlPane.tsx` — previously a `disabled` button with a hardcoded
`title`, no props to ever change it — now imports and reuses
`SaveAndPlayButton`/`CompileBadgeStrip`/`CapabilitiesLine` from
`YamlPane.tsx` directly (one gating implementation, not two that could
drift) and gets a real `useSaveDungeon` instance
(`DungeonBuilderConcept.tsx`'s new `creationSave`), wired through
`CreationConcept.tsx`. **Reuses `preview.capabilities` from edit mode's
existing `usePutDungeonPreview` instance** rather than probing twice —
capabilities describe the SERVER, not which document is being viewed.

**Why the button still reads disabled in practice, today, verified
live**: creation mode has no "declare a room" UI at all
(`emptyCanvasDoc.ts`'s `rooms: []` is the only shape it ever produces),
and the real "at least 2 rooms, exactly one boss room" minimums are
unconditional — so a from-scratch canvas is still genuinely unsavable.
But the tooltip is now the REAL reason (`"needs at least 2 rooms (has
0); needs exactly one boss-archetype room with a declared boss (has
none)"`), not the retired blanket "proposed schema" claim — and an
author who hand-types `rooms:` into this very pane (it's a real, editable
CST) would see the button light up the moment the document becomes
genuinely compilable, same as edit mode, no code change required.

### Live verification — past the badges' own claim, same standard as every prior round

Own dev server, free port (`5173`, never `3001`), `VITE_API_HOST` pointed
at the live envoy (`:8091`), driven by a throwaway Playwright script
(this file's own established pattern). Confirmed, in order:

1. `● LIVE — PutDungeon reachable`, then `server capabilities: accepts
3/17 dialect fields` — the exact live probe result above, rendered.
2. Edited showcase.yaml's live YAML pane to add one `walls:` entry via
   the real textarea + "Apply YAML → Board" (not a mocked test) — the
   badge strip immediately showed `Compiles on this server: 1 wall`,
   never the amber "not yet accepted" line.
3. Clicked the real "Save & Play" button (enabled — `dialectDropped` was
   EMPTY since the wall compiles, so the label correctly stayed "Save &
   Play," not "Save the compilable subset," even though a target-dialect
   field is present) against the SAME lab server — got
   `Saved as "showcase".` — a real `PutDungeon(validate_only: false)`,
   walls included, not a client-side claim.
4. Switched to New Dungeon (creation mode) — `ProposedYamlPane` showed
   the SAME live `server capabilities: accepts 3/17` line, the amber
   `Uses: canvas — not yet accepted by this server` badge, and "Save the
   compilable subset" correctly disabled with the tooltip:
   `"Nothing compilable yet — needs at least 2 rooms (has 0); needs
exactly one boss-archetype room with a declared boss (has none)"` —
   the specific real reason this unit set out to deliver, not the
   retired "proposed schema" placeholder.

No unexpected console errors — only the two expected
`[invalid_argument] key "" must match ...` entries from
`usePutDungeonPreview`'s OWN deliberately-invalid liveness-probe payload
(doubled by React StrictMode, same benign noise this file's every prior
live-verification round documents).

**Housekeeping**: step 3 above genuinely persisted an extra wall onto the
SHARED `showcase` key on the lab container other in-flight units on this
same wave also read from — restored it to the exact original
`SHOWCASE_YAML` fixture content via a follow-up `PutDungeon(validate_only:
false)` immediately after, verified `success: true`. The save-then-
restore round trip is itself corroborating evidence the write path is
real (a client-side-only claim couldn't have needed reverting).
Screenshots: `docs/evidence/dungeon-builder-capability-probe-{edit-mode-badge,
walls-compiling,walls-saved,creation-mode-specific-tooltip}.png`.

### Tests

`capabilityProbe.test.ts` (new, 6 tests) — probe/classify logic against a
mocked `authoringClient.putDungeon`, keying responses off each probe's
own distinct `capprobe-<field>` request key: blanket-accept, blanket-
reject-with-verbatim-message, mixed per-field, a transport failure on one
probe not taking down the suite, every probe declaring `validateOnly:
true`. `dungeonYaml.test.ts` gained a
`stripToV1Subset: capability-aware` describe block (13 tests) covering:
an accepted field surviving verbatim vs. the no-capabilities conservative
fallback, the independent start/end split, facing gated per PLACEMENT
(a floor prop and a monster in the SAME document, only one keeps facing),
wall-mount facing as its own independent capability, an accepted
`defaults:` skipping materialize-on-strip, an accepted `topLevelPlace`
staying un-mapped (with its own items still individually field-gated),
canvas/holes/regions/lighting each compiling independently, and the new
`compilableBlockers` correctness (room-count blocker, the newly-
discovered boss-room blocker, both real fixtures with neither).
`usePutDungeonPreview.test.ts` gained 4 tests: capabilities stay `null`
outside live, populate once live (reflecting every probe response),
reset to `null` the instant the server stops being live, and
`refreshCapabilities()` re-running the suite. `YamlPane.test.tsx` (new) —
the first render-layer test for `SaveAndPlayButton`/`CompileBadgeStrip`/
`CapabilitiesLine`, 12 tests covering every gating state named in this
unit's own brief: enabled+dropped-list, disabled+SPECIFIC blocker
(asserting the old hardcoded "declare 2 rooms" text does NOT appear),
the generic-fallback path when no blocker is supplied, mid-save, and the
creation-mode label override. No jest-dom matchers (this repo's vitest
config has none configured) — plain DOM properties throughout, matching
`Board.test.tsx`'s own established convention. 287 dungeon-builder tests
passing overall (up from 253), `ci-check` clean.

### `TARGET-YAML.md` — status tracking rewritten around the probe, not hand-maintained

The "Status tracking note (2026-08-03): two fields now compile on Kirk's
branch, unreleased" section — a manually-transcribed snapshot of a
backend-probe comment, with its own explicit "don't flip the badge based
on this note alone" caveat — is retired. Replaced with a description of
the MECHANISM (`capabilityProbe.ts`) and what it found on THIS unit's own
2026-08-04 observation, framed explicitly as one observation of a live
check, not a claim to keep in sync by hand going forward. The "place:/
boss: facing" entry-type table is retained (still accurate) but
re-pointed at the mechanized check. The v1-subset-strip table gained a
second column contrasting the no-capabilities/with-capabilities
behavior. `specimens/kitchen-sink.v1-subset.dropped.json` regenerated
(no version bump — `kitchen-sink.yaml` itself is byte-identical; only
`stripToV1Subset`'s report shape changed: `start`/`end` now separate
entries, plus the new empty `compiling`/`compilableBlockers` fields) —
`specimens/README.md`'s changelog documents why without a pack-version
bump, since no new emittable construct was added.

### What did NOT ship this round — named, not silently dropped

- **Inspector.tsx's own `FacingConservativeBadge`/`TargetDialectBadge`
  are NOT wired to `capabilityProbe.ts`.** Out of scope per this unit's
  own brief (strip/save/badge/probe subsystem, not the Inspector) —
  `dungeonYaml.ts`'s new `facingCapabilityFor` already encodes the
  entry-type dispatch once; whoever picks this up next should read that
  function first, not re-derive the split.
- **No creation-mode "Walk it" button** — one was never asked for by
  this unit's brief; creation mode's ONLY existing save action (Save &
  Play) graduated. Adding Walk it to creation mode is a real scope
  expansion, not a gap in this round.
- **`/author` route promotion is explicitly the NEXT unit**, per this
  unit's own brief — not attempted here.
- **No `preview3d`/floor-derivation changes** — explicit scope boundary
  from this unit's brief, respected; a parallel unit was in flight on
  that surface concurrently.

## Creation-mode 3D preview unit: "can I go from new dungeon to 3D?" (2026-08-04, rpg-project#169)

Kirk's ask, verbatim: "can I go from new dungeon to 3d?" — the 3D preview
spike above was edit-mode-only from the start (its own header doc
comment: "it needs a real compiled floor plan to exist [...] creation
mode's proposed schema has no `FloorPlan` at all"). This unit gives
creation mode the same 2D/3D toggle, without inventing a second compiled
response to feed it.

### The floor problem, and the settled semantic

A from-scratch canvas genuinely has nothing to derive a floor from — no
`FloorPlan`, no server round-trip at all. New module,
`creation/canvasFloor.ts`'s `deriveCanvasFloorCells(doc)`: every
`[col,row]` cell inside `doc.canvas`'s bounds (falling back to
`DEFAULT_CANVAS`, matching `CreationBoard.tsx`'s own fallback), minus
`doc.holes`. Recorded as a real dialect note, not left as an
implementation detail — TARGET-YAML.md's `canvas:` section now says so
explicitly, including the one deliberate non-obvious call: a
`walls:`/`wallLines:` footprint cell is **blocked, not floorless** (Kirk's
own rule — "any hex that is not 100% uncovered would not be
traversable"), so it still gets a floor tile, just a flagged one — the
exact same "flag, don't silently remove" discipline the 2D board's own
footprint/region-overlap checks already follow.

### `DungeonPreview3D`: an alternate input path, not a fork

The brief's own instruction was reuse, not a copy: `DungeonPreview3D.tsx`
grew a `floorCells?: readonly [number, number][]` prop alongside the
existing `floorPlan?: FloorPlan` (now optional, was required).
`buildFloorTiles` picks whichever is supplied — `floorCells` wins if both
somehow are, though the two real callers today never combine them (edit
mode passes `floorPlan` only; creation mode passes `floorCells` only).
Every `floorPlan`-only feature degrades to "doesn't render" rather than
throwing when it's absent, verified one at a time rather than assumed:

- **Server-truth wall/door edges** (`hasServerEdges`/
  `floorPlanEdgesToServerEdges`) — gated on `floorPlan` being present;
  empty otherwise, same as the existing fixtures-mode fallback.
- **The generator-chosen entrance marker** — has no creation-mode analog
  at all (this file's own long-standing "Start/end: authored, in real
  tension with the generator-chosen entrance" finding: a freeform canvas
  has no generator to choose FOR the author) — simply doesn't render
  without `floorPlan`, which is the CORRECT behavior, not a gap.
- **Room-scoped `place:`/`boss:`** — the loop that resolves them via
  `floorPlan.rooms.find(...)` is skipped entirely without `floorPlan`;
  in practice this was ALREADY a no-op in creation mode even before this
  unit, since a from-scratch canvas's `doc.rooms` is always `[]`
  (`creation/emptyCanvasDoc.ts`) — the guard just keeps the function
  honestly typed for `FloorPlan | undefined` rather than asserting
  non-null.
- **Click-to-place** — deliberately NOT wired for creation-mode 3D this
  round (see "Read-only this round," below); `placeableCells` is empty
  without `floorPlan`, so no `FloorHitCell` mounts at all — the whole
  interaction surface is absent, not half-built.

Everything doc-native — `doc.walls`, `doc.holes`, `doc.place` (top-level),
`doc.start`/`doc.end` — needed ZERO changes; these already had no
`floorPlan` dependency and were verified live to "just work" once
`floorCells` supplied a floor to render them against (see "Live
verification," below).

### Two doc-native overlays, new to 3D, driven purely by `doc` (render in EITHER mode)

- **Straight-wall (`doc.wallLines`) footprint, dimmed rather than
  omitted** — the 3D sibling of the 2D board's crimson footprint hatch.
  `buildWallLineFootprint(doc)` reuses `creation/straightWallGeometry.ts`'s
  own `straightWallsFootprintSet` (the SAME function `CreationBoard.tsx`'s
  2D overlay calls) rather than re-deriving the clip math a second time —
  a flat semi-transparent crimson disc per footprint cell, cheap by
  construction (skipped entirely when `doc.wallLines` is empty).
- **Region (`doc.regions`) membership tint + floating label** — a
  translucent `regionArchetypeColor`-tinted disc per member cell (same
  archetype color the 2D board's read-only overlay already uses) plus a
  `Billboard`+`Text` label at the region's centroid — the SAME
  `Billboard`/`Text` primitive `AuthorGridOverlay.tsx` already uses for
  the real game's author-grid labels, not a new one. "If cheap" from the
  brief turned out cheap: both overlays are the identical flat-hex-mesh
  shape `FloorHitCell`'s own click-hit layer already uses, just a
  different Y offset/color/opacity, no new geometry primitive.

**Deliberately NOT attempted this round**: full 3D geometry for a
straight wall's own LINE (matching its corner-anchored, door-gapped
fidelity in 2D — jambs, lintel, a real walkable opening). The brief's own
scope was the floor treatment ("render their floor but visually distinct
if cheap"), not a second wall-box renderer; `doc.walls` (the OTHER,
edge-native wall representation) already renders in 3D via the existing
`WallBox`/`DoorGap` path with zero changes needed, so creation mode is
not wall-blind in 3D — only `wallLines:`'s own straight-line geometry
stays 2D-only. Named here as a real follow-up, not silently deferred.

### The toggle: same idiom, independent state, reused per-mode discipline

Creation mode's header grows the identical `role="group" aria-label="2D
or 3D board"` control edit mode's own header already has — not a second
one invented for this mode. State ownership follows the EXACT precedent
this file's "Collapsible side panels" section already set for the
palette/YAML collapse pairs: owned by `DungeonBuilderConcept` (never
unmounts across an edit↔create tab switch) as its own independent
`createBoardDim` flag, not shared with edit mode's `boardDim` and not
local `useState` inside `CreationConcept` (which DOES unmount whenever
`mode` leaves `'create'`, so local state there would reset on every tab
return). `CreationConcept`'s own `<main>` now mirrors edit mode's
exact 2D/3D branch structure (an outer `overflow: hidden` flex column,
an inner `overflow: auto` div for the SVG board vs. a padding-free
`minHeight: 0` div for the R3F canvas) rather than inventing a second
layout shape.

### Read-only this round, by omission not by a new flag

The creation-mode `<DungeonPreview3D>` call site passes only
`floorCells`/`doc` — `selectedPlacement`/`onSelect`/`selectedPalette`/
`onPlace`/`onReject`/`onSelectConnector` are all left unwired. Every one
of those props was already optional, independently degrading to
view-only per its own doc comment (written for exactly this kind of
caller) — so "read-only" needed no new prop, no `readOnly` flag, just
omission. Click-to-place in 3D graduating from edit mode to creation mode
is named as a real follow-up (the brief's own framing), not attempted
here.

### Live verification

Real dev server (`vite --port 5190`, never `:3001`), driven via a
throwaway Playwright script (gitignored scratch pattern, deleted after
the run — this repo has no blanket scratch-script gitignore rule, same
situation the corner-anchored-walls unit's own script hit). `public/
models/synty` rsync'd from the existing `~/game-dev/rpg-game-assets`
checkout (same provenance the palette-thumbnail round documented) since a
fresh worktree never has it.

Built a real "New Dungeon" document by driving the ACTUAL app, not by
hand-authoring a fixture: clicked "Play the pitch" for a zigzag `doc.walls`
run with a door, start/end, a monster, and a facing-rotated reaper statue
"for free" (the same real mutators a manual click calls); painted a
3-cell region and created it via the Region tool + panel; drew a
corner-anchored `wallLines:` straight wall via the Straight Wall tool and
carved a door in it via the Door tool; placed a `candles` prop and set an
explicit `height: 1.4` via the Inspector. Confirmed via the live proposed-
YAML pane, not just the screenshots' own claim — the resulting document
genuinely carries all of it:

```yaml
wallLines:
  [
    {
      from: { cell: [0, 4], corner: 4 },
      to: { cell: [0, 9], corner: 4 },
      doors: [{ cell: [0, 7] }],
    },
  ]
place: [..., { ref: 'dnd5e:props:candles', at: [4, 10], height: 1.4 }]
regions:
  - id: region-1
    archetype: chamber
    cells: [[2, 2], [2, 3], [3, 3]]
```

Two real scripting bugs, caught by the resulting screenshots, not
assumed correct: (1) `document.querySelector('svg')` grabbed a small 15×15
UI icon `<svg>` (there are several on this page) instead of the
`CreationBoard` canvas — every computed coordinate was garbage until
fixed to `document.querySelector('svg > polygon').closest('svg')`. (2) A
naive `getByText('Door', {exact:false}).first()` matched the page's own
demo-script CAPTION text ("...start/end → door → monster...") instead of
the Door tool's palette row, since `.first()` picks DOM order and the
caption sits above the Palette — fixed by scoping every palette
interaction to `getByRole('button', {name: /.../})` instead of a bare
text search. A third, geometry-specific finding: the straight wall's Door
tool needs a click ON the wall's own rendered corner-to-corner LINE
(`straightWallLineIndexNear`'s hit radius is a tight 8 board units), not
near a cell CENTER — resolved by reading the wall's own rendered `<line>`
midpoint straight out of the DOM (the longest solid-stroke line on the
board — a single edge-wall segment is always exactly one hex-edge long,
genuinely shorter than a multi-row straight-wall span) rather than
re-deriving corner-anchor geometry externally.

Screenshots confirm, at native resolution and cropped/upscaled for
close-in detail: the full canvas floor rendering as real hex tiles across
the whole 20×30 grid (not just wherever a room chain would have been);
the demo's own zigzag `doc.walls` run with a genuine amber jamb/lintel
door GAP (not a shortened box) next to the skeleton-captain and
facing-rotated reaper statue; the straight wall's footprint rendering as
5 dimmed crimson cells with a visible GAP exactly where the carved door
cell sits; a 3-cell green-tinted region with a floating "region-1" label
readable above it; and the `candles` prop rendering visibly elevated
above the floor plane at its placed cell. No unexpected console errors —
only the two established FIXTURES-MODE `[unimplemented] unknown service
...AuthoringService` errors (edit mode's own preview probe runs
regardless of which tab is active; unrelated to this unit, same note
every prior round's live-verification section already carries).

### Tests

12 new: 5 in `creation/canvasFloor.test.ts` (bounds enumeration, holes
exclusion, an out-of-bounds hole being a harmless no-op, the
`DEFAULT_CANVAS` fallback, an all-holes canvas producing an empty floor
honestly rather than erroring) + 7 in `preview3d/DungeonPreview3D.test.ts`
(`buildFloorTiles`'s `floorCells` path: one tile per cell tagged with the
new `CANVAS_ROOM_ID` sentinel, holes still excluded on that path, an
honest empty map with neither input, the `floorPlan.rooms` path
unchanged against the real `SHOWCASE_FLOORPLAN` fixture, `floorCells`
taking priority when both are supplied; `buildWallLineFootprint`: the
empty-`wallLines` fast path, and an exact-match cross-check against
`straightWallFootprint` for one drawn line, proving the 3D dim overlay
and the 2D hatch overlay agree on the same cell set rather than each
computing their own approximation). See also the connector-band addendum
below (2 more tests, same file) for the final count. `ci-check` clean
(format/lint/typecheck/build/test).

### Follow-ups named, not built

- **3D editing (click-to-place/select/rotate) for creation mode** —
  deliberately out of scope this round (see "Read-only this round,"
  above); edit mode's existing 3D click-to-place/select/rotate machinery
  is the natural thing to graduate over, not a from-scratch build.
- **Full 3D geometry for `wallLines:`'s own straight-line shape** —
  today's footprint-dim treatment answers "where can't I walk," not "what
  does this wall look like as a wall" the way `doc.walls`'
  `WallBox`/`DoorGap` path already does for edge-native walls.

### Addendum, same day: the connector-band chasm (edit-mode/compiled path)

Kirk, from live 3D screenshots of the COMPILED path (edit mode, unrelated
to creation mode's canvas — folded into this unit's PR since it's the
same floor-derivation code, adjacent work, not a separate concept): the
door jamb (`WallBox`/`DoorGap`, rendered from real `FloorPlan.edges` or
the derived fallback either way) stood over a genuine floorless BLACK
CHASM at every connector, not the intentional door-row void. Two
different absences, easy to conflate, worth stating precisely:

1. **The doorRow void WITHIN a room's own footprint is correct, not a
   bug.** `buildFloorTiles`'s `if (row === floorPlan.doorRow) continue`
   is the literal dungeonspec cell-legality rule (CONTRACT.md's own
   long-standing "cell legality is a clean one-line derivation" finding:
   `col ∈ [start_column, start_column+width) AND row != door_row`) —
   doorRow genuinely isn't part of any room's walkable floor. Unchanged
   by this fix, and shouldn't be.
2. **`connector.column` — the single gap column BETWEEN two rooms — was
   never visited by the room loop AT ALL, at any row.** `start_column`
   chain accumulation (`next.startColumn = prev.startColumn +
prev.width + 1`, CONTRACT.md's own confirmed finding) always leaves
   exactly one such column, and it belongs to NEITHER adjacent room's
   `[startColumn, startColumn+width)` range — verified directly against
   `SHOWCASE_FLOORPLAN` (column 6 between antechamber `[0,6)` and shrine
   `[7,21)`; column 21 between shrine and vault `[22,30)`, both new
   tests assert this rather than just narrate it). The real door — a
   genuine walkable opening, already rendered as one via
   `WallBox`/`DoorGap` — was therefore standing over a floor tile that
   was NEVER GENERATED, not merely excluded by the (correct) doorRow
   rule.

**Fix**: `buildFloorTiles`'s `floorPlan.rooms` branch gained a second
pass over `floorPlan.connectors`, adding exactly one floor tile per
connector at `[connector.column, floorPlan.doorRow]` — reusing the SAME
column convention `boardGeometry.ts`'s `connectorAtColumn` (the 2D
board's own door-row-click resolver) already keys off, not a new
derivation. `roomId` on that synthetic tile is `connector.fromRoomId` — a
real, existing room id (arbitrary between the two the connector bridges;
nothing downstream reads a connector tile's roomId today), not a
sentinel, since this cell genuinely belongs to the compiled dungeon the
way a creation-mode canvas tile doesn't.

**A real follow-on bug this surfaced and closed in the same pass**: once
the connector cell has a floor tile, edit mode's existing 3D
click-to-place machinery would happily generate a `FloorHitCell` there
too — and `handleClickCell`'s room-local math (`cell.col -
room.startColumn`) would silently produce an out-of-range column for
whichever room `fromRoomId` names, since the connector's own column sits
outside that room's width by construction. `Board.tsx`'s own 2D
drag-drop already has the answer: it rejects any drop at `row ===
floorPlan.doorRow` ("Can't drop on the reserved door row"). `handleClickCell`
now carries the identical guard before it ever reaches the room lookup —
the connector's floor tile is real and rendered, but not a legal
placement target, matching 2D's own rule exactly rather than silently
corrupting a placement's coordinates.

**Tests.** 2 new in `DungeonPreview3D.test.ts`: a direct assertion that a
real tile exists at `[connector.column, doorRow]` for every connector in
the real `SHOWCASE_FLOORPLAN` fixture (keyed via the same
`cubeAtColRow` the render path uses, not a hand-derived key), plus the
"never inside either room's own range" claim verified against the same
fixture rather than left as narration; and one confirming a hole exactly
at a connector cell still wins (the connector pass respects `doc.holes`
like every other tile). The existing `floorPlan.rooms` regression test
was updated in place — its expected count now includes
`+ floorPlan.connectors.length` — rather than silently drifting to a
higher number. 267 dungeon-builder tests passing overall (up from 253
pre-unit / 265 before this addendum). `ci-check` clean.

**Live verification.** Same dev server, same `--use-gl=swiftshader`
headless Chromium pattern this unit's own live-verification section
above used. A direct BEFORE/AFTER pixel comparison, not just an
after-the-fact look: the pre-fix `DungeonPreview3D.tsx` (this file's own
prior committed state) was swapped in, screenshotted at the exact same
default `Bounds`-fit camera framing (no manual orbit, so both shots are
reproducibly identical except for the code change), then the fix was
restored and the identical shot taken again. A pixel diff between the
two (`PIL.ImageChops.difference`) localizes to a single small,
tightly-bounded region exactly at the antechamber↔shrine connector —
confirming the fix changes ONLY what it should and nothing else
regressed. Cropped/marked side-by-side comparison: the void band's small
intrusion right at the door jamb's base, present in the BEFORE shot, is
gone in the AFTER shot — replaced by solid floor, the door now standing
on real ground instead of over a gap. No unexpected console errors
(same established FIXTURES-MODE `AuthoringService` notes as every prior
round).

## Straight walls stand in 3D: segment boxes + door gaps (2026-08-04, rpg-project#169)

Closes the "full 3D line geometry for `wallLines`" gap the creation-mode-3D-
preview unit above named and deliberately deferred: a `doc.wallLines` entry
was previously visible in 3D only as dimmed crimson footprint discs — the
floor-side "where can't I walk" treatment, with nothing standing to explain
WHY. It now also renders as real standing wall geometry, the 3D sibling of
its corner-anchored, door-gapped fidelity in 2D.

### What shipped

`buildWallLineSegments` (`DungeonPreview3D.tsx`, new, exported for direct
testing same as `buildFloorTiles`/`buildOnePlacement`): for each
`doc.wallLines` entry, resolves `from`/`to` (`creation/hexCorner.ts`'s
`CornerRef`s) to world-space points via `cornerWorldPos` — `cornerPoint`
(board space, `BOARD_HEX_SIZE`) rescaled by `BOARD_TO_WORLD_SCALE`
(`HEX_SIZE / BOARD_HEX_SIZE`), not a second corner-resolution
implementation. **One line is one box** spanning corner to corner — never a
piece per clipped cell — sized/positioned/rotated from the segment's own
real geometry (length = endpoint distance, rotation = `atan2(-dz, dx)`, the
same convention `hexEdgeBetween`/`edgeBetweenCells`/`wallBoxTransform`
already use elsewhere in this file). A `doors:` entry splits that one box at
its own door cell's real footprint clip interval —
`clipSegmentToShrunkHex(aBoard, bBoard, cell...)`, the EXACT primitive
`straightWallFootprint` already calls per candidate cell, called directly
here for just the door's cell rather than re-derived. The resulting
board-space `[t0, t1]` is reused UNCHANGED as a world-space lerp fraction
between the world-space endpoints — valid because `cornerPoint`'s board
space and this file's `hexMath.ts` world space are the exact same
`cubeToWorld`/`hexCorners` functions, linear in their own `size` parameter
with no additive offset, so a board-space `t` and a world-space `t` for the
same directed segment are identical (verified via the cross-check test
below, not just argued).

**`WallBox`/`DoorGap` generalized, not duplicated.** Both previously assumed
a fixed `HEX_SIZE`-wide edge-native piece (`wall: PlacedWall` prop). Both now
take plain `position`/`rotationY` plus an optional `length`/`width`
(defaulting to `HEX_SIZE`, so every existing edge-native call site is
unchanged in behavior) — the SAME box/jamb/lintel/material family renders a
one-hex-edge door wall and a several-hex straight-wall segment alike, so the
two wall vocabularies read as one architecture rather than two renderers.
`DoorGap`'s jamb width is clamped to `width / 2` so a narrow door interval
(a shallow clip near a cell's edge) still produces two jambs meeting cleanly
instead of overlapping; the now-unused fixed `DOOR_OPENING_WIDTH` constant
was removed rather than left dead.

**Corners need no special-case join code here either** (matching the 2D
finding this file's own earlier "Corners: no special-case joining logic
needed" section already established) — two `wallLines:` entries sharing a
canonical corner resolve to the identical `cornerWorldPos` point by
construction, so their boxes simply meet, verified live (see below), not
just argued from the 2D case.

### Tests

6 new in `DungeonPreview3D.test.ts` (`buildWallLineSegments` describe
block): a single-edge line (no doors) produces exactly one solid box, its
length/position/rotation cross-checked against independently-computed
`cornerPoint`-derived world geometry, not the render path's own internals;
a door mid-line splits solid/door/solid in order, all three sharing the
line's one rotation, with the door piece's own extent cross-checked against
a fresh `clipSegmentToShrunkHex` call (the reuse-not-duplication proof); a
door near one end produces a markedly asymmetric split with no
misordering; two doors on one line produce solid/door/solid/door/solid;
a door referencing a cell the line's geometry doesn't genuinely clip (the
"wall ending at a corner shared with a cell does not clip that cell"
boundary case) renders no gap — solid straight through, honestly, rather
than guessing one; an empty `doc.wallLines` produces no segments. 17
dungeon-builder-preview3d tests passing (up from 11), 307 dungeon-builder
tests overall. `ci-check` clean (format/lint/typecheck/build/test).

### Live verification

Own dev server (`vite --port 5191`, never `:3001`), `VITE_API_HOST` pointed
at a live envoy, driven via headless Chromium (`--use-angle=swiftshader
--enable-unsafe-swiftshader` — the modern flag pair; the older
`--use-gl=swiftshader` alone silently produced no WebGL context on this
Chrome build, worth recording since the previous round's own note named a
different flag). Authored `wallLines:` directly in the YAML pane (the
textarea's React `onChange` only fires for a value set via the native
`HTMLTextAreaElement` setter + a real `input` event — a plain CDP value-set
left the controlled input's own state untouched, so a subsequent React
re-render silently reverted the textarea to its prior content; a scripting
gotcha worth naming for whoever automates this pane next) — one long wall
with a door, plus a second corner-sharing pair, in EDIT mode's compiled
board, and a third wall directly on a from-scratch canvas in CREATION
mode's own 3D toggle.

Screenshots confirm, both contexts: a straight wall standing at its real
corner-to-corner extent (no hangover past either endpoint, matching Kirk's
2D fix) alongside the existing pillared shrine room; the same wall's
door carved as a genuine amber jamb-lintel gap, not a shortened box; two
wallLines sharing a corner meeting with no visible seam, an L exactly as
clean as the 2D case; the same scene's server-truth perimeter walls
(edge-native, zigzag) and the new straight-wall boxes reading as one
material/height family, not two renderers; and creation mode's own
from-scratch canvas (no `FloorPlan` at all) rendering the identical
wall+door geometry on its flat hex floor, confirming the component is
genuinely mode-agnostic rather than edit-mode-only. No unexpected console
errors (same established FIXTURES-MODE `AuthoringService` notes every prior
round's live-verification section already carries).

### What did NOT ship this round — named, not silently dropped

- **Click-to-select/edit a straight wall's own box in 3D.** Out of scope by
  the unit's own brief (rendering only) — edit-mode's existing
  click-to-place/select machinery for props/monsters is the natural thing
  to graduate a straight-wall pick onto later, not a from-scratch build.
- **A stranded door's own ⚠ flag rendered in 3D.** 2D already flags a door
  whose cell a subsequent endpoint drag un-clips; this unit's 3D geometry
  correctly stops rendering a gap there (verified, see Tests above) but
  does not yet surface the warning glyph itself in the 3D view — a real,
  narrow follow-up, not a silent gap.

## Creation-mode 3D editing: place/select/rotate/delete graduate onto the canvas (2026-08-04, rpg-project#169)

Closes the "Read-only this round" follow-up the creation-mode-3D-preview unit
named: Kirk's own words framing the ask — "I cannot place in 3D but if I had a
statue selected in 2D I can rotate it and see it in 3D." Edit mode's existing
3D click-to-place/select machinery (Kirk's "3D editing" arc, parts 2 and 3,
above) graduates onto creation mode's from-scratch canvas — exactly the
"graduate, don't rebuild" framing this file's own operating bar names as the
right shape for exactly this situation.

### A real, pre-existing bug found before any 3D work: 2D creation's own click-to-place never checked legality

Read `CreationBoard.tsx`'s `handlePointerDown` before touching anything: its
`edit.selectedPalette` branch called `edit.handlePlace(null, cell)` straight
off `nearestCreationCell`, with **no occupied check, no straight-wall-
footprint check, and no hole check at all** — only the boss-room guard. A
click could silently stack a second placement on an existing one, place
inside a `wallLines:` footprint, or place directly on a hole. This predates
this unit entirely (creation mode's click-to-place has worked this way since
the CST-unification round) and would have stayed invisible forever, since
nothing ever exercised the reject path to notice its absence. Verified by
reading the code, not inferred: `useBoardEditing.ts`'s `handlePlace` and
`dungeonYaml.ts`'s `placeItem` mutator both do zero validation of their own —
every existing legality check in this concept (edit mode's `Board.tsx`
`isCellOccupied` gate, the door-row reject) lives at the INTERACTION layer,
not the mutator, and creation mode's interaction layer simply never grew one.

**Fixed at the root, not just prepped for 3D** — the brief's own framing
("build ONE shared predicate both the 2D brush and 3D click consult if they
don't already share one") anticipated exactly this. New
`canvasPlacementRejectReason(doc, col, row, wallLineFootprint)`
(`creation/canvasFloor.ts`, sibling to `deriveCanvasFloorCells`) is the single
source both now consult:

1. **Real canvas floor** — in bounds, not a hole (the identical test
   `deriveCanvasFloorCells` applies).
2. **Not a straight-wall (`doc.wallLines`) footprint cell** — Kirk's rule
   ("any hex that is not 100% uncovered would not be traversable") makes a
   footprint cell BLOCKED, not floorless; the floor tile still renders
   (dimmed, per the creation-mode-3D-preview unit's own overlay), it just
   isn't a legal placement target. `wallLineFootprint` is caller-supplied
   (`straightWallsFootprintSet`, the exact primitive the 2D hatch/3D dim
   overlays already call) so a caller checking many cells computes it once,
   not once per cell.
3. **Not already occupied** — `boardGeometry.ts`'s `isCellOccupied`, now
   accepting `floorPlan: FloorPlan | undefined` (a from-scratch canvas has
   none — its room-scoped loop is a no-op for `doc.rooms === []` regardless,
   the top-level `doc.place` loop this needs never depended on `floorPlan` in
   the first place).

`CreationBoard.tsx`'s click handler now calls this before `edit.handlePlace`,
surfacing a reject through the same `onReject` toast seam every other tool in
that component already uses. This is a genuine behavior change to the
EXISTING 2D board, named honestly rather than silently bundled — matching
this file's own precedent for a real bug found mid-unit (the connector-band
chasm, the `movePlacementAcrossLists` field-loss fix, both above).

### `DungeonPreview3D.tsx`: the same predicate, wired into the existing click-to-place machinery

`buildPlaceableCells` (previously gated `floorPlan ? buildPlaceableCells(...)
: []` at the call site, so creation mode's `placeableCells` was always empty)
now takes `floorPlan: FloorPlan | undefined` and an explicit
`wallLineFootprint` param, and is called unconditionally — `floorTiles`
already unifies both mode's cell sets (`buildFloorTiles`'s own doc comment),
so the gate was never structurally necessary once `isCellOccupied` could take
an absent `floorPlan`. Each `PlaceableCell` gains an optional `rejectReason`:
`undefined` for every edit-mode cell (that branch stays exactly as it was —
silent on `occupied`, matching `Board.tsx`'s own click-to-place precedent,
`if (occupied) return;`, no toast) and for any legally-placeable creation-mode
cell; populated via `canvasPlacementRejectReason` for a blocked creation-mode
one. `occupied` (drives the hit-cell's red/teal tint) is `true` whenever
`rejectReason` is set, so the visual and the click decision can never
disagree with each other.

`handleClickCell` branches on `floorPlan` presence, the same idiom this file
already uses everywhere else (`buildFloorTiles`, `buildPlacements`,
`entranceBlocked`): the `floorPlan`-present branch is UNCHANGED (room lookup,
door-row reject, room-scoped `onPlace(cell.roomId, [localCol, row])`); the
new `!floorPlan` branch places TOP-LEVEL — `onPlace(null, [cell.col,
cell.row])`, the exact shape `CreationBoard.tsx`'s own 2D brush already
produces via `edit.handlePlace(null, cell)`. `onPlace`'s prop type widened
from `(roomId: string, at) => void` to `(roomId: string | null, at) => void`
to allow this — a pure widening, `edit.handlePlace` already accepted
`string | null`, so edit mode's own call site needed no change.

**Select/rotate/delete needed no new code at all** — this is the "graduate,
don't rebuild" claim made concrete. `DungeonPreview3D`'s existing prop-click
handler (`onClick={(e) => { e.stopPropagation(); onSelect(p.sel); }}`) never
checked `floorPlan`; wiring `selectedPlacement`/`onSelect` into creation
mode's call site (below) was the entire change needed for select. Rotate is
the Inspector's own pre-existing facing control (`Inspector.tsx`, unchanged),
reachable because `CreationConcept.tsx` already renders one `<Inspector>`
outside either board (edit mode's own precedent, "one Inspector, either
view"). Delete is the global Delete/Backspace keydown listener — see its own
real bug, next.

### A second real, pre-existing bug: the global Delete key was edit-mode only

`DungeonBuilderConcept.tsx`'s keydown listener read/acted on `edit.selectedPlacement`
alone (`edit` = the EDIT-mode `useBoardEditing` instance) — `creationEdit`
(creation mode's own, separate instance, `useBoardEditing` called a second
time against its own cst/doc) was never consulted. Delete/Backspace has
therefore never removed a creation-mode placement, in EITHER view, since the
CST-unification round — only the Inspector's own "Delete (or press Delete
key)" button worked there (`CreationConcept.tsx`'s `onDelete={edit.handleDelete}`,
where that `edit` prop IS `creationEdit`). Found while verifying the brief's
own "should already be view-agnostic — verify" claim for Delete-key parity —
it wasn't, and not for a 3D-specific reason.

**Fixed at the root**: the listener now picks `mode === 'create' ? creationEdit
: edit` as its active handle before checking `selectedPlacement`. Gating on
`mode` (not "whichever has a selection") matters because neither `edit` nor
`creationEdit` unmounts across a tab switch (`DungeonBuilderConcept`'s own
"remembered per mode" precedent for `boardDim`/`createBoardDim` above) — a
stale selection left in the INACTIVE mode must never hijack the key.

### Region/wall/hole/start/end tools: 2D-only, an honest reject instead of a misleading one

A new optional `selectedTool?: BoardTool | null` prop on `DungeonPreview3D`
— purely informational, this component never acts on a tool itself (there is
no 3D geometry-editing surface here this round). `handleClickCell`'s
no-palette-selected branch reads it: a tool armed (region/wall/hole/etc., all
2D-only this round) gets "That tool is 2D-only for now — switch to the 2D
board to use it, or pick a palette item to place something here" instead of
the generic "pick a palette item first" — which would otherwise read as a
non-sequitur to an author who very much has SOMETHING selected, just not a
placeable item. Edit mode's own call site doesn't pass this prop (its tools
aren't creation-canvas-scoped the same way), so edit mode's message is
unchanged.

### Live verification

Own dev server (`vite --port 5199`, never `:3001`), own throwaway Playwright
Chromium (`--use-angle=swiftshader --enable-unsafe-swiftshader`, matching the
straight-walls-in-3D unit's own established flag pair) rather than the shared
chrome-devtools MCP browser at `127.0.0.1:9222` (memory: that one is Kirk's,
collides across concurrent agents) — a fresh worktree's `public/models/synty/`
is gitignored and absent by default; symlinked from the main checkout for the
run, removed before committing (never part of the diff).

A real end-to-end loop on a 3×3 New Dungeon canvas, driven by genuine mouse
events at real screen coordinates (not a fiber-walk shortcut — this
component's hit-cells are real DOM/canvas pointer targets, same as the
existing click-to-place units' own live-verification precedent):

- **Place**: palette "pillar" selected, 3D floor hex clicked — `place:`
  gained `{ ref: "dnd5e:props:pillar", at: [0, 1], blocks_movement: false,
blocks_los: false }`, a real top-level entry, and the pillar rendered
  standing on the canvas. Evidence:
  `docs/evidence/dungeon-builder-creation-3d-place-via-click.png`.
- **Occupied-cell reject**: palette re-armed, the SAME cell clicked again —
  toast "That cell already holds a placement.", `place:` unchanged (no
  duplicate). Evidence:
  `docs/evidence/dungeon-builder-creation-3d-occupied-reject-toast.png`.
- **Select**: clicking the placed pillar's own mesh (not the floor beneath
  it) opened the Inspector showing `dnd5e:props:pillar [0,1]` with its
  facing/rotate/height/delete controls. Evidence:
  `docs/evidence/dungeon-builder-creation-3d-select-opens-inspector.png`.
- **Rotate**: two clicks on the Inspector's ↻ control while watching the
  live 3D view — `place:` gained `facing: NW`, the pillar visibly reoriented
  in the same screenshot. Evidence:
  `docs/evidence/dungeon-builder-creation-3d-rotate-via-inspector.png`.
- **Delete**: Delete key with the pillar selected — `place: []`, the pillar
  gone from the 3D view. Evidence:
  `docs/evidence/dungeon-builder-creation-3d-delete-via-key.png`.
- **Banner text**: confirmed live, not just in the diff — the `boardDim ===
'3d'` header banner no longer says "Read-only this round"; it now reads
  the interactive copy (palette-armed vs. not) matching edit mode's own
  banner language. Evidence:
  `docs/evidence/dungeon-builder-creation-3d-empty-interactive-banner.png`.

A real, worth-naming automation finding along the way: the empty-scene
screen-space center of the R3F `<canvas>` element is NOT where a click lands
on the rendered floor — `Bounds fit clip margin={1.25}` frames the CONTENT,
not the canvas rectangle, and the side panels give the canvas asymmetric
width, so the content's visual center sits well off the raw bounding box's
midpoint (empirically ~30%/50% of the box for this 3×3 canvas at this
viewport, grid-search-located, not guessed). A STANDING prop's own clickable
mesh additionally sits well above the floor plane it stands on (~75px higher
on screen at this camera framing for a `pillar`) — clicking the cell center
hits the floor hit-cell underneath it, not the prop, which is exactly the
z-ordering this file's own header doc comment describes (`HIT_CELL_Y` above
`FLOOR_Y` so a placement click always wins over the floor — but the PROP's
own mesh, taller still, only wins over BOTH if the ray actually intersects
its geometry, not just its cell). Worth recording for whoever next automates
a click against this specific 3D view.

**Not independently live-clicked**: the `selectedTool`-armed reject message
(previous section). The 2D Palette's accordion-toggle click proved
flaky under this specific Playwright automation (`page.mouse.click` on the
category header sometimes toggled it open, sometimes not, across otherwise
identical runs) — an automation quirk in the PRE-EXISTING accordion, not
something this unit touched. Confidence instead comes from: direct code
review (a one-line ternary sibling to the branch that WAS live-verified —
the plain "pick a palette item first" toast fired correctly and repeatedly
in every run above whenever no tool was armed either) and `ci-check`
(format/lint/typecheck/build/test all clean). Named honestly as a real,
narrow gap in this round's live evidence, not silently claimed as covered.

No unexpected console errors beyond the two established FIXTURES-MODE
`[unimplemented] unknown service ...AuthoringService` messages every prior
round's live-verification section already carries.

### Tests

17 new (324 dungeon-builder tests overall, up from 307): 7 in
`creation/canvasFloor.test.ts` (`canvasPlacementRejectReason` — an ordinary
legal cell, out-of-bounds, a hole, a straight-wall footprint cell via the
same single-cell fixture `straightWallGeometry.test.ts` itself uses, an
occupied top-level placement, gate-ordering, and a real `addWallLine` +
`straightWallsFootprintSet` integration case rather than a hand-built footprint
Set only); 4 in `boardGeometry.test.ts` (`isCellOccupied` had ZERO prior
coverage — a top-level placement's own cell, every other cell staying clear,
an empty canvas not crashing the now-skipped room loop, and `exclude`
correctly index-scoped); 6 in `preview3d/DungeonPreview3D.test.ts`
(`buildPlaceableCells`'s new creation-mode branch: one cell per floor tile,
an occupied cell carrying `occupied`+`rejectReason`, a footprint cell doing
the same with a DISTINCT reason, an ordinary cell carrying neither, every
cell tagged `CANVAS_ROOM_ID`; plus one edit-mode regression-guard test
pinning `rejectReason` always `undefined` there and `roomId` never the
canvas sentinel). `ci-check` clean (format/lint/typecheck/build/test).

### What did NOT ship this round — named, not silently dropped

- **Drag-move in 3D.** Deferred, and for a reason worth stating precisely:
  this is not a creation-mode gap, it's an EDIT-mode gap this unit had
  nothing to graduate from. CONTRACT.md's own "New arc: 3D editing, part 3"
  section (above) already named this: "drag-move in 3D stays the explicit
  follow-up... The 2D board remains the only way to drag-move a placement
  today, in either view's mode banner" — still true, unchanged by this unit.
  Click-select + the 2D board's own drag-move is today's answer in BOTH
  modes, not a creation-mode shortfall.
- **Region/wall/hole/start/end 3D editing.** Out of scope by this unit's own
  brief — placements only. A tool-armed 3D click gives the honest "switch to
  2D" reject (above) rather than silently no-oping or misleadingly claiming
  "pick a palette item."
- **The `selectedTool`-armed reject message's own live click**, named above
  under Live verification — code-reviewed and its sibling branch
  live-verified, not independently live-clicked, due to automation flakiness
  in the pre-existing accordion control, not this unit's own code.
