# Encounter Studio authoring regions

## What this is

[Web #1245](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1245) and the
[design law](design.md) describe a scene-owned area definition linked to a room
label. It reuses authored wall sources, map-label anchors, workspace cells and
the canonical Studio document/history. It introduces no second gameplay region,
floor owner, visibility authority or saved derived polygon. This walkthrough
covers the definition, geometry, owner, Layout and optional visual-light
projection and owned real-surface renderer seams (R13–R14). Provider carriage and gameplay behavior are separate contracts.

## Component shape

```mermaid
flowchart LR
  subgraph WB[Web world-building]
    T[types.ts WorldScene and MapLabel] --> A[authoringRegions.ts definitions]
    C[serialization.ts / roomDraft.ts codec] --> O[WorldBuildingConcept document owner]
    A --> G[regionBoundaryGeometry.ts pure projection]
    W[room.walls sources] --> G
    O --> G
    A --> F[regionLighting.ts configured resolved projection]
    G --> F
    F --> VP[WorldBuildingViewport roomAuthoring.regionLighting]
    VP --> SF[regionLightingGeometry / spatialBackgroundField]
    SF --> GPU[RegionLightingSurfaceProvider scene-local textures/uniforms]
    GPU --> MAT[regionLightingMaterials / useRememberedModelTint]
    MAT --> LEAF[Floor / prop / wall / fitted door surfaces]
    E[regionEdits.ts immutable intents] -->|RoomDraft| O
    O -->|RoomDraftDocument| C
  end
  subgraph Studio[Web encounter-studio]
    G -->|RegionResolution| V[RegionBoundaryOverlay Layout projection]
    O -->|studioSession linked-label projection| U[LayoutViewport / StudioArrangePanel controls]
    U -->|boolean owner intents| E
    V --> U
  end
```

## Ownership and contracts

| Component                                                       | Owns                                                                                  | Input → output                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                      | `WorldScene.version`, optional definitions; `MapLabel.text/location`                  | Scene3/4 → `AuthoringRegion[]` linked by `labelId`; scene4 optional `lighting`                                                        |
| `authoringRegions.ts`                                           | Definition grammar and copy-only witness comparison                                   | Unknown intent + `MapLabel[]` + optional workspace/reserved IDs → validated `AuthoringRegion[]`; `EnclosureWitness` → comparison copy |
| `serialization.ts`, `roomDraft.ts`, `workspaceContentBounds.ts` | Persisted shape/size and protected workspace content                                  | `RoomDraftDocument` → validated document / JSON; invalid data → refusal                                                               |
| `regionBoundaryPredicates.ts`                                   | Certified geometric classifications                                                   | Authored X/Z inputs → certified relation or uncertainty                                                                               |
| `regionBoundaryGeometry.ts`                                     | Transient face and conflict resolution                                                | `Readonly<RoomDraft>` → `RegionResolution[]`; draft + `WorldPoint` → certified ring/witness or unresolved reason                      |
| `regionLighting.ts`                                             | Current configured/resolved visual extents                                            | `AuthoringRegion[]` + `RegionResolution[]` → `RegionLightingProjection`                                                               |
| `regionEdits.ts`                                                | Immutable explicit boundary and visual intents                                        | Draft + create/bind/paint/pair-delete/lighting arguments → `RoomDraft` or refusal; equal intent → original reference                  |
| `WorldBuildingConcept.tsx` with region intents                  | Canonical document/history and intent fences                                          | Region intent → boolean acceptance and one document transaction                                                                       |
| `studioSession.ts` with optional linked-label projection        | Read-only owner seam                                                                  | Existing `{kind:'label',id}` selection → optional region/resolution and owner intents                                                 |
| `RegionBoundaryOverlay.tsx` and Layout/Arrange controls         | Visible boundary, unresolved explanation, initiating gesture                          | Projections → Layout display; explicit gesture → owner intent                                                                         |
| `regionLightingGeometry.ts`, `spatialBackgroundField.ts`        | Transient triangulation and 64×64 candidate index                                     | `RegionLightingProjection` → world-XZ triangles, head/count and candidate arrays; invalid GPU geometry → refusal                      |
| `RegionLightingSurfaceProvider.tsx`                             | Scene-local textures, stable uniforms, scoped shader-error callback                   | Projection + existing selected `RenderablePointLight[]` → optional material binding; empty/failed field → baseline                    |
| `regionLightingMaterials.ts`, `useRememberedModelTint.ts`       | Checked Standard/Physical and workspace-Basic hooks; one per-instance treatment owner | Source material + optional binding → owned clones / diagnosed refusal; cleanup restores source without disposing maps/geometry        |
| Real floor/prop/wall/door leaves                                | Current rendered transforms and optional binding threading                            | Current parent/leaf matrices → fragment world position; guides/actors/markers excluded                                                |

The definition validator does not look up faces or prune missing wall references.
The codec does not bind witnesses, upgrade scenes on load or relax policy gates.
The predicate/geometry pair does not weld nearby endpoints or persist a ring.
The immutable intent layer does not mutate floor, props, bindings or scope.
The owner does not acquire boundaries during render or wall commits.
The Studio seam does not own a second document or selected-region store.
The lighting projection does not infer floor membership, acquire boundaries or
retain a last-good area. The viewport consumes committed owner projection, not
boundary gesture previews. The Layout renderer does not make game rules or
visibility claims.

## Walk one thing through

A kitchen room label is a `MapLabel` named `kitchen-label` with anchor `{x:2,z:1}`.
The explicit create-room-label intent pairs it with region `kitchen-region`.
For walls A `(0,0)→(4,0)`, B `(4,0)→(2,4)`, C `(2,4)→(0,0)`, certified
acquisition produces the CCW `EnclosureWitness` `[A+,B+,C+]`. Here `+` means the
actual `BoundaryRun.direction: 'start-to-end'`, not a saved coordinate.

The owner accepts a single `RoomDraftDocument` with scene3. The codec carries
that oriented source word and the label link; it adds no polygon. Pure
resolution derives a `RegionResolution` with `area.kind:'polygon'` for Layout.
The region identity survives every hop; the ring is derived and disposable.

Moving the apex to `(2,5)` can preserve that word while changing the derived
ring. Moving the label outside it yields an explanation, not a replacement
witness. If creation cannot certify an enclosure, the saved automatic boundary
has no witness. Closing walls later does not bind it; the author pays one
explicit **Use enclosing walls** action (R3). This is the difference between
repairing accepted intent and adopting a new area silently.

A label-edit with `regionLighting: {regionId: 'kitchen-region', value:
{background: 0.15}}` updates that pair through `setRegionLighting` and opts the
scene in to scene4. `null` deletes lighting without demotion; omission leaves it
untouched. The owner checks captured and current linked identities, composes
with any explicit text/location in the complete current document and commits
once. Lighting alone retains editable unfinished policies; explicitly supplied
label fields, even equal values, still require the strict gate (R13).

`projectRegionLighting` joins the persisted region ID/settings with the owner's
existing current resolution. Its `areas` entry carries the same region ID,
background `0.15` and transient polygon/hex union. The Studio viewport seam receives
this projection only. An unresolved kitchen retains `0.15` but supplies no area.
Authored `1` supplies an entry, whereas absence supplies none: the renderer can
preserve the legacy baseline outside configured regions without confusing it
with an explicit visual choice. No derived extent enters JSON/YAML or snapshots.

The viewport converts the kitchen polygon directly; explicit cell unions fan
actual workspace hex corners, leaving sparse gaps empty. Three triangulates
concave single rings. A 64×64 index stores conservative triangle AABBs as
candidate lists; each fragment still tests the indexed triangles rather than
a raster brightness texel. Closed triangle seams reduce with `min`, not repeated
multiplication. Float32 GPU coordinates are rendering precision, not a stronger
source-geometry certificate (R14).

The provider packs nearest/no-color-space float textures after hardware-capacity
checks. It updates stable holders and invalidates only on projection/selected-list
changes. A swinging fitted door and its post-layout cap courses sample their
actual transformed positions; moving a long prop changes its split without
rebuilding region geometry. The existing material owner clones each distinct
source per treatment, composes memory first, restores before disposal and tracks
weak source provenance for courses cloned while a treatment is installed. The
GLTF cache remains untouched.

Lit materials scale directional and indirect illumination before the corresponding
Three render equations, leaving selected point lights, emission, maps, shadows
and physical local-direct terms alone. The Basic underlay retains its existing
texture/tint/tone-mapping behavior. Inside configured areas it adds an upward
diffuse receiver using the exact existing fixed-origin, twelve-source selection
and Three inverse-square/cutoff decay. Outside configured areas it remains the
legacy unlit output. Authored `1` opts into that receiver; absence does not. This
is a visual approximation, not occlusion or transport physics.

Unsupported materials/hooks remain original with a visible diagnostic. Build,
upload and marked shader compile failures clear the binding/resources; a scoped
Canvas callback chains and restores the prior Three callback. A fallback is not
proof that a required native surface supports lighting.

## Separations that look like one thing

| Query                                            | Source of truth                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| What is this area called, and where is its seed? | Linked `MapLabel.text/location`                                                |
| Which enclosure did the author accept?           | `AuthoringRegion.boundary.witness.walk`                                        |
| What area is currently supported?                | Pure `RegionResolution`, never serialized                                      |
| What visual background is authored?              | Optional scene4 `AuthoringRegion.lighting`, never a default                    |
| Where may that background apply now?             | `RegionLightingProjection` joining configured intent with current resolved IDs |
| Which cells have floor?                          | `room.walkableHexes`, independent of explicit region cells                     |
| Which gameplay region or visibility facts apply? | Provider-owned gameplay data, not scene authoring metadata                     |
| Is the saved document structurally/policy valid? | Existing strict codec gates, separate from geometric unresolved status         |

**An unbound definition is not a request to infer on render.** Combining intent
and projection would silently adopt a larger face after a divider disappears.
Combining floor and explicit cells would turn region repair into destructive
terrain editing. Combining unresolved status and policy validity would allow
invalid policies through an existing strict gate (R4).

## Trade-offs

| Decision                        | Benefit                                                      | Cost / boundary                                               | Not taken                                               |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| Oriented source walk            | Tracks boundary identity without a second polygon            | Author may need rebind after source endpoint reversal         | Unordered source set / saved polygon                    |
| Explicit-only acquisition       | Reload/render cannot change author intent                    | Author binds an initially open enclosure once it closes       | Effect-driven witness adoption                          |
| Conservative certificates       | Renderer receives honest unresolved explanations             | Geometry owner refuses uncertified angled/multiway cases      | Arbitrary epsilon welding                               |
| Scene3/4 opt-in                 | Codec leaves old notes/scenes alone                          | Old readers reject new metadata version                       | Silent upgrade / downgrade                              |
| Shared document transaction     | History restores label/boundary and unrelated data together  | Owner must enforce all stale-context fences                   | Separate region store                                   |
| Indexed triangles + owned hooks | Real transformed surface parts; no extra pass or raster halo | Candidate-list work, GPU precision and checked chunk coupling | Floor overlay / prop-center membership / output dimming |
| Configured-only Basic receiver  | Legacy unconfigured floor remains identical                  | Approximate upward diffuse response, not PBR/occlusion        | Converting every floor to lit PBR                       |
| No conflict winner              | Author retains both definitions                              | Author must repair overlap/duplicate-room-label conflicts     | Priority or cell theft                                  |

## Edges

A ring is planar X/Z authoring geometry, not a navigation mesh. Full wall spans
include openings regardless of door state (R2). Exact axis-collinear overlaps
are geometric coverage, not a reason to snap or rewrite source endpoints (R10).
The graph splits their union at actual endpoints/junctions, retains each span's
covering sources, and validates the raw simple face before selecting provenance.
For an overlapping maximal straight face run, exactly one source must cover the
entire run. A partial exterior extension can then leave the original side's
oriented source identity unchanged; two full-span sources remain ambiguous.
A chain with overlaps but no full-span source is conservatively refused.
Non-overlapping end-to-end sources retain their transition and witness junction.
Only same-owner/direction subdivisions disappear from the disposable display
ring. Consecutive chosen sources therefore still determine unique junctions;
overlap does not introduce a second persisted geometry or source preference.
Uncovered intervals, however small, remain gaps. Non-axis collinearity, holes,
slits, ambiguous coverage and uncertified intersection ordering have visible
refusals (R10). Explicit
cells may be empty while retaining intent (R6). Optional background intent is
visual only (R12–R13). Audio, engine discovery, light transport and provider
acceptance claims do not cross this seam. JSON/YAML codec round trips establish
Web preservation, not actual provider carriage. Room snapshots deliberately
carry the draft only, not site scope.

## Where a change lands

A new persisted boundary variant lands in `authoringRegions.ts` and its codec
consumers, not an overlay. A broader junction certificate lands in the
predicate/geometry pair and revisits R10. A clearer unresolved explanation lands
in Layout/Arrange controls consuming `RegionResolution`, without
rewriting a definition. A boundary-edit gesture lands in `regionEdits`
and owner intents, not floor mutators. A new visual setting belongs to the
optional scene grammar and guarded Arrange intent; a different current extent
belongs to pure projection, never a second saved area.

## Source map

Paths are relative to this Web repository. Layout consumers use the guarded
owner facade; none persists a resolution or mutates floor for region edits.

| Concern / symbols                                                                                                          | Path                                                                                                                                                                                                     | Scope                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `BoundaryRun`, `EnclosureWitness`, `AuthoringRegion`, `RegionLighting`, `RegionResolution`; validators and copy comparison | `src/concepts/world-building/authoringRegions.ts`                                                                                                                                                        | Schema owner                                                           |
| `WorldScene`, `MapLabel`                                                                                                   | `src/concepts/world-building/types.ts`                                                                                                                                                                   | Scene/label shape                                                      |
| `validateScene`, `validateAuthoringRegions` call                                                                           | `src/concepts/world-building/serialization.ts`                                                                                                                                                           | Scene codec                                                            |
| `validateRoomDocument`, `resizeRoomWorkspace`, full-document region identity checks                                        | `src/concepts/world-building/roomDraft.ts`                                                                                                                                                               | Document codec                                                         |
| `validateWorkspaceContent`                                                                                                 | `src/concepts/world-building/workspaceContentBounds.ts`                                                                                                                                                  | Shrink protection                                                      |
| `moveMapLabel`, `renameMapLabel`, guarded `deleteMapLabel`                                                                 | `src/concepts/world-building/mapLabelEdits.ts`                                                                                                                                                           | Label-only edits                                                       |
| `encodeSingleRoomDungeon`                                                                                                  | `src/concepts/world-building/singleRoomDungeon.ts`                                                                                                                                                       | Whole-draft source carriage, not provider proof                        |
| Certified predicates                                                                                                       | `src/concepts/world-building/regionBoundaryPredicates.ts`                                                                                                                                                | geometry owner                                                         |
| `findEnclosureAtPoint`, `resolveAuthoringRegions`                                                                          | `src/concepts/world-building/regionBoundaryGeometry.ts`                                                                                                                                                  | transient projection                                                   |
| `createRoomLabel`, `useEnclosingWalls`, `setExplicitRegionArea`, `removeRegionAndLabel`, `setRegionLighting`               | `src/concepts/world-building/regionEdits.ts`                                                                                                                                                             | immutable intent owner                                                 |
| Canonical commit and preview-ID reservation; region intents                                                                | `src/concepts/world-building/WorldBuildingConcept.tsx`                                                                                                                                                   | Existing owner, region intents                                         |
| Optional linked-label Arrange projection and intents                                                                       | `src/concepts/world-building/studioArrange.ts`, `src/concepts/encounter-studio/studioSession.ts`                                                                                                         | region seam extension                                                  |
| `projectRegionLighting`, `RegionLightingProjection`                                                                        | `src/concepts/world-building/regionLighting.ts`                                                                                                                                                          | Pure configured/resolved visual projection                             |
| Studio-only `roomAuthoring.regionLighting`                                                                                 | `src/concepts/world-building/WorldBuildingConcept.tsx`, `WorldBuildingViewport.tsx`                                                                                                                      | Owner-to-renderer projection seam                                      |
| Boundary projection                                                                                                        | `src/concepts/encounter-studio/RegionBoundaryOverlay.tsx`                                                                                                                                                | Layout-only presentation                                               |
| Gesture/status controls                                                                                                    | `src/concepts/encounter-studio/LayoutViewport.tsx`, `useStudioLabels.tsx`, `StudioArrangePanel.tsx`, `StudioArrangeFields.tsx`, `EncounterStudioWorkspace.tsx`                                           | region consumers                                                       |
| `toSpatialBackgroundAreas`                                                                                                 | `src/concepts/world-building/regionLightingGeometry.ts`                                                                                                                                                  | Polygon / exact workspace hex-corner adapter                           |
| `buildSpatialBackgroundField`, `sampleSpatialBackgroundField`                                                              | `src/rendering/spatialBackgroundField.ts`                                                                                                                                                                | Transient indexed analytic triangles                                   |
| `RegionLightingSurfaceProvider`                                                                                            | `src/rendering/RegionLightingSurfaceProvider.tsx`                                                                                                                                                        | GPU/uniform/error resource owner, not application state                |
| `cloneRegionLightingMaterial`, point uniforms and packing                                                                  | `src/rendering/regionLightingMaterials.ts`                                                                                                                                                               | Checked lit and workspace-Basic adapters                               |
| `useRememberedModelTint`                                                                                                   | `src/components/hex-grid/useRememberedModelTint.ts`                                                                                                                                                      | Single restore/dispose owner for memory + lighting                     |
| Optional `visualLighting` leaves                                                                                           | `src/components/hex-grid/PropModel.tsx`, `WorldAssetModel.tsx`; `src/concepts/world-building/WorldPropModel.tsx`, `WorkspaceFloorUnderlay.tsx`, `StructuralWallSurfaces.tsx`, `StructuralWallVisual.tsx` | Actual floor, prop/companions, fitted wall/door/caps; guides untouched |

`useStudioLabels` carries an explicit Note/Room placement choice.
`StudioArrangePanel` consumes the existing label selection with optional linked
region/resolution, displays mode/reason and submits bind/pair-delete intents.
`EncounterStudioWorkspace` stages Paint/Erase/Rectangle region mode;
`LayoutViewport` stages cell membership locally and calls
`StudioRegionEditing.setExplicitRegionArea` once on release. Escape, capture loss,
document/epoch/mode/target retirement abandon the preview. Region mode ignores
label/wall hits, never calls `commitFloor` and retires on a 3D round trip.
`MapLabelOverlay` keeps unresolved labels selectable with a warning and explanation;
`RegionBoundaryOverlay` draws only current resolved areas. These are 2D-only
projections, not lighting or visibility renderers. Studio 3D alone supplies the
optional surface binding; generic leaves default to their original materials.
