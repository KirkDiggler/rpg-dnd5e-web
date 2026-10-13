import { sceneUnitsPerFoot } from '@/components/session/structuralLayout';
import type { WallSurfaceChart } from '@/rendering/wallSurfaceCharts';
import type {
  WorldMaterialCatalog,
  WorldSurfaceAsset,
} from '@/rendering/worldMaterialCatalog';
import type { WorldSurfaceMaterial } from '@/rendering/worldMaterialTypes';
import { projectRegionWallBoundaries } from './regionBoundaryGeometry';
import {
  resolvePatternStart,
  type RegionBoundaryCorner,
  type RegionWallSide,
} from './regionSurfaceBoundary';
import type { RoomDraft } from './roomDraft';
import type { WorldPoint } from './types';
import { pointOnWallAxis } from './wallAngleConstraint';

export interface WallFinishSpan {
  /** Present only when this interval uses a resolved region's chart. */
  regionId?: string;
  wallId: string;
  side: 'positive-z' | 'negative-z';
  start: number;
  end: number;
  provider: WorldSurfaceAsset;
  material: WorldSurfaceMaterial;
  chart: WallSurfaceChart;
}
export interface RoomFinishStatus {
  id: string;
  corners: readonly RegionBoundaryCorner[];
  status: 'none' | 'ready' | 'unresolved';
  reason?: string;
  marker?: WorldPoint;
  /** Placement for an error label only, never a mapping anchor. */
  diagnosticPoint?: WorldPoint;
  perimeter?: number;
}
export interface RoomWallFinishProjection {
  regions: RoomFinishStatus[];
  spans: WallFinishSpan[];
}
export function surfaceRepeatSceneUnits(
  material: WorldSurfaceMaterial
): [number, number] {
  return material.repeatMeters.map(
    (meters) => (meters * sceneUnitsPerFoot(1)) / 0.3048
  ) as [number, number];
}
const cross = (a: WorldPoint, b: WorldPoint): number => a.x * b.z - a.z * b.x;
const subtract = (a: WorldPoint, b: WorldPoint): WorldPoint => ({
  x: a.x - b.x,
  z: a.z - b.z,
});
const dot = (a: WorldPoint, b: WorldPoint): number => a.x * b.x + a.z * b.z;
const same = (
  a: RegionWallSide,
  b: RegionBoundaryCorner['reference']['incoming']
): boolean => a.wallId === b.wallId && a.direction === b.direction;

/** Pure scene-unit projection. Centerlines certify ownership, offset face lines
 * define pattern distance. Neither projection alters wall/corner geometry. */
