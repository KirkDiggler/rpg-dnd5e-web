# Precise prop composition Learn verdict (#728)

## What was run

Fixture-only Concepts Lab route:

```text
/?concept=prop-composition
```

The experiment reuses `DungeonPreview3D`, the shared `PropModel`/manifest path,
and the builder's existing Play camera. It does not write production YAML, call
an authoring API, or expose save/persistence. The fixture begins with the real
`dnd5e:props:bookcase` manifest model in three consecutive wall spans and replaces
the selected center entry with the real `dnd5e:props:torch-ornate` model.

The first actual-model pass was useful: preserving the bookcase's floor-level Y
verbatim made the torch mostly a light at the wall base. Re-resolving a
fixture-local 1.15 m wall-attachment height from the new asset made the actual
ornate-torch mesh read correctly.

Kirk's next visual-acceptance pass caught a second, acceptance-blocking fact:
the bookcases appeared between hexes. Measurement confirmed that the authored
roots were already the exact canonical hex centers; the source bookcase GLB's
origin is at its back/left floor corner. At the real 0.75 render scale its visible
XZ bounds center was displaced +0.927 m along the wall and +0.330 m away from it
— 53.5% of the 1.732 m distance to the next hex center. The corrected fixture now
cancels that measured pivot offset before applying any bounded authored nudge.
The visible footprint centers on its owning hex and its back sits within 4.5 cm
of the measured room-side wall face. Replacement instead resolves a distinct
torch wall anchor: same span/along-wall intent, but wall-face Z and the
fixture-local 1.15 m attachment Y. These measured numbers remain fixture-local;
this is evidence, not a global asset/placement contract.

## Selected interaction behavior

- **Nudge** is wall-local, 5 cm per action: along-wall is bounded to ±25 cm;
  toward/away is bounded to ±20 cm. Values and coordinate basis are visible.
- **Snap to span center** clears only along-wall adjustment. **Snap to wall
  clearance** clears only the wall-normal adjustment. Both return to the chosen
  asset's resolved fixture baseline, never its raw GLB origin. Each button
  previews its movement and states that neighbors are unchanged.
- **Replace** is one action on one stable selected span. It preserves the span and
  authored local nudge. It refreshes the model/variant and asset-resolved
  attachment facts. There is no delete/recreate selection loss.
- **Reset adjustment** zeros the selected placement's two fine offsets without
  undoing replacement. **Reset fixture** restores all three bookcases and the
  original center selection. This distinction was clearer than one overloaded
  reset.

## Provisional semantic fixture contract

These are semantic responsibilities, **not proposed field names**:

1. A placement has a stable identity during the authoring action.
2. Its composition intent names a wall-relative span center and facing basis.
3. It may carry a small, bounded local adjustment along and normal to that wall.
4. Its selected asset resolves intrinsic model/variant and visual attachment
   baseline; this fixture's measured baselines are provisional evidence only.
5. Replacement keeps items 1–3 and re-resolves item 4 from the new asset, so a
   wall torch does not inherit a floor bookcase's raw-root position.

The local implementation names these ideas `slotId`, `alongWallMeters`, and
`towardWallMeters` only to run the fixture. Those names and the local state shape
must not be copied into YAML/protos without a separate contract decision.

## Ownership matrix

| Fact | Learned owner | Replacement behavior | Confidence / caveat |
| --- | --- | --- | --- |
| GLB geometry, intrinsic pivot/origin, calibrated shared render scale, deterministic manifest variant | asset/model contract | refresh from new asset | High for geometry/scale ownership; `PropModel` currently renders the raw pivot, so this fixture normalizes the measured bounds locally rather than claiming a global default |
| Footprint and light-source behavior | asset/model contract | refresh from new asset | High; bookcase and torch intentionally differ |
| Wall-attachment vertical anchor / model-forward correction | asset/model contract candidate | refresh from new asset | Medium; 1.15 m made this actual torch read correctly here, but is **fixture-local evidence**, not yet a global torch default |
| Chosen wall/span and centered composition intent | per-placement authored intent | preserve | High; otherwise replacement cannot stay in the vacated span |
| Wall-relative facing basis | per-placement authored intent referring to wall geometry | preserve intent; asset resolver may add an intrinsic correction | Medium; exact production representation is open |
| Along-wall and toward/away fine adjustment | safe per-placement override | preserve, bounded and resettable | High for this UX; bounds are experiment results, not production constants yet |
| Neighbor placement transforms | each neighbor's own intent | unchanged | High; snap/replacement never batch-mutates the run |

