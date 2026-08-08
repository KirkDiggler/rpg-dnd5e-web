import { create } from '@bufbuild/protobuf';
import {
  HexRecordSchema,
  PositionSchema,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { resolveCanvasFloor } from './creation/canvasFloor';
import { parseDungeon, serializeDungeon, stripToV1Subset } from './dungeonYaml';
import {
  consumeAuthorizedRuntimeHexes,
  consumeRegionFloorProjection,
  prepareExactRegionFloorCandidate,
  UnsupportedRegionFloorContractError,
  type RegionFloorCell,
  type RegionFloorProjection,
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

const RING_YAML = `# preserve this exact candidate
version: 1
key: ring-room
name: 'Ring Room'
canvas: { width: 5, height: 5, floor_source: regions }
rooms: []
connectors: []
regions:
  - id: ring
    archetype: chamber
    cells: [[1,1], [1,2], [1,3], [2,1], [2,3], [3,1], [3,2], [3,3]]
`;

describe('Dungeon YAML v0.4 Wave A exact candidate', () => {
  it('parses floor_source: regions and returns the byte-exact YAML instead of stripping or downgrading it', () => {
    const candidate = prepareExactRegionFloorCandidate(RING_YAML);

    expect(candidate.doc.canvas?.floorSource).toBe('regions');
    expect(candidate.yaml).toBe(RING_YAML);
    expect(candidate.yaml).toContain('floor_source: regions');
    expect(candidate.yaml).toContain('# preserve this exact candidate');
  });

  it('keeps omission distinct from explicit bounds while preserving both CST shapes', () => {
    const omitted = RING_YAML.replace(', floor_source: regions', '');
    const bounds = RING_YAML.replace(
      'floor_source: regions',
      'floor_source: bounds'
    );

    const omittedParsed = parseDungeon(omitted);
    const boundsParsed = parseDungeon(bounds);
    expect(omittedParsed.doc.canvas?.floorSource).toBeNull();
    expect(boundsParsed.doc.canvas?.floorSource).toBe('bounds');
    expect(serializeDungeon(omittedParsed.cst)).not.toContain('floor_source');
    expect(serializeDungeon(boundsParsed.cst)).toContain(
      'floor_source: bounds'
    );
  });

  it('rejects an unknown floor source instead of silently treating it as bounds', () => {
    expect(() =>
      parseDungeon(
        RING_YAML.replace('floor_source: regions', 'floor_source: painted')
      )
    ).toThrow(/canvas\.floor_source: expected "bounds" or "regions"/);
  });

  it('hard-stops the region-floor path for a non-region candidate', () => {
    expect(() =>
      prepareExactRegionFloorCandidate(
        RING_YAML.replace('floor_source: regions', 'floor_source: bounds')
      )
    ).toThrow(UnsupportedRegionFloorContractError);
  });

  it('never routes region semantics through the legacy subset strip or bounds-derived preview fallback', () => {
    const doc = parseDungeon(RING_YAML).doc;

    expect(() => stripToV1Subset(RING_YAML)).toThrow(
      /cannot be stripped or downgraded/
    );
    expect(() => resolveCanvasFloor(doc, null)).toThrow(
      /refusing to infer or downgrade/
    );
  });
});

describe('authoring projection consumer', () => {
  function ringProjection(): RegionFloorProjection {
    return {
      floorSource: 'regions',
      floorCells: RING_CELLS,
      edges: [
        // Interior void envelope. Pair orientation is intentionally reversed:
        // ownership comes from floor membership, never `from`.
        { from: [2, 2], to: [2, 1], kind: 'solid' },
        // Outer envelope with an off-canvas endpoint.
        { from: [1, 1], to: [0, 1], kind: 'solid' },
        // An ordinary provider edge whose endpoints are both floor.
        { from: [1, 2], to: [1, 3], kind: 'door', doorId: 'door-a' },
      ],
      entrance: [1, 1],
    };
  }

  it('renders and hit-tests exactly the eight returned ring cells, leaving the in-bounds center void non-floor', () => {
    const preview = consumeRegionFloorProjection(ringProjection());

    expect(preview.floorCells).toEqual(RING_CELLS);
    expect(preview.floorCells).toHaveLength(8);
    expect(preview.contains([2, 2])).toBe(false);
    expect(preview.contains([1, 1])).toBe(true);
    // Only the three provider pairs exist; no rectangle/union envelope was
    // recreated by this consumer.
    expect(preview.edges).toHaveLength(3);
  });

  it('determines envelope ownership by returned floor membership, including reversed and off-canvas pairs', () => {
    const preview = consumeRegionFloorProjection(ringProjection());

    expect(preview.edges[0]?.floorOwners).toEqual([[2, 1]]);
    expect(preview.edges[1]?.floorOwners).toEqual([[1, 1]]);
    expect(preview.edges[2]?.floorOwners).toEqual([
      [1, 2],
      [1, 3],
    ]);
  });

  it('previews a structurally valid tiny draft with an absent entrance', () => {
    const preview = consumeRegionFloorProjection({
      floorSource: 'regions',
      floorCells: [
        [1, 1],
        [1, 2],
      ],
      edges: [{ from: [1, 1], to: [0, 1], kind: 'solid' }],
      // entrance intentionally absent: strict runnable validity is provider-owned.
    });

    expect(preview.floorCells).toHaveLength(2);
    expect(preview.entrance).toBeUndefined();
  });

  it('keeps both returned islands even when the provider returns an entrance only on the runnable-sized island', () => {
    const islandA = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const;
    const islandB = [4, 4] as const;
    const preview = consumeRegionFloorProjection({
      floorSource: 'regions',
      floorCells: [...islandA, islandB],
      edges: [
        { from: [0, 0], to: [-1, 0], kind: 'solid' },
        { from: islandB, to: [5, 4], kind: 'solid' },
      ],
      entrance: [0, 0],
    });

    expect(preview.floorCells).toEqual([...islandA, islandB]);
    expect(preview.entrance).toEqual([0, 0]);
    expect(preview.contains(islandB)).toBe(true);
  });

  it('hard-stops when the released projection cannot discriminate floor_source', () => {
    expect(() =>
      consumeRegionFloorProjection({
        floorCells: RING_CELLS,
        edges: [],
      })
    ).toThrow(/additive authoring proto is required/);
  });

  it('hard-stops malformed provider truth instead of inferring a repair', () => {
    expect(() =>
      consumeRegionFloorProjection({
        floorSource: 'regions',
        floorCells: RING_CELLS,
        edges: [{ from: [0, 0], to: [0, 1], kind: 'solid' }],
      })
    ).toThrow(/has no returned floor owner/);
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
