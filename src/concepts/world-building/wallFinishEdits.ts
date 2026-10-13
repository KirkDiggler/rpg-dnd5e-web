import type { WorldScene } from './types';
import {
  WALL_FINISH_SIDES,
  validateMaterialRef,
  type WallFinishOverrides,
  type WallFinishPatch,
} from './wallFinishTypes';

export function wallFinishFor(
  scene: Readonly<WorldScene>,
  id: string
): Readonly<WallFinishOverrides> | undefined {
  return scene.wallFinishes && Object.hasOwn(scene.wallFinishes, id)
    ? scene.wallFinishes[id]
    : undefined;
}
/** Pure presentation intent; the room owner validates the wall link and commits
 * this together with any staged geometry/appearance edits. */
export function setWallFinishes(
  scene: WorldScene,
  id: string,
  patch: WallFinishPatch
): WorldScene {
  if (
    !id.trim() ||
    Object.keys(patch).some(
      (key) =>
        !WALL_FINISH_SIDES.includes(key as (typeof WALL_FINISH_SIDES)[number])
    )
  )
    throw new Error('Invalid wall finish target or face.');
  const current = wallFinishFor(scene, id),
    next: WallFinishOverrides = { ...current };
  for (const side of WALL_FINISH_SIDES) {
    if (!Object.hasOwn(patch, side)) continue;
    const value = patch[side];
    if (value === null) delete next[side];
    else next[side] = validateMaterialRef(value, `Wall ${id} ${side} finish`);
  }
  if (WALL_FINISH_SIDES.every((side) => current?.[side] === next[side]))
    return scene;
  const entries = Object.entries(scene.wallFinishes ?? {}).filter(
    ([key]) => key !== id
  );
  if (Object.keys(next).length) entries.push([id, next]);
  const result: WorldScene = { ...scene, version: 7 };
  if (entries.length) result.wallFinishes = Object.fromEntries(entries);
  else delete result.wallFinishes;
  return result;
}
export function pruneWallFinishes(
  scene: WorldScene,
  wallIds: ReadonlySet<string>
): WorldScene {
  if (!scene.wallFinishes) return scene;
  const entries = Object.entries(scene.wallFinishes);
  const kept = entries.filter(([id]) => wallIds.has(id));
  if (kept.length === entries.length) return scene;
  const next = { ...scene };
  if (kept.length) next.wallFinishes = Object.fromEntries(kept);
  else delete next.wallFinishes;
  return next;
}
