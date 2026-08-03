# Dungeon Builder — specimen pack

**Specimen pack version: v0.2** (2026-08-03). Posted in full on
[rpg-project#175](https://github.com/KirkDiggler/rpg-project/issues/175)
for the backend session implementing YAML processing.

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

| File                                  | What it is                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kitchen-sink.yaml`                   | One document exercising every construct + field variation the builder can emit today (3-room chain, locked connector, every `place:` field combo, boss facing+targeting, both wall kinds, a hole, start/end, lighting, count-based obstacles). |
| `kitchen-sink.v1-subset.yaml`         | The same document run through `stripToV1Subset` — exactly what Save & Play would persist right now.                                                                                                                                            |
| `kitchen-sink.v1-subset.dropped.json` | What `stripToV1Subset` dropped from the kitchen-sink doc, and whether the result is `compilable` (≥2 rooms).                                                                                                                                   |
| `canvas.yaml`                         | What creation mode ("New Dungeon," a blank canvas) emits after a few walls/doors/placements/start/end — the second real document shape (`rooms: []` + `canvas: {width,height}`, so every placement is top-level).                              |

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
  toggleHole,
} from './dungeonYaml';
import { emptyCanvasYaml, DEFAULT_CANVAS } from './creation/emptyCanvasDoc';

const OUT_DIR = resolve(__dirname, 'specimens');

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

    // v0.2: a placement lacking blocks_movement/blocks_los entirely
    // (cleared right back off after placeItem's own auto-stamp) --
    // exercises clearPlacementFlag AND gives `defaults:` below a REAL
    // instance to inherit blocks_movement onto, materialized on strip.
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

    toggleHole(cst, 10, 4);

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
    // v0.2 (#688): height decoupled from mount -- a FLOOR-standing
    // placement (no mount: key at all) carrying its own height, the
    // "floating candle" case the decoupling exists for.
    setPlacementHeight(cst, null, 1, 0.4);

    setConnectorLocked(cst, 0, { dc: 14, ability: 'dex' });
    // second connector stays unlocked (locked: null) -- proves elision.

    setStart(cst, [1, 3]);
    setEnd(cst, [4, 5]);
    setLightingAmbient(cst, 0.35);

    // v0.2: defaults: map (this PR). Two different shapes on purpose --
    // see this file's changelog entry above for the full explanation of
    // what each one demonstrates (materialize-on-strip vs plain drop).
    setRefDefault(cst, 'dnd5e:props:tomb-open', 'blocksMovement', true);
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'height', 1.0);

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
});
```

When the next version adds new fields (e.g. v0.2's height-decouples-
from-mount, or a `defaults:` map prototype), extend the script above
with new mutator calls exercising them, add a "Regions section" example
if #180 ever gains a real mutator (today it's proposed-shape-only, not
emitted — see the rpg-project#175 comment), and re-run.
