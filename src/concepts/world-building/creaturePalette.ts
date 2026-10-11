import { parseRef } from '@/utils/refs';
import { objectShape, rejectUnknownKeys } from './strictShape';
import type { WorldScene } from './types';

/** Editor palette recipe, not a live actor or an additional stat block. */
export interface CreaturePaletteEntry {
  id: string;
  name: string;
  ref: string;
  modelRef: string;
}
export function validateCreaturePalette(
  value: unknown
): CreaturePaletteEntry[] {
  if (!Array.isArray(value))
    throw new Error('scene.creaturePalette must be a list.');
  const ids = new Set<string>();
  return value.map((item, index) => {
    const path = `scene.creaturePalette[${index}]`;
    const entry = objectShape(item, path);
    rejectUnknownKeys(entry, ['id', 'name', 'ref', 'modelRef'], path);
    for (const key of ['id', 'name'] as const) {
      if (
        typeof entry[key] !== 'string' ||
        !entry[key].trim() ||
        entry[key].length > 120
      )
        throw new Error(
          `${path}.${key} must be nonblank text up to 120 characters.`
        );
    }
    const id = entry.id as string;
    if (ids.has(id)) throw new Error(`${path}.id is duplicated.`);
    ids.add(id);
    if (
      typeof entry.ref !== 'string' ||
      parseRef(entry.ref)?.type !== 'monsters'
    )
      throw new Error(`${path}.ref must be a monster reference.`);
    if (typeof entry.modelRef !== 'string' || !parseRef(entry.modelRef))
      throw new Error(`${path}.modelRef must be an appearance reference.`);
    return {
      id,
      name: entry.name as string,
      ref: entry.ref,
      modelRef: entry.modelRef,
    };
  });
}
export function setCreaturePalette(
  scene: WorldScene,
  entries: readonly CreaturePaletteEntry[]
): WorldScene {
  const valid = validateCreaturePalette(entries);
  if (JSON.stringify(valid) === JSON.stringify(scene.creaturePalette ?? []))
    return scene;
  const next: WorldScene = { ...scene, version: 5 };
  if (valid.length) next.creaturePalette = valid;
  else delete next.creaturePalette;
  return next;
}
