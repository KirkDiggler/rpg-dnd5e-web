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

- **Edit mode's `Board.tsx` does not yet render top-level placements.**
  The team lead's brief scoped this round to dungeonYaml.ts's mutators,
  creation mode's re-pointing, `stripToV1Subset`, and the docs — it did
  not ask for a new Board.tsx render pass, and adding one is a real,
  separate chunk of work (an overlay pass matching the existing wall/
  hole/start/end target-dialect-overlay visual language, absolute coordinates with
  no room offset, plus wiring `onPlace`/`onSelect`/`onMove` for a
  roomId-less marker). `isCellOccupied` already accounts for `doc.place`
  defensively (see above), so nothing is UNSAFE about a hand-typed
  top-level placement in edit mode's YAML pane today — it just isn't
  visible on the board yet. Reachable only by hand-editing the YAML text
  in edit mode (creation mode is where this construct is actually
  authored through the UI this round) — named as the next natural
  extension, not attempted here to keep this round to what was asked.
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
