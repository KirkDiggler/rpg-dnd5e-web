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
  taken from an upward-facing triangle of an eligible loaded support model;
  the selection bounding box is not in the placement ray path. The authored Y
  is the actual mesh intersection and `supportId` is recorded automatically;
- additive individual or group selection, pointer drag, 15-degree rotation,
  10-cm nudge, group/ungroup, duplicate, delete, undo, redo, and keyboard
  shortcuts;
- relationship-aware transforms: moving or rotating a support/group carries
  its descendants, while selecting a descendant edits it independently;
- named arrangements saved from a selection closure. Each stamp deep-copies the
  template, creates fresh identities, remaps internal group/support links, and
  has no linked-template or sibling propagation;
- versioned scene and arrangement-library JSON import/export and independent
  local-storage auto-save. Parse/write failures are visible and do not replace
  the valid in-memory scene/library or a prior good stored payload;
- a confirmed blank-scene action. There is no silent reset.

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
      items: WorldProp[]      // local-space template copies
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

For browser verification only, the ignored worktree path
`public/models/synty` was linked to the existing synced root runtime assets and
resolved to `/home/kirk/game-dev/rpg-dnd5e-web/public/models/synty`. The link and
all licensed assets remain untracked. Browser responses for the table,
candles, candle companion, and books were HTTP 200. Receipts:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `SM_Prop_Toture_StretchTable_01.glb` | `d3481dd7e200056f695462dd97b40716dc63516d7d517151626d4c6f45853264` |
| `SM_Prop_Candles_01.glb`             | `87393fcc2bb684dfc3b5f9cac70e0084065824b058ed6bc2813c05cf632c7c8a` |
| `SM_Prop_Candles_01_Particle.glb`    | `7e24f8d201b5543442b1dffcb747377057ea5d732a1bed1d79b5180124c457ef` |
| `SM_Prop_Book_Pile_01.glb`           | `a8eba6d2c04e7e6848ea483b7578220a5d528780e87598b4bc9d088cb4abb49c` |
| provider `props/manifest.json`       | `0ed3d521aad6d721a9fd4394cc041c6a431e65fb62108248f4b454cd0007a487` |

## Verification evidence

Focused automated evidence:

```bash
npm test -- --run \
  src/concepts/world-building/sceneState.test.ts \
  src/concepts/world-building/serialization.test.ts \
  src/concepts/world-building/WorldBuildingConcept.test.tsx \
  src/components/hex-grid/PropModel.test.tsx
# 4 files, 34 tests passed

npm run typecheck
# passed
```

The component tests mock only the WebGL viewport boundary. State and
serialization tests separately prove continuous/overlapping positions,
relationship propagation, collision-safe identity remapping, snapshot history,
strict catalog-bound parsing, round trips, and non-destructive corrupt
storage/import handling.

Real R3F/GLB evidence was run with Google Chrome through Playwright at
`http://127.0.0.1:3018/?concept=world-building`. The reusable managed evidence
script and complete JSON event/transform receipt are outside Git at:

```text
/home/kirk/.pi/agent/sessions/--home-kirk-game-dev--/subagent-artifacts/outputs/
62a815a5-9728-48a0-8af5-74aec6d1c02d/world-building/evidence/
```

Notable measured browser facts:

- table/candles/books reported `Real models loaded 3/3`; after two stamps and a
  full reload, `9/9`;
- the actual table mesh intersections authored candle Y `0.9685438682` and
  books Y `1.2338218388`, both with the table's identity as `supportId`;
- both stamps had three fresh IDs and internally remapped support identities;
- nudging the first stamped candle by `+0.1` X left the second stamp and saved
  library transform byte-for-byte unchanged;
- reloading retained nine editable items and one arrangement;
- table translation and `π/12` rotation moved both attached decorations around
  the table pivot while the sibling stamp remained unchanged;
- left-drag camera evidence was pixel-identical before/after; right-drag
  changed the rendered camera view, matching the visible instructions;
- there were no page errors, failed prop-model requests, non-200 model
  responses, or GLTF loader errors during authoring/reload. The no-API local
  startup still logs the app's pre-existing `localhost:8080` hook failures;
  the complete log preserves those rather than hiding them.

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
