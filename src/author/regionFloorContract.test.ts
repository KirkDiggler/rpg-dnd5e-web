import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  FloorPlanEdgeKind,
  FloorPlanFloorSource,
  FloorPlanSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  HexRecordSchema,
  PositionSchema,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  consumeAuthorizedRuntimeHexes,
  consumeRegionFloorProjection,
  UnsupportedRegionFloorContractError,
  type RegionFloorCell,
} from './regionFloorContract';

const RING_CELLS = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 1],
  [2, 3],
  [3, 1],
  [3, 2],
  [3, 3],
] as const satisfies readonly RegionFloorCell[];

function ringFloorPlan(
  overrides: MessageInitShape<typeof FloorPlanSchema> = {}
): FloorPlan {
  return create(FloorPlanSchema, {
    width: 5,
    height: 5,
    floorSource: FloorPlanFloorSource.REGIONS,
    floorCells: RING_CELLS.map(([column, row]) => ({ column, row })),
    edges: [
      // Reversed interior-void pair: ownership must come from membership.
      {
        from: { column: 2, row: 2 },
        to: { column: 2, row: 1 },
        kind: FloorPlanEdgeKind.SOLID,
      },
      // Off-canvas endpoint, orientation deliberately nonsemantic.
      {
        from: { column: 1, row: 1 },
        to: { column: 0, row: 1 },
        kind: FloorPlanEdgeKind.SOLID,
      },
      {
        from: { column: 1, row: 2 },
        to: { column: 1, row: 3 },
        kind: FloorPlanEdgeKind.DOOR,
        doorId: 'door-a',
      },
    ],
    entrance: { column: 1, row: 1 },
    ...overrides,
  } as never);
}

describe('generated authoring region-floor projection consumer', () => {
  it('renders and hit-tests exactly the canonical returned mask, preserving voids and optional entrance', () => {
    const preview = consumeRegionFloorProjection(ringFloorPlan());

    expect(preview.floorSource).toBe(FloorPlanFloorSource.REGIONS);
    expect(preview.floorCells).toEqual(RING_CELLS);
    expect(preview.floorCells).toHaveLength(8);
    expect(preview.contains([2, 2])).toBe(false);
    expect(preview.contains([1, 1])).toBe(true);
    expect(preview.entrance).toEqual([1, 1]);
    expect(preview.edges).toHaveLength(3);
  });

  it('preserves provider pair orientation and derives one-sided envelope ownership only from returned floor membership', () => {
    const preview = consumeRegionFloorProjection(ringFloorPlan());

    expect(preview.edges[0]).toMatchObject({
      from: [2, 2],
      to: [2, 1],
      kind: FloorPlanEdgeKind.SOLID,
      floorOwners: [[2, 1]],
    });
    expect(preview.edges[1]).toMatchObject({
      from: [1, 1],
      to: [0, 1],
      kind: FloorPlanEdgeKind.SOLID,
      floorOwners: [[1, 1]],
    });
    expect(preview.edges[2]).toMatchObject({
      from: [1, 2],
      to: [1, 3],
      kind: FloorPlanEdgeKind.DOOR,
      doorId: 'door-a',
      floorOwners: [
        [1, 2],
        [1, 3],
      ],
    });
  });

  it('preserves an absent entrance for a structurally valid draft', () => {
    const preview = consumeRegionFloorProjection(
      ringFloorPlan({ entrance: undefined })
    );
    expect(preview.entrance).toBeUndefined();
  });

  it.each([
    ['absent', undefined],
    ['UNSPECIFIED', FloorPlanFloorSource.UNSPECIFIED],
    ['BOUNDS', FloorPlanFloorSource.BOUNDS],
  ])(
    'hard-stops when generated FloorPlan.floorSource is %s instead of present REGIONS',
    (_label, floorSource) => {
      expect(() =>
        consumeRegionFloorProjection(ringFloorPlan({ floorSource }))
      ).toThrow(UnsupportedRegionFloorContractError);
    }
  );

  it('rejects non-canonical floor-cell order instead of normalizing provider truth client-side', () => {
    expect(() =>
      consumeRegionFloorProjection(
        ringFloorPlan({
          floorCells: [
            { column: 3, row: 3 },
            { column: 1, row: 1 },
          ],
        })
      )
    ).toThrow(/canonical ascending order/);
  });

  it('rejects a canonical edge with no returned floor owner instead of inventing or clipping an envelope', () => {
    expect(() =>
      consumeRegionFloorProjection(
        ringFloorPlan({
          edges: [
            {
              from: { column: 0, row: 0 },
              to: { column: 0, row: 1 },
              kind: FloorPlanEdgeKind.SOLID,
            },
          ],
        })
      )
    ).toThrow(/has no returned floor owner/);
  });

  it('rejects missing endpoints and unsupported edge kinds with the provider pair intact', () => {
    expect(() =>
      consumeRegionFloorProjection(
        ringFloorPlan({
          edges: [{ to: { column: 1, row: 1 }, kind: FloorPlanEdgeKind.SOLID }],
        })
      )
    ).toThrow(/missing from or to/);

    expect(() =>
      consumeRegionFloorProjection(
        ringFloorPlan({
          edges: [
            {
              from: { column: 1, row: 1 },
              to: { column: 1, row: 2 },
              kind: FloorPlanEdgeKind.UNSPECIFIED,
            },
          ],
        })
      )
    ).toThrow(/unsupported kind/);
  });
});

describe('authorized runtime consumer', () => {
  it('exposes only returned HexRecords and their attached edges; hidden and center-void topology stays absent', () => {
    const providerEdge = create(WallSchema, {
      from: create(PositionSchema, { x: 1, y: -2, z: 1 }),
      to: create(PositionSchema, { x: 2, y: -4, z: 2 }),
      kind: WallKind.SOLID,
    });
    const runtime = consumeAuthorizedRuntimeHexes([
      create(HexRecordSchema, {
        position: create(PositionSchema, { x: 1, y: -2, z: 1 }),
        edges: [providerEdge],
      }),
      create(HexRecordSchema, {
        position: create(PositionSchema, { x: 2, y: -3, z: 1 }),
        edges: [],
      }),
    ]);

    expect([...runtime.floorKeys]).toEqual(['1,-2,1', '2,-3,1']);
    expect(runtime.edges).toHaveLength(1);
    expect(runtime.canHit([1, -2, 1])).toBe(true);
    expect(runtime.canHit([2, -4, 2])).toBe(false);
    expect(runtime.canHit([9, -9, 0])).toBe(false);
  });
});