export function projectRoomWallFinishes(
  draft: Readonly<RoomDraft>,
  catalog: WorldMaterialCatalog | null
): RoomWallFinishProjection {
  const result: RoomWallFinishProjection = { regions: [], spans: [] };
  if (
    !catalog &&
    !(draft.scene.authoringRegions ?? []).some((r) => r.wallFinish)
  )
    return {
      regions: (draft.scene.authoringRegions ?? []).map((r) => ({
        id: r.id,
        status: 'none',
        corners: [],
      })),
      spans: [],
    };
  const boundaries = projectRegionWallBoundaries(draft);
  const walls = new Map(
    (draft.room.walls ?? []).map((wall) => [wall.id, wall])
  );
  for (const region of draft.scene.authoringRegions ?? []) {
    const boundary = boundaries.find((row) => row.id === region.id)!;
    const corners = boundary.status === 'resolved' ? boundary.corners : [];
    const status: RoomFinishStatus = { id: region.id, corners, status: 'none' };
    result.regions.push(status);
    if (!region.wallFinish) continue;
    try {
      if (boundary.status !== 'resolved')
        throw new Error(`Wall boundary: ${boundary.reason}`);
      const anchor = resolvePatternStart(
        boundary,
        region.wallFinish.patternStart
      );
      if (anchor.status !== 'resolved')
        throw new Error(`Choose a new pattern start: ${anchor.reason}`);
      status.marker = anchor.point;
      const material = catalog?.materials.find(
        (m) => m.ref === region.wallFinish!.materialRef
      );
      if (!material)
        throw new Error('Selected material resources are unavailable.');
      const lines = boundary.sides.map((side) => {
        const wall = walls.get(side.wallId)!;
        const sourceVector = subtract(wall.line.end, wall.line.start);
        const sign = side.direction === 'start-to-end' ? 1 : -1;
        const vector = { x: sourceVector.x * sign, z: sourceVector.z * sign },
          length = Math.hypot(vector.x, vector.z);
        if (!(length > 0)) throw new Error('Degenerate wall-side interval.');
        const direction = { x: vector.x / length, z: vector.z / length };
        const thickness = wall.appearance.thickness / 2;
        const point = {
          x: side.from.x - direction.z * thickness,
          z: side.from.z + direction.x * thickness,
        };
        const provider = catalog!.surfaces.find(
          (asset) => asset.assetRef === wall.appearance.assetRef
        );
        const matching = provider?.bindings.filter(
          (b) => b.side === side.side && b.family === material.family
        );
        if (!provider || matching?.length !== 1)
          throw new Error(
            `Wall ${wall.label || wall.id} does not declare a compatible room-facing surface.`
          );
        return {
          side,
          wall,
          direction,
          vector,
          point,
          provider,
          binding: matching[0],
        };
      });
      const starts = lines.map((line, i) => {
        const previous = lines[(i + lines.length - 1) % lines.length];
        const turn = cross(previous.direction, line.direction);
        if (
          pointOnWallAxis({
            anchor: { x: 0, z: 0 },
            point: line.vector,
            direction: previous.vector,
          })
        ) {
          if (
            dot(previous.direction, line.direction) < 0 ||
            previous.wall.appearance.thickness !==
              line.wall.appearance.thickness
          )
            throw new Error('Collinear wall faces have incompatible offsets.');
          return line.point;
        }
        if (
          !pointOnWallAxis({
            anchor: { x: 0, z: 0 },
            point: line.vector,
            direction: { x: -previous.vector.z, z: previous.vector.x },
          })
        )
          throw new Error(
            'Room finish corners currently require perpendicular walls.'
          );
        const along =
          cross(subtract(line.point, previous.point), line.direction) / turn;
        return {
          x: previous.point.x + along * previous.direction.x,
          z: previous.point.z + along * previous.direction.z,
        };
      });
      const start = lines.findIndex(
        (line, i) =>
          same(line.side, anchor.reference.outgoing) &&
          same(
            lines[(i + lines.length - 1) % lines.length].side,
            anchor.reference.incoming
          )
      );
      if (start < 0)
        throw new Error('Pattern start has no certified source transition.');
      let distance = 0;
      const spans: WallFinishSpan[] = [];
      for (let step = 0; step < lines.length; step++) {
        const i = (start + step) % lines.length,
          line = lines[i];
        const length = dot(
          subtract(starts[(i + 1) % lines.length], starts[i]),
          line.direction
        );
        if (!(length > 1e-8))
          throw new Error(
            'Wall thickness collapses the room-facing pattern path.'
          );
        const sign = line.side.direction === 'start-to-end' ? 1 : -1;
        const sourceAtStart =
          dot(subtract(starts[i], line.wall.line.start), line.direction) * sign;
        const repeat = surfaceRepeatSceneUnits(material);
        spans.push({
          regionId: region.id,
          wallId: line.side.wallId,
          side: line.side.side,
          start: line.side.start,
          end: line.side.end,
          provider: line.provider,
          material,
          chart: {
            surfaceId: line.binding.id,
            phase: distance - sign * sourceAtStart,
            direction: sign,
            repeat,
            elevation: line.wall.appearance.elevation,
          },
        });
        distance += length;
      }
      status.status = 'ready';
      status.perimeter = distance;
      result.spans.push(...spans);
    } catch (error) {
      status.status = 'unresolved';
      status.reason = error instanceof Error ? error.message : String(error);
      const label = draft.scene.mapLabels?.find(
        (row) => row.id === region.labelId
      );
      if (label) status.diagnosticPoint = { ...label.location };
    }
  }
  return result;
}

/** Add partitions only to derived pieces; room walls/openings/blockers remain
 * untouched. The partition budget is bounded by the supplied interval count. */
export function partitionFinishInterval(
  start: number,
  end: number,
  spans: readonly WallFinishSpan[]
): Array<{ start: number; end: number; finishes: WallFinishSpan[] }> {
  const cuts = [
    ...new Set([
      start,
      end,
      ...spans
        .flatMap((s) => [s.start, s.end])
        .filter((n) => n > start && n < end),
    ]),
  ].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((a, i) => {
    const b = cuts[i + 1],
      middle = (a + b) / 2;
    const finishes = spans.filter((s) => s.start <= middle && s.end >= middle);
    if (new Set(finishes.map((s) => s.side)).size !== finishes.length)
      throw new Error('Conflicting room finish ownership on one wall side.');
    return { start: a, end: b, finishes };
  });
}
