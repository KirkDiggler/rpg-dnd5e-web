# Dungeon YAML v0.4 Wave A web checkpoint (#735)

Outside-in checkpoint against RATIFIED rpg-project PR #203 at
`40a3938fff9093ae2913da9ea100d8ab63193cb3`.

## What this proves

- The YAML model distinguishes omitted `canvas.floor_source`, explicit `bounds`,
  and exact `regions`; invalid values reject instead of becoming bounds.
- An exact region-floor candidate stays byte-for-byte unchanged. The legacy
  subset projection and bounds-derived preview both hard-stop rather than strip
  or downgrade it.
- A future authoring projection consumer renders/hit-tests only returned
  `floor_cells`, uses membership rather than pair orientation to identify edge
  ownership (including center void and off-canvas endpoints), accepts an absent
  draft entrance, and invents no envelope pairs.
- A runtime seam exposes only authorized returned hex records and the edges
  attached to them; it has no canvas/region input from which hidden floor or
  topology could be recreated.

The 5x5 ring fixture has exactly eight returned floor cells. Its in-bounds
`[2,2]` center remains non-floor. Tiny draft coverage preserves an absent
entrance. These are consumer contract tests, not provider rules implemented in
TypeScript.

## Exact dependency discovered

Released TypeScript protos at `@kirkdiggler/rpg-api-protos` `v0.1.120`
(`ba7eda1f1833a713afa4f7772b3a39955de9f7b2`) provide
`FloorPlan.floor_cells`, `FloorPlan.edges`, and optional `FloorPlan.entrance`,
but **do not provide resolved `FloorPlan.floor_source`**. The web cannot
honestly distinguish:

- a valid empty `regions` structural draft from an older producer's unset
  repeated `floor_cells`; or
- an explicit region-floor response from a bounds response that happens to
  contain the same cells.

The additive contract rail therefore needs:

1. a generated authoring `FloorPlan.floor_source` field with discriminable
   `bounds` and `regions` values (an enum is preferable; exact naming belongs to
   the proto owner), present/resolved even when YAML omitted to bounds;
2. the provider to populate it together with the complete canonical
   `floor_cells`, existing flat pair `edges` (including void/off-canvas
   endpoints), and presence-aware optional `entrance` on every successful
   validate-only response; and
3. the provider to accept the exact `floor_source: regions` candidate for
   validate-only structural drafts, while strict writes/starts return the
   provider's runnable-validity failure without mutating authored state.

No generated code or runtime rules are patched on this branch. Once the
released immutable proto exists, the structural concept type in
`regionFloorContract.ts` must be replaced at the RPC adapter boundary by that
generated type. The real game adapter also needs a bounded follow-through:
`EncounterMap` currently calls `computeWallRuns` over zone bounding boxes when
any wall exists. Region-union topology cannot use that synthetic envelope; its
run rendering must be driven only by returned `HexRecord.edges`, while retaining
the existing bounds/room-chain regression path. Then the Builder preview/save
and game-route E2E can be wired and the remaining #735 acceptance run against
delivered providers.

## Local evidence

- `npx vitest run src/author/regionFloorContract.test.ts`
- `npm run ci-check`
