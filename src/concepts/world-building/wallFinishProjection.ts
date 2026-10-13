import type {
  WorldMaterialCatalog,
  WorldSurfaceAsset,
} from '@/rendering/worldMaterialCatalog';
import type { WorldSurfaceMaterial } from '@/rendering/worldMaterialTypes';
import type { RoomDraft } from './roomDraft';
import {
  projectRoomWallFinishes,
  surfaceRepeatSceneUnits,
  type RoomWallFinishProjection,
  type WallFinishSpan,
} from './roomWallFinishes';
import { wallLength, wallMidpoint } from './structuralWallEditing';
import type { StructuralWall, StructuralWallSurface } from './structuralWalls';
import type { WorldPoint } from './types';
import { wallFinishFor } from './wallFinishEdits';
import { WALL_FINISH_SIDES, type WallFinishSide } from './wallFinishTypes';

/** Display-only side labels in the wall's canonical Start→End frame. */
export function wallFaceGuidePoints(wall: StructuralWallSurface): {
  a: WorldPoint;
  b: WorldPoint;
} {
  const length = wallLength(wall),
    mid = wallMidpoint(wall),
    offset = wall.appearance.thickness / 2 + 0.3;
  const x = (-(wall.line.end.z - wall.line.start.z) / length) * offset;
  const z = ((wall.line.end.x - wall.line.start.x) / length) * offset;
  return {
    a: { x: mid.x + x, z: mid.z + z },
    b: { x: mid.x - x, z: mid.z - z },
  };
}

export interface WallFinishStatus {
  wallId: string;
  side: WallFinishSide;
  status: 'ready' | 'unresolved';
  reason?: string;
}
export interface WallFinishProjection extends RoomWallFinishProjection {
  walls: WallFinishStatus[];
}
export function resolveWallFaceFinish(
  catalog: WorldMaterialCatalog | null,
  wall: StructuralWall,
  side: WallFinishSide,
  ref: string
): {
  material: WorldSurfaceMaterial;
  provider: WorldSurfaceAsset;
  surfaceId: string;
} {
  const material = catalog?.materials.find((row) => row.ref === ref);
  if (!material)
    throw new Error(`Selected wall finish is unavailable: ${ref}.`);
  const provider = catalog!.surfaces.find(
    (row) => row.assetRef === wall.appearance.assetRef
  );
  const matches = provider?.bindings.filter(
    (binding) => binding.side === side && binding.family === material.family
  );
  if (!provider || matches?.length !== 1)
    throw new Error(
      `Wall ${wall.label || wall.id} has no compatible ${side === 'positive-z' ? 'A' : 'B'} face for this finish.`
    );
  return { material, provider, surfaceId: matches[0].id };
}

/** Explicit face intent wins across the whole source wall. Certified region
 * charts are reused where available; no region is created/inferred for uncovered
 * intervals. Local charts use the wall's stable Start datum and common floor. */
export function projectWallFinishes(
  draft: Readonly<RoomDraft>,
  catalog: WorldMaterialCatalog | null
): WallFinishProjection {
  const defaults = projectRoomWallFinishes(draft, catalog);
  const result: WallFinishProjection = {
    regions: defaults.regions,
    spans: [...defaults.spans],
    walls: [],
  };
  for (const wall of draft.room.walls ?? []) {
    const overrides = wallFinishFor(draft.scene, wall.id);
    if (!overrides) continue;
    for (const side of WALL_FINISH_SIDES) {
      const ref = overrides[side];
      if (ref === undefined) continue;
      const inherited = defaults.spans.filter(
        (span) => span.wallId === wall.id && span.side === side
      );
      // Invalid explicit intent cannot look successful by silently inheriting.
      result.spans = result.spans.filter(
        (span) => span.wallId !== wall.id || span.side !== side
      );
      try {
        const { material, provider, surfaceId } = resolveWallFaceFinish(
          catalog,
          wall,
          side,
          ref
        );
        const length = wallLength(wall);
        if (!Number.isFinite(length) || length <= 0)
          throw new Error(
            'Wall finish requires a positive finite wall length.'
          );
        const cuts = [
          ...new Set([
            0,
            length,
            ...inherited
              .flatMap((span) => [span.start, span.end])
              .filter((n) => n > 0 && n < length),
          ]),
        ].sort((a, b) => a - b);
        const spans: WallFinishSpan[] = cuts.slice(0, -1).map((start, i) => {
          const end = cuts[i + 1],
            middle = (start + end) / 2;
          const matches = inherited.filter(
            (span) => span.start <= middle && span.end >= middle
          );
          if (matches.length > 1)
            throw new Error('Conflicting region charts on one wall face.');
          const base = matches[0];
          return {
            wallId: wall.id,
            side,
            start,
            end,
            material,
            provider,
            ...(base?.regionId ? { regionId: base.regionId } : {}),
            chart: {
              ...(base?.chart ?? {
                phase: 0,
                direction: side === 'positive-z' ? 1 : -1,
                elevation: wall.appearance.elevation,
              }),
              surfaceId,
              repeat: surfaceRepeatSceneUnits(material),
            },
          };
        });
        result.spans.push(...spans);
        result.walls.push({ wallId: wall.id, side, status: 'ready' });
      } catch (error) {
        result.walls.push({
          wallId: wall.id,
          side,
          status: 'unresolved',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return result;
}
