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
message) a real edge-native wall list, ideally the same `Wall{from, to,
kind}` type `EncounterService.Space` already defines (this file's
"walls: edge-native, matching a wire type that already exists" finding,
above) — three independent surfaces hitting the identical gap and
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

**The core move**: `DungeonDoc` (`dungeonYaml.ts`) grew v2 fields
directly — `canvas`, `walls`, `holes`, `start`, `end`, `lighting`, and a
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

1. **`TARGET-YAML.md`** — the full annotated dialect: every v2 field,
   the `version: 2` marker's real meaning (concept-only signal; the
   server is NEVER sent anything but `version: 1` and the stripped
   subset), the v1-subset strip table, the compile-badge approach, and
   the Structural category's render/semantics for holes.
2. **`dungeonYaml.ts` v2 layer** — parsing (tolerant: every v2 field
   absent/null/empty round-trips a pure v1 document unchanged, confirmed
   by test), mutators (`toggleWall`/`toggleWallKind`/`toggleHole`/
   `setStart`/`setEnd`/`setLightingAmbient`/`setPlacementFacing`/
   `setBossFacing`), and `stripToV1Subset` (strips every v2 field, forces
   `version: 1`, reports what got dropped + whether ≥2 rooms remain).
   Relaxed the room-count guard: `rooms: []` is now a legitimate v2 draft
   (only a genuinely MISSING `rooms:` key is a shape error) — a
   from-scratch canvas has to be able to exist before any room is
   declared.

   **Real bug the new tests caught, not inspection**: `wallIndexAt`/
   `holeIndexAt` compared `YAMLSeq.items[n]` (an unresolved `Scalar`
   wrapper for anything built via `cst.createNode`) against raw numbers,
   which never matches — every wall/hole lookup silently failed. Fixed to
   use `.get(n)`, the same auto-resolving accessor `findRoomSeqIndex`
   already used elsewhere in this file. Worth naming: this is exactly
   the kind of bug a test catches and a screenshot doesn't (the FIRST
   toggle always "worked" by construction — it's the SECOND lookup, on
   an already-round-tripped node, that silently failed).

3. **Live preview now compiles the v1 subset, not raw v2 text**
   (`usePutDungeonPreview.ts`) — sending a v2-bearing document verbatim
   to `PutDungeon` risked an unhelpful decode-level failure instead of a
   real `field_errors` response. A not-yet-shape-parseable mid-edit
   document skips that tick silently rather than misfiling a parse
   failure as a request/field error.
4. **Structural palette category** (Wall/Door/Hole) + Start/End tools in
   Markers, all badged `v2`. Selecting one arms a `BoardTool` (`types.ts`)
   `Board.tsx`'s click handlers check before falling into ordinary
   placement logic — the real connector door always wins over any active
   tool on its own cell. `WallGashExplainer` (the no-tool-selected
   fallback) no longer says "go to New Dungeon" — Kirk's own follow-up
   correction the same day — it now points at the Structural category in
   THIS view, since walls are authorable right here now.
5. **Compile-badge summary + Save & Play → "Save the compilable subset"**
   (`YamlPane.tsx`) — a `CompileBadgeStrip` names exactly which v2
   constructs are present ("Uses: 2 walls, 1 hole — not yet compiled
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
watched the compile badge appear the moment a v2 construct existed and
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
  ONLY place v2 constructs live — but a full merge of the two component
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
