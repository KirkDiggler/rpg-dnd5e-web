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
- drag-to-add without a sticky placement mode: a private bounded HTML drag
  payload carries only a catalog ref or current-library arrangement id. A
  valid prop drop on the finite ground creates one selected prop and opens the
  Move tool. Palette/canvas clicks never add or arm placement; malformed,
  external, off-canvas, unknown-ref, and canceled drops leave scene/history
  untouched;
- direct surface drops: the drop ray seeks an upward-facing triangle beneath a
  successfully loaded, catalog-eligible `PropModel` subtree. Loading/error
  fallbacks, transparent selection hitboxes, selection wireframes, hex lines,
  drop previews, and transform gizmos cannot author a support. The authored Y
  is the exact real-mesh intersection and `supportId` is recorded
  automatically;
- always-visible Select / Move / Rotate tools. Left click selects only and
  Shift-left extends selection (including a decoration overlapping its
  selected support). Move uses Three/Drei `TransformControls` X/Y/Z axes and
  plane handles; Rotate exposes only its Y ring, matching the upright-yaw
  schema. There is no implicit whole-object left drag;
- one transform transaction per handle drag: object transforms preview from an
  immutable drag-start scene without history/local-storage writes, pointer
  release validates and commits one snapshot, and Esc/right-click restores the
  drag start. Invalid final transforms reject non-destructively. Pointercancel,
  deferred lost-capture handling, unmount, tool changes, and selection changes
  clear preview/control ownership rather than stranding the camera;
- Blender-style camera ownership through Three/Drei `OrbitControls`: middle
  drag orbits, Shift-middle drag pans, and the wheel zooms. Left/Shift-left is
  reserved for selection/gizmos and right-click is reserved for cancellation;
  camera gestures do not select or mutate scene data, and handle gestures do
  not move the camera;
- group/ungroup, duplicate, delete, undo, redo, and coherent keyboard
  shortcuts (including plain `R`, while Ctrl/Cmd/Alt+R remains browser-owned);
- relationship-aware transforms: moving or rotating a support/group carries
  its descendants, while selecting a descendant edits it independently. One
  rotation uses the union closure of the distinct top-level selected roots,
  rotates every included entity exactly once from the original scene around
  their common pivot, and matches Three.js positive-Y yaw;
- named arrangements saved from a selection closure. Arrangement X/Z is local
  to the saved root pivot while Y stays floor-relative, so grouped tables and
  decorations at unequal heights validate, reopen, and drag-stamp on the ground
  without flattening or negative local heights. Each drop creates one
  independent stamp, deep-copies the template, creates fresh identities,
  remaps internal group/support links, and has no linked-template or sibling
  propagation. The UI truthfully says arrangements stamp on ground; it does not
  imply arbitrary tabletop arrangement anchors;
- versioned scene and arrangement-library JSON import/export and independent
  local-storage auto-save. Parse/write failures are visible and do not replace
  the valid in-memory scene/library or a prior good stored payload;
- a confirmed blank-scene action. There is no silent reset.

Undo retains the newest 80 committed snapshots. Copying only part of a
relationship retains internal links but deliberately drops references to an
external group/support; for example, duplicating or saving a candle without its
table creates a detached copy at the same floor-relative height.

The current real-browser forcing case dragged a torture table onto the ground
and candles onto its loaded mesh, selected through actual canvas clicks,
exercised real TransformControls axis/plane/ring pickers, canceled previews with
Esc/right-click, rejected an invalid Y transform, and undid one committed drag
with one Undo. It then moved a grouped table/support closure, drag-stamped its
arrangement twice with fresh remapped identities, exercised Blender-style
camera gestures, and reloaded exact scene/library data. The complete receipt is
under the current evidence path in Verification evidence.

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
Selection bounds are measured from the primary variant; support drops ray
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

TDD coverage for this interaction pass adds bounded HTML drag payload parsing,
valid/no-op drop creation, visible tool state, transform preview/commit/cancel
semantics, relationship-preserving proxy math, surface eligibility, overlapping
support-child selection, and explicit pointer ownership. Verification on the
candidate included:

```bash
npm test -- --run \
  src/concepts/world-building/sceneState.test.ts \
  src/concepts/world-building/serialization.test.ts \
  src/concepts/world-building/worldBuildingDrag.test.ts \
  src/concepts/world-building/WorldBuildingInteraction.test.ts \
  src/concepts/world-building/WorldBuildingConcept.test.tsx \
  src/concepts/world-building/WorldBuildingViewport.test.tsx \
  src/components/hex-grid/PropModel.test.tsx
# 7 files, 66 tests passed

npx prettier --check <15 scoped paths>
npx eslint <11 scoped TypeScript paths>
npm run typecheck
# passed

npm run build
# 3,549 modules transformed; passed (expected chunk-size warning)

npm test -- --run
# 374 files passed, 1 skipped; 5,346 tests passed, 5 skipped

npm run ci-check
# format, lint, typecheck, build guards, and full tests passed
```

Real R3F/GLB evidence ran in a fresh isolated Google Chrome context at
`http://127.0.0.1:3018/?concept=world-building`. The reusable script, complete
JSON receipt, logs, and screenshots are outside Git at:

```text
/home/kirk/.pi/agent/sessions/--home-kirk-game-dev--/subagent-artifacts/outputs/
86d92fc3-5b35-400f-924a-f3f4d12fd4bc/world-building/evidence/
```

The gesture harness drives the actual HTML `DataTransfer` path and the installed
Drei controls; it does not call editor callbacks or mock the models/editor.
Notable measured facts from `browser-evidence.json`:

- ordinary palette/library/canvas clicks, external text, malformed private
  payloads, and an arbitrary URL left items/history untouched. A real palette
  drag created one selected table; a second real drag hit its loaded triangles,
  authored candle Y `1.0171206342919583`, and stored the table `supportId`;
- actual canvas left-click selected the table and Shift-left selected its
  overlapping candle without losing the table. Empty-ground left-click cleared
  selection but did not author data;
- actual TransformControls X-axis and XZ-plane drags continuously previewed with
  zero storage writes. Esc and right-click restored the drag start; a forced
  negative-Y release was rejected and restored. A valid X drag committed once,
  moved the table and supported candle by the same `1.058167802010371`, left the
  camera unchanged, and one Undo restored it;
- the actual Rotate control exposed and dragged the Y ring, committing yaw
  `1.2249010673966143` to the relationship closure; one Undo restored the prior
  snapshot. No X/Z tilt or scale path is present;
- a grouped table/candle moved through one common gizmo without double-moving
  the child. Dragging the saved arrangement twice produced fresh group/prop
  identities, remapped support ids, retained floor-relative heights `[0,
1.0171206342919583]`, and left the template/sibling stamps independent;
- real middle-drag changed camera position without changing target/data/
  selection; real Shift-middle changed the target; wheel changed zoom. Right
  drag produced no orbit (only `0.0009002` residual damping drift), and the
  earlier handle drag left the exact camera receipt unchanged;
- save/reload round-tripped 6 items, 3 groups, and 1 arrangement exactly, then
  reopened in Select. All six real models loaded. There were zero console
  errors, page errors, failed requests, non-200 model responses, or GLTF errors.
  The harness returns valid empty gRPC-web responses only to unrelated App hooks
  and records them separately; World Building makes no API request.

## Remaining limits

- Persistence is browser-local only: no campaign wiring, backend promotion,
  collaboration, sharing, ACLs, or marketplace behavior.
- Surface eligibility is a concept-local catalog hint and surface drops accept
  upward-facing triangles only. There is no wall snapping, physics, collision
  avoidance, or semantic surface metadata from a provider.
- Attachments are authored relations propagated by editor operations, not a
  runtime constraint solver. An author may intentionally edit an attached
  child away from its support while retaining the relation.
- No scale, full tilt, numeric gizmo, advanced precision controls, floor painting, wall
  construction, behavior/quest wiring, or linked-prefab overrides exist.
- The finite limits above are concept safety bounds, not proposed server limits.
- The catalog can only reference locally synced `PROP_KEYS`; missing licensed
  assets cannot be embedded in exports and are not committed here.
