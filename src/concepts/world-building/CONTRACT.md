# World Building Concept contract

Issue: [KirkDiggler/rpg-dnd5e-web#935](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/935)  
Parent journey: [KirkDiggler/rpg-project#169](https://github.com/KirkDiggler/rpg-project/issues/169)

## Boundary

This is a durable, development-only Concepts Lab at `?concept=world-building`.
It proves a local scene-composition loop for DMs and streamers; it does not
promote a new production authoring format. It makes no server calls, changes no
live `/author` or encounter path, and changes no dungeon YAML, API, proto, or
toolkit behavior.

The first-run scene is blank and the author-created arrangement library is
empty. Hex lines use the shared hex math and are visible only as scale/planning
references. They are not placement slots.

## Proved behavior

The concept currently provides:

- continuous X/Z world placement on a finite floor, including sub-hex positions,
  overlaps, and more than one object in the same visual hex;
- real catalog-backed props, rendered by the shared `PropModel` rather than a
  concept-only imitation;
- direct surface placement: while placing a prop, pointer intersections are
  taken from an upward-facing triangle of an eligible loaded support model.
  The handler exists only inside the successfully loaded `PropModel` subtree;
  loading/error fallbacks and selection geometry cannot author a support. The
  authored Y is the actual mesh intersection and `supportId` is recorded
  automatically;
- additive individual or group selection, pointer drag, 15-degree rotation,
  10-cm nudge, group/ungroup, duplicate, delete, undo, redo, and keyboard
  shortcuts;
- relationship-aware transforms: moving or rotating a support/group carries
  its descendants, while selecting a descendant edits it independently. One
  rotation uses the union closure of the distinct top-level selected roots,
  rotates every included entity exactly once from the original scene around
  their common pivot, and matches Three.js positive-Y yaw;
- named arrangements saved from a selection closure. Arrangement X/Z is local
  to the saved root pivot while Y stays floor-relative, so grouped tables and
  decorations at unequal heights validate, reopen, and stamp without flattening
  or negative local heights. Each stamp deep-copies the template, creates fresh
  identities, remaps internal group/support links, and has no linked-template
  or sibling propagation;
- versioned scene and arrangement-library JSON import/export and independent
  local-storage auto-save. Parse/write failures are visible and do not replace
  the valid in-memory scene/library or a prior good stored payload;
- a confirmed blank-scene action. There is no silent reset.

Undo retains the newest 80 committed snapshots. Copying only part of a
relationship retains internal links but deliberately drops references to an
external group/support; for example, duplicating or saving a candle without its
table creates a detached copy at the same floor-relative height.

The real-browser forcing case built a torture table with candles and books,
saved it as `Decorated table`, stamped it twice, edited one stamped candle,
proved the sibling and library template unchanged, reloaded the whole page,
continued editing, and moved/rotated the original supporting table. Both
attached decorations followed. The same run exercised duplicate, delete,
undo, and redo through the visible controls.

## Provisional local JSON

Two independent envelopes are stored/exported:

```text
SceneEnvelope {
  kind: "rpg-world-building-scene"
  version: 1
  scene: WorldScene {
    version: 1
    id, name
    items: WorldProp[]
    groups: WorldGroup[]
  }
}

WorldProp {
  id
  kind: "prop"
  assetRef                    // must exist in PROP_KEYS
  label
  transform: { x, y, z, rotationY }
  parentId?                   // group identity
  supportId?                  // prop identity
}

WorldGroup {
  id
  kind: "group"
  label
  transform: { x, y, z, rotationY }
  parentId?
}

LibraryEnvelope {
  kind: "rpg-world-building-library"
  version: 1
  library: {
    version: 1
    arrangements: Arrangement[] {
      version: 1
      id, name, createdAt
      items: WorldProp[]      // X/Z-pivot-local, floor-relative-Y copies
      groups: WorldGroup[]
    }
  }
}
```

Bounds are deliberately finite: X/Z `[-12, 12]`, Y `[0, 8]`, at most 200
props and 80 groups per scene/arrangement, at most 40 arrangements, strings up
to their field-specific limits, rotations within `[-100π, 100π]`, and imported
JSON up to 500,000 characters. Parsers reject malformed/wrong-version
envelopes, non-finite or out-of-range transforms, duplicate identities,
unknown asset refs (including arbitrary URLs), missing/invalid relation
targets, and relation cycles. Editor commits pass through the same scene
validator.

Local-storage keys are:

- `rpg.concepts.world-building.scene.v1`
- `rpg.concepts.world-building.library.v1`

These shapes are concept-owned and provisional. An exported file is portable
between copies of this concept with the referenced catalog assets available; it
is not a playable dungeon payload.

## Delta from today's dungeon authoring wire

The live builder's `PlacementDoc` in `src/author/dungeonYaml.ts` is still an
axial-cell placement (`ref`, `at`) with optional compass `facing` and a bounded
within-cell visual `offset`. `placeAt` intentionally keeps one placement per
cell and replaces an occupied cell. That contract has no arrangement library,
group identity, support attachment, arbitrary continuous yaw, or many
independent overlapping placements in one cell.

This concept does not reinterpret or alter those rules. Its stable identities,
continuous transforms, groups, and support links are the measured consumer
delta only; this document does not request a proto/backend change or choose a
promotion shape.

## Shared renderer and asset receipt

`PropModel` retains its default `source-origin` behavior for every existing game
caller. The concept opts into `bounds-floor-center`, measured from the loaded
mesh, to center the visible bounds and rest their base on the dungeon surface.
The shared Synty scale, companion meshes (including the candle particle
companion), material handling, and GLTF loading remain owned by `PropModel`.
Selection bounds are measured from the primary variant; placement itself rays
against the real visible meshes.

For browser verification only, the existing synced root `props` and `env`
runtime directories were copied into the ignored, real (non-symlink) worktree
path `public/models/synty`. This path resolves inside the recovery worktree,
contains 110 prop GLBs, passes nested `git check-ignore`, and has zero tracked
files. All licensed assets remain untracked. Browser responses for the table,
candles, candle companion, and books were HTTP 200. Receipts from the synced
root and local copies match:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `SM_Prop_Toture_StretchTable_01.glb` | `d3481dd7e200056f695462dd97b40716dc63516d7d517151626d4c6f45853264` |
| `SM_Prop_Candles_01.glb`             | `87393fcc2bb684dfc3b5f9cac70e0084065824b058ed6bc2813c05cf632c7c8a` |
| `SM_Prop_Candles_01_Particle.glb`    | `7e24f8d201b5543442b1dffcb747377057ea5d732a1bed1d79b5180124c457ef` |
| `SM_Prop_Book_Pile_01.glb`           | `a8eba6d2c04e7e6848ea483b7578220a5d528780e87598b4bc9d088cb4abb49c` |
| provider `props/manifest.json`       | `0ed3d521aad6d721a9fd4394cc041c6a431e65fb62108248f4b454cd0007a487` |

## Verification evidence

The reviewed implementation head had 34 focused and 5,314 full passing tests.
Fix-stage TDD and final evidence expanded that coverage:

```bash
npm test -- --run \
  src/concepts/world-building/sceneState.test.ts \
  src/concepts/world-building/serialization.test.ts \
  src/concepts/world-building/WorldBuildingConcept.test.tsx \
  src/concepts/world-building/WorldBuildingViewport.test.tsx \
  src/components/hex-grid/PropModel.test.tsx
# 5 files, 48 tests passed

npm run typecheck
npx prettier --check <9 fix-stage paths>
npx eslint <8 fix-stage TypeScript paths>
# passed

npm run build
# 3,546 modules transformed; passed (expected chunk-size warning)

npm test -- --run
# 372 files passed, 1 skipped; 5,328 tests passed, 5 skipped

npm run ci-check
# format, lint, typecheck, build guards, and full tests passed
```

The first recovery full-suite attempt reported eight failures. Three exposed a
candidate regression: the optional anchor had inserted a wrapper into the
default `PropModel` hierarchy. Default `source-origin` now renders the exact
prior hierarchy, with a focused regression assertion. The other five were
caused by making the whole ignored Synty root a symlink, which Git publication
tests correctly refuse to traverse. Replacing it with the ignored real local
copy described above fixed the environment. The seven formerly failing files
then passed 111/111 tests, followed by the full green run recorded above.

The component tests mock only the WebGL viewport boundary. State and
serialization tests separately prove continuous/overlapping positions,
Three.js-handed relationship rotation (including overlapping multi-root
closures), collision-safe identity remapping, X/Z-local/floor-relative-Y
arrangements, the 80-entry snapshot-history cap, strict catalog-bound parsing,
round trips, and non-destructive corrupt storage/import handling. Focused R3F
viewport tests prove only the confirmed loaded `PropModel` subtree can author a
support; loading/error fallbacks and generated selection overlays cannot.

Real R3F/GLB evidence was run with Google Chrome through Playwright at
`http://127.0.0.1:3018/?concept=world-building`. The reusable managed evidence
script and complete JSON event/transform receipt are outside Git at:

```text
/home/kirk/.pi/agent/sessions/--home-kirk-game-dev--/subagent-artifacts/outputs/
67420b71-520b-4297-b400-99dc441c62ad/world-building/evidence/
```

Notable measured browser facts:

- the support reported `Real models loaded 1/1` before surface authoring;
  table/candles/books then reported `3/3`, and actual loaded-table triangles
  authored candle Y `0.9685438682` and books Y `1.2338218388`, both with the
  table's identity as `supportId`;
- grouping those three unequal-height entities, saving, stamping twice, and
  reloading preserved heights plus remapped group/support identities; editing
  the first stamped candle left its sibling and library template byte-for-byte
  unchanged;
- table translation and `π/12` rotation matched an independent
  `THREE.Vector3.applyAxisAngle` calculation. The before/after images visibly
  show the real rotated table with both decorations still resting on it, while
  the sibling stamp remained unchanged;
- saving only the unequal-height candle/books dropped their external group and
  support links, stamped both at unchanged heights, allowed an independent
  edit, and reopened with 11 real models loaded and both arrangements intact;
- left-drag camera evidence was pixel-identical before/after; right-drag
  changed the rendered camera view, matching the visible instructions;
- there were zero console errors, page errors, failed requests, non-200 model
  responses, or GLTF loader errors. `ConceptsView` lives inside `App`, whose
  unrelated lobby/race/class/background hooks still start without a local game
  server; the evidence harness records those exact endpoints and answers them
  with a valid empty gRPC-web frame so they cannot contaminate this concept's
  network/error result. No World Building operation calls an API.

Final repository-wide format/lint/build/test command results are recorded in the
implementation checklist and delivery report after they run on the candidate
head.

## Remaining limits

- Persistence is browser-local only: no campaign wiring, backend promotion,
  collaboration, sharing, ACLs, or marketplace behavior.
- Surface eligibility is a concept-local catalog hint and placement accepts
  upward-facing triangles only. There is no wall snapping, physics, collision
  avoidance, or semantic surface metadata from a provider.
- Attachments are authored relations propagated by editor operations, not a
  runtime constraint solver. An author may intentionally edit an attached
  child away from its support while retaining the relation.
- No scale/numeric gizmo, advanced precision controls, floor painting, wall
  construction, behavior/quest wiring, or linked-prefab overrides exist.
- The finite limits above are concept safety bounds, not proposed server limits.
- The catalog can only reference locally synced `PROP_KEYS`; missing licensed
  assets cannot be embedded in exports and are not committed here.
