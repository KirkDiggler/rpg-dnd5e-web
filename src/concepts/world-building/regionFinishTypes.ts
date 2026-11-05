import type { PatternCornerRef } from './regionSurfaceBoundary';
import { carryUnknownKeys, objectShape } from './strictShape';
import { validateMaterialRef } from './wallFinishTypes';

export interface RoomWallFinish {
  materialRef: string;
  patternStart: PatternCornerRef;
}
export interface RegionWallFinishPatch {
  materialRef?: string;
  patternStart?: PatternCornerRef;
}
export function validatePatternStart(
  value: unknown,
  path = 'Pattern start'
): PatternCornerRef {
  const row = objectShape(value, path);
  const run = (key: 'incoming' | 'outgoing'): PatternCornerRef['incoming'] => {
    const item = objectShape(row[key], `${path}.${key}`);
    if (
      typeof item.wallId !== 'string' ||
      !item.wallId.length ||
      item.wallId.length > 120 ||
      (item.direction !== 'start-to-end' && item.direction !== 'end-to-start')
    )
      throw new Error(`${path}.${key} must name an oriented source wall.`);
    return carryUnknownKeys(item, ['wallId', 'direction'], {
      wallId: item.wallId,
      direction: item.direction,
    });
  };
  return carryUnknownKeys(row, ['incoming', 'outgoing'], {
    incoming: run('incoming'),
    outgoing: run('outgoing'),
  });
}
export function validateRoomWallFinish(
  value: unknown,
  path = 'Wall finish'
): RoomWallFinish {
  const row = objectShape(value, path);
  return carryUnknownKeys(row, ['materialRef', 'patternStart'], {
    materialRef: validateMaterialRef(row.materialRef, `${path}.materialRef`),
    patternStart: validatePatternStart(
      row.patternStart,
      `${path}.patternStart`
    ),
  });
}
