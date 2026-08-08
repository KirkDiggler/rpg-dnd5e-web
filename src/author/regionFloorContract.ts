/**
 * Outside-in consumer seam for RATIFIED Dungeon YAML v0.4 Wave A.
 *
 * This deliberately does not extend generated protobuf types. The released
 * authoring FloorPlan has no floor_source field yet, so integrating this seam
 * with the RPC would hide that contract gap. Fixtures can exercise the exact
 * future projection while production hard-stops until the additive proto is
 * published.
 */
import type {
  HexRecord,
  Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  parseDungeon,
  UnsupportedRegionFloorContractError,
  type DungeonDoc,
} from './dungeonYaml';

export { UnsupportedRegionFloorContractError } from './dungeonYaml';

export type RegionFloorCell = readonly [column: number, row: number];

export interface RegionFloorEdge {
  from: RegionFloorCell;
  to: RegionFloorCell;
  kind: 'solid' | 'door';
  doorId?: string;
}

/** Structural future-contract shape, intentionally not a generated-proto shim. */
export interface RegionFloorProjection {
  floorSource?: 'bounds' | 'regions';
  floorCells: readonly RegionFloorCell[];
  edges: readonly RegionFloorEdge[];
  entrance?: RegionFloorCell;
}

export interface ConsumedRegionFloor {
  floorSource: 'regions';
  floorCells: readonly RegionFloorCell[];
  edges: readonly (RegionFloorEdge & {
    /** Membership-derived owners; pair orientation is nonsemantic. */
    floorOwners: readonly RegionFloorCell[];
  })[];
  entrance?: RegionFloorCell;
  contains(cell: RegionFloorCell): boolean;
}

function cellKey([column, row]: RegionFloorCell): string {
  return `${column},${row}`;
}

function edgeKey(edge: RegionFloorEdge): string {
  const from = cellKey(edge.from);
  const to = cellKey(edge.to);
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

/**
 * Keeps an authored region-floor request byte-for-byte exact. This is the
 * capability attempt payload: callers may submit it with validate_only=true,
 * but may not route it through the legacy subset stripper.
 */
export function prepareExactRegionFloorCandidate(yaml: string): {
  yaml: string;
  doc: DungeonDoc;
} {
  const { doc } = parseDungeon(yaml);
  if (doc.canvas?.floorSource !== 'regions') {
    throw new UnsupportedRegionFloorContractError(
      'canvas.floor_source: regions is required for a Wave A region-floor candidate'
    );
  }
  return { yaml, doc };
}

/**
 * Consumes provider truth without deriving a rectangle, a region union, or
 * competing envelope edges. Producer-contract violations hard-stop instead of
 * falling back to bounds.
 */
export function consumeRegionFloorProjection(
  projection: RegionFloorProjection
): ConsumedRegionFloor {
  if (projection.floorSource !== 'regions') {
    throw new UnsupportedRegionFloorContractError(
      projection.floorSource === undefined
        ? 'FloorPlan.floor_source is absent; the additive authoring proto is required before region-floor preview can render'
        : `FloorPlan.floor_source resolved to ${projection.floorSource}, not regions`
    );
  }

  const floorKeys = new Set<string>();
  for (const cell of projection.floorCells) {
    const key = cellKey(cell);
    if (floorKeys.has(key)) {
      throw new UnsupportedRegionFloorContractError(
        `FloorPlan.floor_cells contains duplicate ${key}`
      );
    }
    floorKeys.add(key);
  }

  const seenEdges = new Set<string>();
  const edges = projection.edges.map((edge) => {
    const key = edgeKey(edge);
    if (seenEdges.has(key)) {
      throw new UnsupportedRegionFloorContractError(
        `FloorPlan.edges contains duplicate pair ${key}`
      );
    }
    seenEdges.add(key);

    const floorOwners = [edge.from, edge.to].filter((cell) =>
      floorKeys.has(cellKey(cell))
    );
    if (floorOwners.length === 0) {
      throw new UnsupportedRegionFloorContractError(
        `FloorPlan edge ${key} has no returned floor owner`
      );
    }
    return { ...edge, floorOwners };
  });

  if (
    projection.entrance !== undefined &&
    !floorKeys.has(cellKey(projection.entrance))
  ) {
    throw new UnsupportedRegionFloorContractError(
      `FloorPlan.entrance ${cellKey(projection.entrance)} is not returned floor`
    );
  }

  return {
    floorSource: 'regions',
    floorCells: [...projection.floorCells],
    edges,
    entrance: projection.entrance,
    contains: (cell) => floorKeys.has(cellKey(cell)),
  };
}

/**
 * Runtime/fog seam over the released generated HexRecord/Wall contract:
 * hit-testing and edge rendering are built only from authorized records. It
 * intentionally knows no canvas dimensions or authored regions from which
 * topology could be rebuilt.
 */
export function consumeAuthorizedRuntimeHexes(hexes: readonly HexRecord[]): {
  floorKeys: ReadonlySet<string>;
  edges: readonly Wall[];
  canHit(position: readonly [number, number, number]): boolean;
} {
  const floorKeys = new Set(
    hexes.flatMap((hex) =>
      hex.position
        ? [`${hex.position.x},${hex.position.y},${hex.position.z}`]
        : []
    )
  );
  const edges = hexes.flatMap((hex) => [...hex.edges]);
  return {
    floorKeys,
    edges,
    canHit: (position) => floorKeys.has(position.join(',')),
  };
}
