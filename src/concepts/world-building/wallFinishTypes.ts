import { objectShape, rejectUnknownKeys } from './strictShape';
export const WALL_FINISH_SIDES = ['positive-z', 'negative-z'] as const;
export type WallFinishSide = (typeof WALL_FINISH_SIDES)[number];
export type WallFinishOverrides = Partial<Record<WallFinishSide, string>>;
export type WallFinishPatch = Partial<Record<WallFinishSide, string | null>>;
export type WallFinishes = Record<string, WallFinishOverrides>;

export function validateMaterialRef(
  value: unknown,
  path = 'Material reference'
): string {
  if (
    typeof value !== 'string' ||
    !/^dnd5e:material:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/.test(
      value
    )
  )
    throw new Error(`${path} must be an exact material reference.`);
  return value;
}
export function validateWallFinishes(value: unknown): WallFinishes {
  const rows = objectShape(value, 'scene.wallFinishes');
  return Object.fromEntries(
    Object.entries(rows).map(([id, value]) => {
      if (!id.trim()) throw new Error('scene.wallFinishes must name a wall.');
      const path = `scene.wallFinishes.${id}`,
        row = objectShape(value, path);
      rejectUnknownKeys(row, [...WALL_FINISH_SIDES], path);
      if (!Object.keys(row).length)
        throw new Error(
          `${path} must contain a face choice; omit an empty override.`
        );
      return [
        id,
        Object.fromEntries(
          WALL_FINISH_SIDES.filter((side) => Object.hasOwn(row, side)).map(
            (side) => [side, validateMaterialRef(row[side], `${path}.${side}`)]
          )
        ),
      ];
    })
  );
}
