# Dungeon Builder — specimen pack

**Specimen pack version: v0.3** (2026-08-03). v0.1 was posted in full on
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

## Changelog

- **v0.3** (2026-08-03) — `+ regions: construct (proposed, rpg-project#180)`:
  `kitchen-sink.yaml` now declares two cell-authored semantic regions
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

| File                                  | What it is                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kitchen-sink.yaml`                   | One document exercising every construct + field variation the builder can emit today (3-room chain, locked connector, every `place:` field combo, boss facing+targeting, both wall kinds including a region-attachment door, two cell-authored regions, start/end, lighting, count-based obstacles). No `holes:` as of v0.3 — see `exploration/holes.yaml`. |
| `kitchen-sink.v1-subset.yaml`         | The same document run through `stripToV1Subset` — exactly what Save & Play would persist right now.                                                                                                                                                                                                                                                         |
| `kitchen-sink.v1-subset.dropped.json` | What `stripToV1Subset` dropped from the kitchen-sink doc, and whether the result is `compilable` (≥2 rooms).                                                                                                                                                                                                                                                |
| `canvas.yaml`                         | What creation mode ("New Dungeon," a blank canvas) emits after a few walls/doors/placements/start/end — the second real document shape (`rooms: []` + `canvas: {width,height}`, so every placement is top-level). Unchanged since v0.2.                                                                                                                     |
| `exploration/holes.yaml`              | v0.3+. A minimal standalone specimen for the retained Hole prototype — deliberately deferred from the near-term dialect (TARGET-YAML.md), kept out of the main kitchen-sink doc so it doesn't read as carrying the same status as everything else in it.                                                                                                    |

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
    setWallEdge(cst, [7, 1], [8, 0], 'solid', true);
    setWallEdge(cst, [7, 3], [8, 2], 'door', true);

    // v0.3 (rpg-project#180): two cell-authored semantic regions inside
    // "hall"'s absolute column range (hall's start_column = entry's width
    // 6 + the reserved connector gap column = 7, so hall = [7,19)),
    // connected via connectRegions -- the door edge it places lands in
    // walls: as a THIRD entry, alongside the two hand-drawn ones above.
    const docForRegions = toDungeonDoc(cst);
    createRegion(cst, docForRegions, 'hall-inner', 'chamber', [
      [9, 2],
      [9, 3],
      [10, 2],
      [10, 3],
    ]);
    const docWithFirstRegion = toDungeonDoc(cst);
    createRegion(cst, docWithFirstRegion, 'hall-annex', 'chamber', [
      [11, 2],
      [11, 3],
    ]);
    const docWithBothRegions = toDungeonDoc(cst);
    connectRegions(cst, docWithBothRegions, 'hall-inner', 'hall-annex');

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
mutator calls exercising them and re-run. `regions:` (rpg-project#180) now
has a real mutator set (`createRegion`/`addCellToRegion`/
`removeCellFromRegion`/`renameRegion`/`setRegionArchetype`/`deleteRegion`/
`connectRegions`) as of v0.3 — see `TARGET-YAML.md`'s "regions:" section
for the full design; extend the kitchen-sink script's region block above,
don't add a second one, if a future round adds more region field
coverage.
