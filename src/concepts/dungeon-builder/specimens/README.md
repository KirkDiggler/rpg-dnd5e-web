# Dungeon Builder — specimen pack

**Specimen pack version: v0.4** (2026-08-05). v0.1 was posted in full on
[rpg-project#175](https://github.com/KirkDiggler/rpg-project/issues/175)
for the backend session implementing YAML processing; this and later
versions post as short diffs on the same issue.

**Versioning note — read this before touching anything here.** The
number above is the _specimen pack's own_ version. It is NOT the
document schema version: every YAML file in this folder correctly stays
`version: 1` per Kirk's settled additive model (rpg-project#175) — a new
optional field the builder learns to emit does not bump the document
version, only a real breaking/incompatible change would. Each time the
builder gains a new emittable construct, this pack regenerates and bumps
(v0.2, v0.3, ...) with a one-line changelog entry below naming the
addition. Never conflate the two numbers.

**Authority, as of v0.4.** Every per-construct status claim in this file
is checked against `rpg-project`'s ratified
`ideas/dungeon-builder/spec/v0.3/spec.md` (RATIFIED 2026-08-05) plus its
sibling `README.md`'s Ratification record — not against this concept's
own proposal/probe framing alone. Where the two agree, both are cited;
where a construct is real dialect this concept proposed before the spec
existed, the spec section is what now settles whether the shape survived
ratification unchanged. See "Per-construct status against the ratified
spec," below.

## Changelog

- **v0.4** (2026-08-05) — regenerated at the RATIFIED
  `ideas/dungeon-builder/spec/v0.3/spec.md` cut (rpg-project, ratified
  2026-08-05 — six pre-ratification OPEN points all resolved; see that
  spec's own `README.md` Ratification record). Two structural changes,
  both required by ratified rulings, not stylistic:
  - `kitchen-sink.yaml` (chain doc, non-empty `rooms:`) no longer
    declares `regions:`. Ratified ruling 4 (spec.md §4.10.3.8): a
    document combining non-empty `rooms:` with declared `regions:` MUST
    be rejected — the two-region demo (`hall-inner`/`hall-annex` +
    `connectRegions`) v0.3 of this pack carried directly inside
    `kitchen-sink.yaml` was exactly that now-illegal combination.
    Removed; regenerating via the real serializer with the region calls
    dropped from the throwaway `_regen.test.ts` script confirms
    `kitchen-sink.yaml` no longer contains a `regions:` key at all.
    (It never declared `canvas:` either — ruling 3, spec.md §4.5.2's
    `rooms:`+`canvas:` reject — so no change was needed on that axis;
    noted here as verified, not assumed.)
  - `canvas.yaml` (canvas doc, `rooms: []`) gains a `regions:` block: the
    SAME two-region + `connectRegions` demonstration relocated here
    (ids renamed `hall-inner`/`hall-annex` → `canvas-inner`/
    `canvas-annex` — no `hall` room exists in canvas mode to name a
    region after; cells unchanged), since canvas+regions is not one of
    the two ratified-rejected combinations (only `rooms:`+`canvas:` and
    `rooms:`+`regions:` are — rulings 3 and 4) and is therefore this
    pack's only ratified-legal home left for a `regions:` sample.
    `canvas.yaml`'s top-level altar `facing: W` is ALSO now
    ratified-conforming (ruling 6, spec.md §4.6 point 3 / §4.9.2:
    canvas-mode top-level `facing:` on a non-monster, `mount: floor`
    placement is accepted, under the same conditions a room-scoped
    entry already gets) — before ratification this was a genuinely open
    question (`TARGET-YAML.md`'s "canvas-mode extension" reading vs. the
    more conservative "#178-scoped exclusion" reading, spec `README.md`
    Reconciliation item 8), not yet settled either way; it is settled
    now, both prior readings retired in favor of the ratified one.
  - **A real byte-level finding from the regeneration, not a hand-edit**:
    relocating the region demo did not reproduce the old door edge. The
    pre-v0.4 `kitchen-sink.yaml`'s `connectRegions(hall-inner,
hall-annex)` picked `{from:[10,3],to:[11,3]}`; the identical two
    cell sets, run through the CURRENT `connectRegions`/
    `pickAttachmentEdge` (`regionGeometry.ts`), pick
    `{from:[10,3],to:[11,2]}` instead. Traced to source: `d75487f`
    (region authoring prototype, 2026-08-03) generated the original demo
    under the OLD 4-neighbor `cellsAdjacent`, which finds exactly 2
    shared-boundary edges between these two regions (both same-row
    pairs). `8793905` (hex-true creation canvas, same day) widened
    `cellsAdjacent` to real 6-neighbor hex adjacency, which for this
    specific pair of regions adds a THIRD (diagonal) shared edge —
    `pickAttachmentEdge`'s deterministic "middle of the sorted list"
    rule lands on a different edge once the candidate list has 3 entries
    instead of 2. Verified directly against current
    `regionGeometry.ts`: `sharedBoundaryEdges` on these two cell sets
    returns 3 edges, not 2. The pre-v0.4 door byte was stale relative to
    the codebase's own hex-true adjacency fix from the day it landed —
    `ce67065`'s "canonical wall adjacency" regen pass fixed the two
    hand-drawn walls in this same document but never re-ran the
    region/`connectRegions` block, so this one byte went unrefreshed
    until this round.
  - `kitchen-sink.v1-subset.yaml` — byte-identical (regions were always
    dropped from the v1-subset regardless of source; removing them from
    `kitchen-sink.yaml` changes nothing this file emits).
    `kitchen-sink.v1-subset.dropped.json` regenerated: the `"2 regions"`
    entry is gone (nothing left to drop) and `"3 walls"` → `"2 walls"`;
    `compiling`/`compilableBlockers` stay empty, same conservative
    no-capabilities call every prior version of this file used.
  - `exploration/holes.yaml` — content unchanged (still the single
    standalone `toggleHole(10, 4)` doc). Regenerating through the
    current serializer normalized its `holes:` entry's flow-sequence
    bracket spacing to match the rest of the pack (`[10, 4]` →
    `[ 10, 4 ]`); `prettier --write` then reverted that specific entry
    back to `[10, 4]` to satisfy this repo's own `format:check` —
    prettier's YAML formatter treats a bare top-level `- [a, b]` list
    item differently from the same shape nested inside a flow map
    (`{ ..., at: [ 1, 1 ] }`), which is why only this file needed a
    prettier pass and `kitchen-sink.yaml`/`canvas.yaml` didn't.
  - A second incidental finding, also surfaced only by a FULL
    regeneration: `canvas.yaml` gained a `wallLines: []` line it didn't
    carry before. `canvas.yaml` was last regenerated at v0.2
    (2026-08-03) and this pack's own changelog has said "unchanged since
    v0.2" through v0.3 — but `emptyCanvasYaml`
    (`creation/emptyCanvasDoc.ts`) gained a `wallLines:` key in `37584af`
    ("straight walls with visible footprint (prototype)"), also
    2026-08-03 but AFTER v0.2's canvas.yaml was generated. `canvas.yaml`
    had simply never been regenerated since, so it never picked up the
    empty key. Content-neutral (`wallLines: []` — no straight walls are
    authored in this specimen), but real: the pack's "unchanged since
    v0.2" claim for `canvas.yaml` was accurate for its authored content
    but not for its full byte shape once the base skeleton moved on.
  - Verification: all four specimen files round-trip byte-stable through
    `parseDungeon` → `serializeDungeon`. No test in this concept reads
    the specimens directory as a fixture (confirmed by search — zero
    references), so the full `src/concepts/dungeon-builder` suite (324
    tests, 16 files) needed no reference updates and passes unchanged.
    `ci-check` clean (format/lint/typecheck/build/test).
- **(2026-08-04, no version bump — `stripToV1Subset` reporting shape only,
  not a new emittable construct)**: the "capability-probed graduation"
  unit made `stripToV1Subset` capability-aware (`dungeonYaml.ts`) —
  `kitchen-sink.v1-subset.dropped.json` regenerated to match its new
  shape: the old combined `"start/end"` entry is now two independent
  entries, `"start"` and `"end"` (the real server accepts one but not the
  other — see `capabilityProbe.ts`), and the file gained `compiling`
  (empty here — this regen calls `stripToV1Subset` with no capabilities,
  same conservative-static call every prior version of this file used)
  and `compilableBlockers` (empty — the doc is compilable) alongside the
  existing `dropped`/`compilable`. `kitchen-sink.yaml` itself is
  byte-identical; only the report format changed.
- **v0.3** (2026-08-03) — `erratum: canonical wall adjacency`:
  the real Kitchen Sink mutator calls now emit `[7,1]`→`[8,1]` (solid)
  and `[7,3]`→`[8,3]` (door), replacing the non-adjacent odd-q pairs
  ending at `[8,0]` and `[8,2]`. This corrects generated specimen data
  only: the specimen pack remains v0.3 and every document remains
  `version: 1`.
  `+ regions: construct (proposed, rpg-project#180)`: `kitchen-sink.yaml`
  now declares two cell-authored semantic regions
  (`hall-inner`, `hall-annex`) inside the `hall` room's absolute column
  range, connected via `connectRegions` — the door edge it places shows up
  as a THIRD entry in `walls:` (`{ from: [10,3], to: [11,3], kind: door }`),
  alongside the two hand-drawn ones. `kitchen-sink.v1-subset.dropped.json`
  now carries a `"2 regions"` entry (regions have no v1 representation of
  any kind), and the region-attachment door is counted under the existing
  `"3 walls"` entry — a region-attachment door is architecturally just
  another `walls:` entry, not a separate wire concept; see
  `TARGET-YAML.md`'s "regions:" section for the shape, invariants, and the
  region-attachment-vs-chain-connector distinction.
  `+ holes moved to exploration appendix`: the v0.1/v0.2 kitchen-sink doc
  inconsistently carried a `holes:` entry despite holes being deliberately
  deferred from the near-term dialect (TARGET-YAML.md's own framing) —
  fixed by dropping `holes:` from `kitchen-sink.yaml` entirely and adding
  `exploration/holes.yaml`, a small standalone specimen (also generated via
  the real serializer, not hand-typed) demonstrating the construct without
  implying it carries the same status as the main pack's contents.
  `defaults: (v0.2)` — unchanged, still present on `kitchen-sink.yaml`
  exactly as v0.2 left it.
- **v0.2** (2026-08-03) — `+ height on any placement (#688)`: the
  top-level `candles` placement now carries an explicit `height: 0.4`
  with NO `mount:` key at all — the decoupled floor-standing/floating
  case #688 shipped, not just the pre-existing wall-mounted height
  examples. `+ defaults: map (this PR)`: a `defaults:` block with two
  shapes side by side — `dnd5e:props:tomb-open`'s `blocks_movement: true`
  (a real v1-expressible field: the `entry` room's `tomb-open` instance
  carries NO explicit `blocks_movement`/`blocks_los` at all, so it's
  genuinely inheriting, and `kitchen-sink.v1-subset.yaml` shows the value
  MATERIALIZED onto that instance on strip) and
  `dnd5e:props:statue-reaper`'s `height: 1` (target-dialect-only, no v1
  form regardless of inheritance — dropped on strip like any other,
  counted in `dropped.json`'s `"defaults (...)"` entry, never
  materialized). `kitchen-sink.v1-subset.dropped.json`'s `"defaults (2
refs; blocks_movement/blocks_los materialized onto 1 placement from 1
of them)"` entry names both outcomes explicitly.
- **v0.1** (2026-08-02) — initial pack, built from what the builder
  emits as of this date. Does not yet include the height-decouples-
  from-mount or `defaults:` map work (Kirk-batch, queued) — those land
  as v0.2 with their own line here.

## Files

| File                                  | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kitchen-sink.yaml`                   | One room-chain document exercising every construct + field variation the builder can emit today for that mode (3-room chain, locked connector, every `place:` field combo, boss facing+targeting, both wall kinds, start/end, lighting, count-based obstacles). No `regions:` as of v0.4 — ratified spec §4.10.3.8 rejects `rooms:`+`regions:` in one document; the two-region demo moved to `canvas.yaml`. No `holes:` as of v0.3 — see `exploration/holes.yaml`.                                                      |
| `kitchen-sink.v1-subset.yaml`         | The same document run through `stripToV1Subset` — exactly what Save & Play would persist right now.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `kitchen-sink.v1-subset.dropped.json` | What `stripToV1Subset` dropped from the kitchen-sink doc, and whether the result is `compilable` (≥2 rooms).                                                                                                                                                                                                                                                                                                                                                                                                            |
| `canvas.yaml`                         | What creation mode ("New Dungeon," a blank canvas) emits after a few walls/doors/placements/start/end/regions — the second real document shape (`rooms: []` + `canvas: {width,height}`, so every placement is top-level). As of v0.4: gains a `regions:` block (the two-region + `connectRegions` demo relocated from `kitchen-sink.yaml`, since canvas+regions is the ratified-legal combination — spec §4.5/§4.10.3.8) and its top-level altar's `facing: W` is now ratified-conforming (spec §4.6/§4.9.2, ruling 6). |
| `exploration/holes.yaml`              | v0.3+. A minimal standalone specimen for the retained Hole prototype — deliberately deferred from the near-term dialect (TARGET-YAML.md; ratified spec §2 keeps it "deferred, not queued"), kept out of the main kitchen-sink doc so it doesn't read as carrying the same status as everything else in it.                                                                                                                                                                                                              |

**Live-verified, not just claimed**: `kitchen-sink.v1-subset.yaml` was
run through a real `PutDungeon(validate_only: true)` against an isolated
`rpg-api:local` instance (authoring gate on) and returned
`success: true` with a real compiled `FloorPlan` — see the full
transcript in the rpg-project#175 comment linked above (including a
genuine validation rejection hit and fixed along the way: the first
attempt placed the boss on the reserved door row, and the real server
caught it).

Status tags in the pack match `CONTRACT.md`/`TARGET-YAML.md` exactly:
**[compiles-today]** = real, `dungeonspec`-validated; **[target-dialect]**
= proposed, authored by this concept, not yet compiled server-side;
**[experiment: not proposed]** = a concept-local probe, not even a
dialect candidate; **[deferred: exploration]** = deliberately not part
of the near-term dialect.

## Per-construct status against the ratified spec (v0.4)

As of v0.4, every tag above additionally cites the section of
`ideas/dungeon-builder/spec/v0.3/spec.md` (rpg-project, RATIFIED
2026-08-05) that settles it — this replaces this file's own
proposal/probe framing as the status authority. "Compiles today" below
means live-verified against a real server per `TARGET-YAML.md`'s
capability-probe table, a narrower and independently-tracked claim than
"ratified" (a construct can be ratified spec and still not-yet-shipped
server-side — Wave 0/#192 and Wave 1/#180 are both listed "not started"
in spec.md §1).

| Construct                                                                                    | Where in this pack                                           | Spec §                       | Status                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rooms:`/`connectors:`/room-scoped `place:`/`boss:`/`obstacles:`                             | `kitchen-sink.yaml`, `exploration/holes.yaml`                | §4.2–§4.4                    | ratified, real — compiles today (`dungeonspec.Validate`), unchanged                                                                                                                                                                                                        |
| `walls:` (edge-native)                                                                       | `kitchen-sink.yaml`, `canvas.yaml`                           | §4.7                         | ratified — compiles today, live-verified (rpg-api#769/toolkit#881)                                                                                                                                                                                                         |
| `start:`                                                                                     | `kitchen-sink.yaml`, `canvas.yaml`                           | §4.8                         | ratified — compiles today, overrides the generator-chosen `FloorPlan.entrance`                                                                                                                                                                                             |
| room-scoped `place:`/`boss:` `facing:` (non-monster, floor-mount)                            | `kitchen-sink.yaml`                                          | §4.9                         | ratified — compiles today (verified live, entry-type table in `TARGET-YAML.md`)                                                                                                                                                                                            |
| `canvas:` + top-level `place:`                                                               | `canvas.yaml`                                                | §4.5, §4.6                   | ratified (Wave 0, rpg-project#192) — **not started** server-side; decode-unknown on the current live server                                                                                                                                                                |
| canvas-mode top-level `facing:` (`canvas.yaml`'s altar)                                      | `canvas.yaml`                                                | §4.6 point 3, §4.9.2         | **ratified-conforming as of ruling 6** (2026-08-05) — was a genuinely open ratification question before (spec `README.md` Reconciliation item 8); still not compiled server-side, same Wave 0 gate as `canvas:` itself                                                     |
| `regions:`                                                                                   | `canvas.yaml` only (v0.4 — moved out of `kitchen-sink.yaml`) | §4.10                        | ratified shape/model (Wave 1, rpg-project#180) — **not started** server-side; decode-unknown on the current live server                                                                                                                                                    |
| `rooms:`+`regions:` in one document                                                          | (never emitted by this pack)                                 | §4.10.3.8                    | ratified **MUST-reject** (ruling 4) — this concept's own client-side validator does not yet enforce this combination (`TARGET-YAML.md`'s regions "Open questions" section still records it as unvalidated); this pack avoids it by construction, not by client enforcement |
| `rooms:`+`canvas:` in one document                                                           | (never emitted by this pack)                                 | §4.5 point 2                 | ratified **MUST-reject** (ruling 3)                                                                                                                                                                                                                                        |
| `end:`, `lighting:`, `defaults:`, `height:` (any placement), `rotate_degrees:`, `targeting:` | `kitchen-sink.yaml`                                          | §2 ("Explicitly ABOVE v0.3") | above the ratified v0.3 cut — unfiled or filed-but-unimplemented per §2's table; decode-unknown server-side, target-dialect client-side                                                                                                                                    |
| `holes:`                                                                                     | `exploration/holes.yaml`                                     | §2                           | explicitly deferred, not queued                                                                                                                                                                                                                                            |
| `wallLines:` (straight walls)                                                                | (not emitted in this pack; client-only sugar)                | §2                           | explicitly unfiled, above v0.3                                                                                                                                                                                                                                             |

## Regenerating for the next version bump

There is no permanently-committed generator script in this repo (a
`.test.ts` file here would auto-run on every `vitest run`/`ci-check`,
writing to disk as a side effect on every CI pass — not what a
version-bumped-only-when-the-builder-changes pack wants). Instead: copy
the script below into a throwaway `src/concepts/dungeon-builder/_regen.test.ts`,
run `npx vitest run src/concepts/dungeon-builder/_regen.test.ts`, delete
the throwaway file, and diff the regenerated output against what's here
— update the changelog above with what changed.

```ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
  clearPlacementFlag,
  connectRegions,
  createRegion,
  moveBoss,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setBossFacing,
  setBossTargeting,
  setConnectorLocked,
  setEnd,
  setLightingAmbient,
  setPlacementFacing,
  setPlacementFlags,
  setPlacementHeight,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  setRefDefault,
  setStart,
  setWallEdge,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
} from './dungeonYaml';
import { emptyCanvasYaml, DEFAULT_CANVAS } from './creation/emptyCanvasDoc';

const OUT_DIR = resolve(__dirname, 'specimens');
const EXPLORATION_DIR = resolve(__dirname, 'specimens/exploration');

describe('specimen generator', () => {
  it('kitchen-sink', () => {
    // Skeleton: room chain + connectors + obstacles + boss's own initial
    // declaration -- constructs with no interactive mutator yet (no
    // "add room"/"add connector"/"add boss" UI). Every field-level
    // variation on top is driven by the real mutators below.
    const skeleton = `version: 1
key: specimen-kitchen-sink
name: Specimen — Kitchen Sink
theme: crypt
height: 8
rooms:
  - id: entry
    archetype: entrance
    width: 6
  - id: hall
    archetype: chamber
    width: 12
    obstacles:
      - { ref: "dnd5e:props:bone-pile", count: 3 }
  - id: sanctum
    archetype: boss
    width: 8
    boss: { ref: "dnd5e:monsters:skeleton-captain", at: [0, 0] }
connectors:
  - { from: entry, to: hall }
  - { from: hall, to: sanctum }
`;
    const { cst } = parseDungeon(skeleton);

    placeItem(cst, 'entry', 'dnd5e:props:brazier', [1, 1]);
    setPlacementFlags(cst, 'entry', 0, {
      blocksMovement: true,
      blocksLos: false,
    });

    placeItem(cst, 'entry', 'dnd5e:props:statue-reaper', [3, 1]);
    setPlacementFacing(cst, 'entry', 1, 2); // NW

    // a placement lacking blocks_movement/blocks_los entirely (cleared
    // right back off after placeItem's own auto-stamp) -- exercises
    // clearPlacementFlag AND gives `defaults:` below a REAL instance to
    // inherit blocks_movement onto, materialized on strip.
    placeItem(cst, 'entry', 'dnd5e:props:tomb-open', [5, 1]);
    clearPlacementFlag(cst, 'entry', 2, 'blocksMovement');
    clearPlacementFlag(cst, 'entry', 2, 'blocksLos');

    placeItem(cst, 'hall', 'dnd5e:monsters:skeleton-captain', [5, 2]);
    setPlacementTargeting(cst, 'hall', 0, 'dnd5e:targeting:nearest');

    placeItem(cst, 'hall', 'dnd5e:props:wall-banner', [7, 1]);
    setPlacementFacing(cst, 'hall', 1, 1); // NE
    setPlacementMount(cst, 'hall', 1, 'wall');
    setPlacementHeight(cst, 'hall', 1, 2.0);
    setPlacementRotationDegrees(cst, 'hall', 1, 12);
    setWallEdge(cst, [7, 1], [8, 1], 'solid', true);
    setWallEdge(cst, [7, 3], [8, 3], 'door', true);

    // v0.4 (ratified spec v0.3, spec.md §4.10.3.8): a room-chain document
    // (non-empty rooms:) combining with regions: is now a RATIFIED
    // MUST-reject combination -- the two-region demo that used to live
    // here (hall-inner/hall-annex + connectRegions) moved to the canvas
    // test below, the ratified-legal home for regions:. This doc stays
    // rooms:-only, no regions: key at all.

    // row 4 is the reserved door row (height/2) -- avoid it.
    moveBoss(cst, 'sanctum', [4, 3]);
    setBossFacing(cst, 'sanctum', 4); // SW
    setBossTargeting(cst, 'sanctum', 'dnd5e:targeting:boss-priority');

    placeItem(cst, null, 'dnd5e:props:wall-banner', [15, 3]);
    setPlacementFacing(cst, null, 0, 0); // E
    setPlacementMount(cst, null, 0, 'wall');
    setPlacementHeight(cst, null, 0, 1.5);
    setPlacementRotationDegrees(cst, null, 0, -8);

    placeItem(cst, null, 'dnd5e:props:candles', [16, 3]);
    setPlacementFlags(cst, null, 1, {
      blocksMovement: false,
      blocksLos: false,
    });
    // height decoupled from mount -- a FLOOR-standing placement (no
    // mount: key at all) carrying its own height, the "floating candle"
    // case the decoupling exists for.
    setPlacementHeight(cst, null, 1, 0.4);

    setConnectorLocked(cst, 0, { dc: 14, ability: 'dex' });
    // second connector stays unlocked (locked: null) -- proves elision.

    setStart(cst, [1, 3]);
    setEnd(cst, [4, 5]);
    setLightingAmbient(cst, 0.35);

    // defaults: map. Two different shapes on purpose -- see this file's
    // changelog entry above for the full explanation of what each one
    // demonstrates (materialize-on-strip vs plain drop).
    setRefDefault(cst, 'dnd5e:props:tomb-open', 'blocksMovement', true);
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'height', 1.0);

    // v0.3: NO holes in the main kitchen-sink doc anymore -- see the
    // separate exploration/holes.yaml specimen below for the deferred
    // construct (this file's own "Holes moved to exploration appendix"
    // changelog entry).

    const yaml = serializeDungeon(cst);
    writeFileSync(resolve(OUT_DIR, 'kitchen-sink.yaml'), yaml);

    const stripped = stripToV1Subset(yaml);
    writeFileSync(
      resolve(OUT_DIR, 'kitchen-sink.v1-subset.yaml'),
      stripped.yaml
    );
    writeFileSync(
      resolve(OUT_DIR, 'kitchen-sink.v1-subset.dropped.json'),
      JSON.stringify(
        { dropped: stripped.dropped, compilable: stripped.compilable },
        null,
        2
      )
    );
  });

  it('canvas', () => {
    const { cst } = parseDungeon(
      emptyCanvasYaml(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height)
    );

    setWallEdge(cst, [4, 4], [5, 3], 'solid', true);
    setWallEdge(cst, [4, 4], [4, 5], 'solid', true);
    setWallEdge(cst, [5, 3], [6, 4], 'door', true);

    placeItem(cst, null, 'dnd5e:props:pillar', [5, 5]);
    placeItem(cst, null, 'dnd5e:props:altar', [8, 8]);
    setPlacementFacing(cst, null, 1, 3); // W

    // v0.4 (ratified spec v0.3, spec.md §4.10.3.8/§4.5): canvas + regions
    // is NOT one of the two rejected combinations (rooms:+canvas: and
    // rooms:+regions: -- rulings 3/4) -- canvas mode's rooms: [] means
    // there is no non-empty rooms: to collide with, so canvas + regions:
    // is the ratified-legal home for a regions: demo. This is the SAME
    // two-region + connectRegions demonstration (identical cells,
    // identical connectRegions call) that used to live in
    // kitchen-sink.yaml, relocated here rather than reinvented -- only
    // the ids changed (hall-inner/hall-annex -> canvas-inner/canvas-annex)
    // since no "hall" room exists in canvas mode to name a region after.
    const docForRegions = toDungeonDoc(cst);
    createRegion(cst, docForRegions, 'canvas-inner', 'chamber', [
      [9, 2],
      [9, 3],
      [10, 2],
      [10, 3],
    ]);
    const docWithFirstRegion = toDungeonDoc(cst);
    createRegion(cst, docWithFirstRegion, 'canvas-annex', 'chamber', [
      [11, 2],
      [11, 3],
    ]);
    const docWithBothRegions = toDungeonDoc(cst);
    connectRegions(cst, docWithBothRegions, 'canvas-inner', 'canvas-annex');

    setStart(cst, [2, 2]);
    setEnd(cst, [12, 12]);

    const yaml = serializeDungeon(cst);
    writeFileSync(resolve(OUT_DIR, 'canvas.yaml'), yaml);
  });

  it('exploration/holes', () => {
    // A minimal, standalone doc -- deliberately NOT folded into
    // kitchen-sink.yaml (v0.3's "holes moved to exploration appendix"
    // changelog entry) so demonstrating the retained Hole prototype never
    // implies it carries the same status as the main pack's contents.
    const skeleton = `version: 1
key: specimen-holes-exploration
name: Specimen — Holes (exploration)
theme: crypt
height: 8
rooms:
  - id: entry
    archetype: entrance
    width: 6
  - id: hall
    archetype: chamber
    width: 12
connectors:
  - { from: entry, to: hall }
`;
    const { cst } = parseDungeon(skeleton);
    toggleHole(cst, 10, 4);
    const yaml = serializeDungeon(cst);
    writeFileSync(resolve(EXPLORATION_DIR, 'holes.yaml'), yaml);
  });
});
```

When the next version adds new fields, extend the script above with new
mutator calls exercising them and re-run. `regions:` (rpg-project#180) has
a real mutator set (`createRegion`/`addCellToRegion`/
`removeCellFromRegion`/`renameRegion`/`setRegionArchetype`/`deleteRegion`/
`connectRegions`) — see `TARGET-YAML.md`'s "regions:" section for the full
design. As of v0.4, the region demo lives in the **canvas** test block
(`canvas-inner`/`canvas-annex`), not kitchen-sink's — ratified spec
§4.10.3.8 rejects `rooms:`+`regions:` in one document, and kitchen-sink is
a `rooms:`-chain doc. Extend the canvas script's region block, don't add
one to kitchen-sink or add a second region block, if a future round adds
more region field coverage.