The torch's 1.15 m attachment value is deliberately **not** added to
`propManifest.ts` in this issue. One specimen is insufficient evidence for a
global asset default; a follow-up should validate the same asset against several
real wall pieces/heights first.

## Alternatives tested/rejected

- **Preserve a complete XYZ/rotation transform on replacement** — rejected. It
  carried bookcase floor anchoring into a wall torch; the first actual-model pass
  made the torch mesh nearly disappear at the wall base. Preserve semantic span
  intent, not an old asset's resolved matrix.
- **Treat the raw bookcase GLB origin as the hex center** — rejected after Kirk's
  visual pass. The actual bounds put the visible center 0.927 m toward the next
  hex and left a 0.285 m wall gap even though the semantic root was correct.
- **Raw/unbounded transform editor** — rejected. It hid the useful wall-local
  basis, had no predictable reset, and offered degrees of freedom this proof does
  not need.
- **Snap the entire bookcase run** — rejected. The author cannot predict which
  unrelated placements will move; the selected-only behavior is easier to trust
  and test.
- **Delete then create a torch** — rejected. It loses selection/identity and makes
  preserving the vacated span accidental.
- **One reset that also restores the old asset** — rejected. Adjustment reset and
  fixture reset are different author intentions and are now separate actions.
- **Production YAML fields, a prefab/composition system, or batch layout** — not
  attempted. The Learn fixture has not earned those abstractions.

## Exact follow-up contract questions

1. Should the asset registry expose a semantic wall-attachment anchor (vertical
   offset plus model-forward correction), and what multi-scene calibration is
   required before the ornate torch's value is global?
2. What stable production reference identifies a wall/span center without
   coupling placement intent to renderer-specific world coordinates?
3. Are the ±25 cm / ±20 cm bounds appropriate across differently sized props, or
   should bounds be resolved from the chosen asset/span while the UI stays
   bounded?
4. Where is replacement policy executed once persistence exists: authoring UI
   command, authoring service, or document operation? It must preserve authored
   anchor intent while refreshing asset defaults atomically.

No downstream contract issue was filed from this Learn slice; these questions are
for Kirk's verdict first.

## Visual evidence — viewed statements

All screenshots are 1280×720, a representative Discord Activity viewport. The
capture run reported no browser console or page errors.

- [`prop-composition-728-initial-bookcases.png`](prop-composition-728-initial-bookcases.png)
  — **Superseded failed view:** the actual bookcases share a facing, but their raw
  back/left GLB pivots put each visible footprint between its authored hex and the
  next. Kirk correctly rejected this view; it is retained as failure evidence.
- [`prop-composition-728-corrected-bookcases.png`](prop-composition-728-corrected-bookcases.png)
  — **Viewed after correction:** three actual bookcases now read as three
  hex-owned spans: each visible shelf footprint centers over its selection/hex,
  the run stays straight, and the backs sit against the wall rather than leaving
  the raw-pivot gap. Neighbors remain unchanged.
- [`prop-composition-728-corrected-torch.png`](prop-composition-728-corrected-torch.png)
  — **Viewed after correction:** one click replaces only the center span. The
  actual ornate torch is horizontally centered and visibly attached to the wall
  on its distinct Z/Y baseline; neither bookcase inherits its transform.
- [`prop-composition-728-corrected-play-camera.png`](prop-composition-728-corrected-play-camera.png)
  — **Viewed after correction:** Play is visibly selected. The tactical
  orthographic view shows the same corrected two bookcase placements and
  wall-attached centered torch, with no camera-specific compensation.
- The earlier `prop-composition-728-centered-torch.png` and
  `prop-composition-728-play-camera.png` remain historical pre-correction
  captures and are superseded by the corrected views above.
