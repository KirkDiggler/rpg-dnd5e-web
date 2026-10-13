# Verify a private world-material candidate

The world-material reader consumes the provider's v1 catalog and verifies its
owned image subtree. It does not publish assets, write a generated live catalog,
change a consumer pin, or mark appearance/scale acceptance. A successful read of
a staged candidate is not a runtime release.

## Read and verify

Use the repository's installed dependencies and Node 22. Point both paths at the
same private staged bundle. Never copy licensed images into tracked Web files.

```sh
MATERIAL_CATALOG=/absolute/private/bundle/harness/catalogs/synty-world-materials.json \
MATERIAL_MODELS=/absolute/private/bundle/harness/models/synty \
node --input-type=module <<'JS'
import { readWorldMaterialCatalog } from './scripts/world-material-catalog.mjs';
const result = readWorldMaterialCatalog({
  catalogPath: process.env.MATERIAL_CATALOG,
  modelRoot: process.env.MATERIAL_MODELS,
});
console.log(result.catalogSha256);
console.log(result.materials.map(({ ref, repeatMeters }) => ({ ref, repeatMeters })));
JS
```

The reader refuses unknown fields, duplicate refs, invalid parameters,
non-content-addressed paths, symlinks, missing or undeclared material resources,
hash/size drift, inconsistent shared-image metadata and invalid PNGs. PNGs are
fully decoded with CRC checking; the provider's pixel safeguard applies before
decoding. Other runtime subtrees are not inspected or changed. The returned
records contain only consumer URLs, hashes, dimensions and material parameters.
Physical repeats stay in meters; scene-unit conversion belongs to mapping.

## Surface bindings and runtime resource ownership

The world-asset generator accepts optional provider `surfaces` declarations with
exact `id`, `node`, `material`, `side` and `family` fields. Missing declarations
remain absent. A miter capability does not imply material enrollment. Generated
asset types and rows must still be produced through the generator, not edited by
hand.

`src/rendering/worldSurfaceMaterials.ts` is the material-only renderer primitive:

1. Prepare a detached placement hierarchy and its fitted UV chart.
2. Load the selected catalog images as a complete set. Create/cache samplers by
   immutable image identity **and sampling role/channel**, using
   `createWorldSurfaceSampler`; samplers share pixels, not mutable settings.
3. Call `applyWorldSurfaceMaterials` with provider bindings and explicit
   selections. All targets/maps are checked before any material is assigned.
   Exact node/material identity can select multiple exported primitive meshes.
4. In the shared model path, pass loaded selections as `surfaceSelections` to
   `WorldPropModel` / `WorldAssetModel`. Their existing material-treatment owner
   applies the finish before remembered/lighting overlays and restores in reverse
   order on replacement/unmount. It reapplies on StrictMode setup and allocates
   nothing for suspended render attempts. Do not add a second material effect.
   Standalone callers must likewise remove overlays before `dispose()`.

The primitive changes only selected material slots and owns only its material
clones. The caller owns samplers and changed geometry. Restoring/disposal never
frees shared images, cached geometry, or the source model's materials.

This path requires the fitted derivative normal basis: no stale tangents, paired
color/normal UV channels, and identity sampler transforms. Logical normal strength
is multiplied by the authored renderer basis sign, not copied over it. A changed
chart must establish its correct basis before material application; this primitive
does not infer a room chart or prove GPU shading. Missing/incompatible selections
refuse explicitly, not as color-only success or fallback artwork.

The primitive alone adds no Studio selector, room persistence, room-loop mapping
or Play delivery. Those consumers must integrate it through the existing document
and renderer owners.

## Focused checks

```sh
npm run test:run -- \
  scripts/generateWorldAssetCatalog.test.ts \
  scripts/worldMaterialCatalog.test.ts \
  src/rendering/worldSurfaceMaterials.test.ts \
  src/components/hex-grid/WorldSurfaceModel.test.tsx \
  src/components/hex-grid/useRememberedModelTint.test.tsx
npm run typecheck
```

The selected provider bundle and actual GLB still need a consumer-path preview,
physical-scale calibration and operator appearance acceptance before publication.
