# Composition rendering contract

`CompositionModel` renders one immutable composition snapshot at one placement.
Callers must provide the placement's `instanceId`; it is intentionally distinct
from `composition.id`, because multiple placements can reference the same
snapshot and move, rotate, or be removed independently.

Loading and error presentation remain caller-owned, matching existing
`PropModel` use. Wrap **each complete `CompositionModel`** in its own
`Suspense`/`ErrorBoundary` pair:

```tsx
<Suspense fallback={<group name={`composition-loading-${instanceId}`} />}>
  <ErrorBoundary fallback={<group name={`composition-error-${instanceId}`} />}>
    <CompositionModel
      composition={composition}
      instanceId={instanceId}
      transform={transform}
    />
  </ErrorBoundary>
</Suspense>
```

Inside an R3F canvas, both fallbacks must be R3F-safe elements (for example, a
`group` or existing scene placeholder), not the boundary's default DOM UI. The
boundary surrounds the component itself—not only its `PropModel` leaves—so it
also contains JSON decode and prop-resolution errors. Suspense contains pending
GLB loads, while the error boundary contains rejected loads. Keep one pair per
placement; do not add boundaries per leaf or hidden global handling.

## Phase B handoff

When the reserved builder, preview, and play paths are handed off, each path
must:

1. Preserve and pass the placed prop's required instance ID separately from its
   referenced Composition ID.
2. Put the whole `CompositionModel` inside that placement's existing or minimal
   caller-owned Suspense/ErrorBoundary presentation, reusing existing loading
   and error UI/state rather than duplicating it per part.
3. Resolve compositions by WorldID plus Composition ID. Keep
   `JsonCompositionAdapter` an explicit development source, never an RPC
   failure fallback.

Phase B routes `composition:props:<Composition.ID>` through the existing opaque
placement `ref`. The separately authored `place[].id` remains the placement
identity, while WorldID comes only from the injected `CompositionSource`.

Optional `WorldProp.pointLight` declarations render through the same point-light
leaf in the composer, `CompositionModel` (including thumbnail capture), and the
dungeon environment. Offset/range are existing scene-coordinate units;
intensity is only a renderer control. A dungeon environment resolves each
unique snapshot once, projects each placement/part identity independently, and
combines these sources with dungeon sources before applying the existing
12-light nearest-view budget. Composer and standalone/thumbnail renders apply
that same maximum nearest the current composition origin, not their camera.
Authored point lights illuminate rendered meshes but do not add the crypt's
separate floor-pool treatment. Emission is never inferred from an asset ref.
The Add control ships with offset `(0, 0.5, 0)`, color `#ff9d52`, intensity
`1.1`, and range `2.6`; browser evidence may show deliberately edited values.

The temporary JSON verification source is deliberately opt-in:

```bash
VITE_ENABLE_DEVELOPMENT_COMPOSITIONS=1 npm run dev -- --port 3031 --strictPort
```

It exists only in Vite development mode, owns the clearly named
`development-world-web951-compositions` context, and contains the unchanged
`decorated-table.scene.json` specimen. Missing sources, reader failures, and
missing snapshots remain visible per placement; none triggers a fixture or RPC
fallback. Production still needs composition RPC wiring before it can supply a
real `CompositionSource`.
