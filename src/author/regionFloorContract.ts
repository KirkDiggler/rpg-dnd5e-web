import {
  FloorPlanEdgeKind,
  FloorPlanFloorSource,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type {
  HexRecord,
  Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { DEFAULT_CANVAS } from './creation/emptyCanvasDoc';
import { projectWallLineToEdges } from './creation/straightWallGeometry';
import {
  parseDungeon,
  serializeDungeon,
  UnsupportedRegionFloorContractError,
  type DungeonDoc,
  type WallDoc,
} from './dungeonYaml';

export { UnsupportedRegionFloorContractError } from './dungeonYaml';

export type RegionFloorCell = readonly [column: number, row: number];

export interface ConsumedRegionFloorEdge {
  from: RegionFloorCell;
  to: RegionFloorCell;
  kind: FloorPlanEdgeKind.SOLID | FloorPlanEdgeKind.DOOR;
  doorId?: string;
  /** Membership-derived owners. Endpoint orientation is nonsemantic. */
  floorOwners: readonly RegionFloorCell[];
}

export interface ConsumedRegionFloor {
  floorSource: FloorPlanFloorSource.REGIONS;
  floorCells: readonly RegionFloorCell[];
  edges: readonly ConsumedRegionFloorEdge[];
  entrance?: RegionFloorCell;
  contains(cell: RegionFloorCell): boolean;
}

export interface RegionFloorCandidateOptions {
  wallsCapability?: {
    accepted: boolean;
    message?: string;
  };
}

export interface ExactRegionFloorCandidate {
  /** Request payload. Equal to the source unless lossless wallLines sugar was compiled. */
  yaml: string;
  doc: DungeonDoc;
}

export function hasRegionFloorIntent(
  doc: Pick<DungeonDoc, 'canvas' | 'regions' | 'rooms'>
): boolean {
  return (
    doc.canvas?.floorSource === 'regions' ||
    (doc.canvas !== null && doc.rooms.length === 0 && doc.regions.length > 0)
  );
}

function cellKey([column, row]: RegionFloorCell): string {
  return `${column},${row}`;
}

function wallEdgeKey(a: RegionFloorCell, b: RegionFloorCell): string {
  const aKey = cellKey(a);
  const bKey = cellKey(b);
  return aKey <= bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function rotationBlockers(doc: DungeonDoc): string[] {
  const blockers: string[] = [];
  doc.place.forEach((placement, index) => {
    if (placement.rotationDegrees !== null) {
      blockers.push(
        `place[${index}].rotate_degrees: unsupported capability: fine rotation cannot be removed from an exact region-floor candidate`
      );
    }
  });
  doc.rooms.forEach((room, roomIndex) => {
    room.place.forEach((placement, placementIndex) => {
      if (placement.rotationDegrees !== null) {
        blockers.push(
          `rooms[${roomIndex}].place[${placementIndex}].rotate_degrees: unsupported capability: fine rotation cannot be removed from an exact region-floor candidate`
        );
      }
    });
  });
  return blockers;
}

/**
 * Builds the only request payload allowed for an explicit region floor.
 * It never invokes the legacy subset stripper. The source is returned byte for
 * byte when it already uses provider grammar. `wallLines` remains local sugar:
 * it may be replaced on a fresh CST only when every implied pair is representable
 * and no authored meaning conflicts. The caller's source string/CST is untouched.
 */
export function prepareExactRegionFloorCandidate(
  yaml: string,
  options: RegionFloorCandidateOptions = {}
): ExactRegionFloorCandidate {
  const { cst, doc } = parseDungeon(yaml);
  if (doc.canvas?.floorSource !== 'regions') {
    throw new UnsupportedRegionFloorContractError(
      'canvas.floor_source: exact region-floor candidates must explicitly declare "regions"; the client will not infer it'
    );
  }

  const blockers = rotationBlockers(doc);
  const projected = new Map<string, WallDoc>();

  if (doc.wallLines.length > 0) {
    const wallsCapability = options.wallsCapability;
    if (wallsCapability && !wallsCapability.accepted) {
      blockers.unshift(
        `walls: ${wallsCapability.message || 'rejected — no detail returned'}; wallLines cannot compile for an exact region-floor candidate`
      );
    } else {
      const grid = doc.canvas ?? DEFAULT_CANVAS;
      let hasRimEdges = false;
      doc.wallLines.forEach((line, index) => {
        const projection = projectWallLineToEdges(line, grid);
        if (projection.rimEdgeCount > 0) hasRimEdges = true;
        if (projection.edges.length === 0 && projection.rimEdgeCount === 0) {
          blockers.push(
            `wallLines[${index}]: projection produced no canonical walls; exact region-floor candidate blocked`
          );
        }
        for (const edge of projection.edges) {
          const key = wallEdgeKey(edge.from, edge.to);
          const existing = projected.get(key);
          if (existing && existing.kind !== edge.kind) {
            blockers.push(
              `wallLines[${index}]: conflicting wall kinds at ${key} cannot compile losslessly`
            );
            continue;
          }
          projected.set(key, edge);
        }
      });
      if (hasRimEdges) {
        blockers.unshift(
          'wallLines: perimeter rim edges cannot compile losslessly to walls'
        );
      }

      const explicit = new Map(
        doc.walls.map(
          (wall) => [wallEdgeKey(wall.from, wall.to), wall] as const
        )
      );
      for (const [key, wall] of projected) {
        const existing = explicit.get(key);
        if (existing && existing.kind !== wall.kind) {
          blockers.push(
            `wallLines: projected ${wall.kind} conflicts with explicit ${existing.kind} at ${key}`
          );
        }
      }
    }
  }

  if (blockers.length > 0) {
    throw new UnsupportedRegionFloorContractError(blockers.join('; '));
  }

  if (doc.wallLines.length === 0) {
    return { yaml, doc };
  }

  const explicitKeys = new Set(
    doc.walls.map((wall) => wallEdgeKey(wall.from, wall.to))
  );
  const walls = [
    ...doc.walls,
    ...[...projected.entries()]
      .filter(([key]) => !explicitKeys.has(key))
      .map(([, wall]) => ({
        from: [...wall.from] as [number, number],
        to: [...wall.to] as [number, number],
        kind: wall.kind,
      })),
  ];
  cst.set(
    'walls',
    walls.map((wall) => ({
      from: wall.from,
      to: wall.to,
      kind: wall.kind,
    }))
  );
  cst.delete('wallLines');
  const candidateYaml = serializeDungeon(cst);
  return { yaml: candidateYaml, doc: parseDungeon(candidateYaml).doc };
}

function tuple(cell: { column: number; row: number }): RegionFloorCell {
  return [cell.column, cell.row];
}

function floorSourceFailure(floorSource: FloorPlan['floorSource']): string {
  if (floorSource === undefined) {
    return 'FloorPlan.floor_source is absent; refusing to infer a region floor from cells, bounds, or regions';
  }
  if (floorSource === FloorPlanFloorSource.UNSPECIFIED) {
    return 'FloorPlan.floor_source is UNSPECIFIED; refusing to infer a region floor from cells, bounds, or regions';
  }
  if (floorSource === FloorPlanFloorSource.BOUNDS) {
    return 'FloorPlan.floor_source resolved to BOUNDS, not REGIONS';
  }
  return `FloorPlan.floor_source has unsupported value ${floorSource}`;
}

/**
 * Consumes the released generated FloorPlan directly. It validates producer
 * contract rails but never derives a rectangle, region union, envelope, pair
 * orientation, or replacement topology.
 */
export function consumeRegionFloorProjection(
  floorPlan: FloorPlan
): ConsumedRegionFloor {
  if (floorPlan.floorSource !== FloorPlanFloorSource.REGIONS) {
    throw new UnsupportedRegionFloorContractError(
      floorSourceFailure(floorPlan.floorSource)
    );
  }

  const floorCells: RegionFloorCell[] = [];
  const floorKeys = new Set<string>();
  let previous: RegionFloorCell | undefined;
  for (const wireCell of floorPlan.floorCells) {
    const cell = tuple(wireCell);
    const key = cellKey(cell);
    if (floorKeys.has(key)) {
      throw new UnsupportedRegionFloorContractError(
        `FloorPlan.floor_cells contains duplicate ${key}`
      );
    }
    if (
      previous &&
      (cell[0] < previous[0] ||
        (cell[0] === previous[0] && cell[1] < previous[1]))
    ) {
      throw new UnsupportedRegionFloorContractError(
        `FloorPlan.floor_cells is not in canonical ascending order at ${key}`
      );
    }
    previous = cell;
    floorKeys.add(key);
    floorCells.push(cell);
  }

  const seenEdges = new Set<string>();
  const seenDoorIds = new Set<string>();
  const edges: ConsumedRegionFloorEdge[] = floorPlan.edges.map(
    (wireEdge, index) => {
      if (!wireEdge.from || !wireEdge.to) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan.edges[${index}] is missing from or to`
        );
      }
      const from = tuple(wireEdge.from);
      const to = tuple(wireEdge.to);
      const key = wallEdgeKey(from, to);
      if (cellKey(from) === cellKey(to)) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan edge ${key} has identical endpoints`
        );
      }
      if (seenEdges.has(key)) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan.edges contains duplicate pair ${key}`
        );
      }
      seenEdges.add(key);

      if (
        wireEdge.kind !== FloorPlanEdgeKind.SOLID &&
        wireEdge.kind !== FloorPlanEdgeKind.DOOR
      ) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan edge ${key} has unsupported kind ${wireEdge.kind}`
        );
      }
      if (
        wireEdge.kind === FloorPlanEdgeKind.SOLID &&
        wireEdge.doorId !== undefined
      ) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan solid edge ${key} unexpectedly has door_id`
        );
      }
      if (wireEdge.kind === FloorPlanEdgeKind.DOOR) {
        if (!wireEdge.doorId) {
          throw new UnsupportedRegionFloorContractError(
            `FloorPlan door edge ${key} has no door_id`
          );
        }
        if (seenDoorIds.has(wireEdge.doorId)) {
          throw new UnsupportedRegionFloorContractError(
            `FloorPlan.edges contains duplicate door_id ${wireEdge.doorId}`
          );
        }
        seenDoorIds.add(wireEdge.doorId);
      }

      const floorOwners = [from, to].filter((cell) =>
        floorKeys.has(cellKey(cell))
      );
      if (floorOwners.length === 0) {
        throw new UnsupportedRegionFloorContractError(
          `FloorPlan edge ${key} has no returned floor owner`
        );
      }
      return {
        from,
        to,
        kind: wireEdge.kind,
        doorId: wireEdge.doorId,
        floorOwners,
      };
    }
  );

  const entrance = floorPlan.entrance ? tuple(floorPlan.entrance) : undefined;
  if (entrance && !floorKeys.has(cellKey(entrance))) {
    throw new UnsupportedRegionFloorContractError(
      `FloorPlan.entrance ${cellKey(entrance)} is not returned floor`
    );
  }

  return {
    floorSource: FloorPlanFloorSource.REGIONS,
    floorCells,
    edges,
    entrance,
    contains: (cell) => floorKeys.has(cellKey(cell)),
  };
}

/** Runtime/fog seam: exposes only authorized HexRecords and attached edges. */
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
